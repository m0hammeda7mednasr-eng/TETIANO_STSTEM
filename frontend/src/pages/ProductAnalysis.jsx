import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BarChart3,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import OrderInsightsFilterBar from "../components/OrderInsightsFilterBar";
import { productAnalysisAPI } from "../utils/api";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent as formatLocalePercent,
} from "../utils/helpers";
import { extractArray, extractObject } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import {
  buildOrderScopeApiParams,
  hasActiveOrderScopeFilters,
  INITIAL_ORDER_SCOPE_FILTERS,
} from "../utils/orderScope";

const EMPTY_SUMMARY = {
  total_products: 0,
  total_variants: 0,
  ordered_quantity: 0,
  delivered_quantity: 0,
  net_delivered_quantity: 0,
  returned_quantity: 0,
  pending_quantity: 0,
  cancelled_quantity: 0,
  gross_sales: 0,
  net_sales: 0,
  related_tasks_count: 0,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatCount = (value) =>
  formatNumber(value, { maximumFractionDigits: 0 });
const formatPercent = (value) =>
  formatLocalePercent(Math.max(0, toNumber(value)), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const normalizeSummary = (summary) =>
  Object.fromEntries(
    Object.keys(EMPTY_SUMMARY).map((key) => [key, toNumber(summary?.[key])]),
  );

const matchesSearch = (product, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) return true;
  const variantText = (product?.variants || [])
    .map((variant) => `${variant?.title || ""} ${variant?.sku || ""}`)
    .join(" ");
  return [product?.title, product?.sku, product?.vendor, product?.product_type, variantText]
    .some((value) => String(value || "").toLowerCase().includes(normalized));
};

const matchesFilter = (product, filter) => {
  if (filter === "attention") {
    return (
      toNumber(product?.returned_quantity) > 0 ||
      toNumber(product?.pending_quantity) > 0 ||
      toNumber(product?.cancelled_quantity) > 0
    );
  }
  if (filter === "returns") return toNumber(product?.returned_quantity) > 0;
  if (filter === "pending") {
    return (
      toNumber(product?.pending_quantity) > 0 ||
      toNumber(product?.cancelled_quantity) > 0
    );
  }
  if (filter === "tasks") return toNumber(product?.related_tasks_count) > 0;
  return true;
};

const isProductAnalysisRelatedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  return (
    !source ||
    source.includes("/product-analysis") ||
    source.includes("/shopify/orders") ||
    source.includes("/shopify/products") ||
    source.includes("/tasks")
  );
};

const buildCompletionRate = (record) => {
  const ordered = toNumber(record?.ordered_quantity);
  return ordered > 0
    ? Math.min(100, Math.max(0, (toNumber(record?.net_delivered_quantity) / ordered) * 100))
    : 0;
};
const buildReturnRate = (record) => {
  const deliveredBase = Math.max(
    toNumber(record?.delivered_quantity),
    toNumber(record?.net_delivered_quantity) + toNumber(record?.returned_quantity),
  );
  return deliveredBase > 0
    ? Math.min(100, Math.max(0, (toNumber(record?.returned_quantity) / deliveredBase) * 100))
    : 0;
};
const buildOpenRate = (record) => {
  const ordered = toNumber(record?.ordered_quantity);
  return ordered > 0
    ? Math.min(
        100,
        Math.max(
          0,
          ((toNumber(record?.pending_quantity) + toNumber(record?.cancelled_quantity)) /
            ordered) *
            100,
        ),
      )
    : 0;
};
const hasVariantResult = (entry) =>
  toNumber(entry?.ordered_quantity) > 0 ||
  toNumber(entry?.delivered_quantity) > 0 ||
  toNumber(entry?.net_delivered_quantity) > 0 ||
  toNumber(entry?.returned_quantity) > 0 ||
  toNumber(entry?.pending_quantity) > 0 ||
  toNumber(entry?.cancelled_quantity) > 0 ||
  toNumber(entry?.net_sales) > 0 ||
  toNumber(entry?.gross_sales) > 0 ||
  toNumber(entry?.related_tasks_count) > 0;
const countRelevantVariants = (variants = []) => {
  const list = Array.isArray(variants) ? variants : [];
  const activeCount = list.reduce(
    (total, variant) => total + (hasVariantResult(variant) ? 1 : 0),
    0,
  );
  return activeCount > 0 ? activeCount : list.length;
};
const getVariantDisplayTitle = (product, variant) => {
  const title = String(variant?.title || "").trim();
  return !title || title === "Default Title" || title === product?.title
    ? "الافتراضي"
    : title;
};
const getSortedVariants = (variants) =>
  [...(Array.isArray(variants) ? variants : [])].sort((left, right) => {
    const orderedDelta = toNumber(right?.ordered_quantity) - toNumber(left?.ordered_quantity);
    if (orderedDelta !== 0) return orderedDelta;
    const salesDelta = toNumber(right?.net_sales) - toNumber(left?.net_sales);
    if (salesDelta !== 0) return salesDelta;
    return String(left?.title || "").localeCompare(String(right?.title || ""), "ar");
  });

export default function ProductAnalysis() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [storeSummary, setStoreSummary] = useState(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [scopeFilters, setScopeFilters] = useState(INITIAL_ORDER_SCOPE_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const scopeParams = useMemo(() => buildOrderScopeApiParams(scopeFilters), [scopeFilters]);
  const hasScopedOrderFilters = useMemo(
    () => hasActiveOrderScopeFilters(scopeFilters),
    [scopeFilters],
  );
  const hasLocalCriteria =
    filterMode !== "all" || String(deferredSearchTerm || "").trim().length > 0;

  const fetchAnalysis = useCallback(
    async ({ forceRefresh = false, silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const response = await productAnalysisAPI.get({
          ...scopeParams,
          refresh: forceRefresh ? "true" : "false",
        });
        const payload = extractObject(response?.data);
        setProducts(extractArray(payload?.data || payload));
        setStoreSummary(normalizeSummary(payload?.summary));
        setMeta(payload?.meta || {});
      } catch (requestError) {
        console.error("Error fetching product analysis:", requestError);
        setError(requestError?.response?.data?.error || "فشل تحميل تحليل المنتجات");
      } finally {
        setLoading(false);
      }
    },
    [scopeParams],
  );

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (isProductAnalysisRelatedUpdate(event)) {
        fetchAnalysis({ silent: true });
      }
    });
    return () => unsubscribe();
  }, [fetchAnalysis]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          matchesSearch(product, deferredSearchTerm) &&
          matchesFilter(product, filterMode),
      ),
    [products, deferredSearchTerm, filterMode],
  );

  const filteredSummary = useMemo(
    () =>
      filteredProducts.reduce(
        (acc, product) => {
          acc.total_products += 1;
          acc.total_variants += countRelevantVariants(product?.variants);
          acc.ordered_quantity += toNumber(product?.ordered_quantity);
          acc.delivered_quantity += toNumber(product?.delivered_quantity);
          acc.net_delivered_quantity += toNumber(product?.net_delivered_quantity);
          acc.returned_quantity += toNumber(product?.returned_quantity);
          acc.pending_quantity += toNumber(product?.pending_quantity);
          acc.cancelled_quantity += toNumber(product?.cancelled_quantity);
          acc.gross_sales += toNumber(product?.gross_sales);
          acc.net_sales += toNumber(product?.net_sales);
          acc.related_tasks_count += toNumber(product?.related_tasks_count);
          return acc;
        },
        { ...EMPTY_SUMMARY },
      ),
    [filteredProducts],
  );

  const activeSummary = hasLocalCriteria ? filteredSummary : storeSummary;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
                  <BarChart3 className="text-sky-700" size={28} />
                  تحليل المنتجات
                </h1>
                <p className="mt-1 text-slate-600">
                  تحليل المبيعات والتسليم والمرتجعات لكل منتج وفاريانت داخل المتجر الحالي.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge>{`آخر تحديث ${formatDateTime(meta?.generated_at)}`}</Badge>
                  <Badge tone={hasScopedOrderFilters || meta?.order_scope_active ? "sky" : "slate"}>
                    {hasScopedOrderFilters || meta?.order_scope_active ? "النطاق الحالي مفلتر" : "عرض شامل للمتجر"}
                  </Badge>
                  <Badge tone={meta?.task_metrics_available ? "emerald" : "amber"}>
                    {meta?.task_metrics_available ? "المهام مربوطة عبر SKU" : "بيانات المهام غير متاحة"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ActionButton onClick={() => fetchAnalysis()} icon={RefreshCw}>
                  تحديث
                </ActionButton>
                <ActionButton onClick={() => fetchAnalysis({ forceRefresh: true })} dark icon={RotateCcw}>
                  تحديث كامل
                </ActionButton>
              </div>
            </div>
          </section>

          <OrderInsightsFilterBar
            filters={scopeFilters}
            onChange={setScopeFilters}
            onReset={() => setScopeFilters(INITIAL_ORDER_SCOPE_FILTERS)}
            title="فلترة نطاق الطلبات"
            description="هذا النطاق يحدد الطلبات التي تدخل في حساب أرقام تحليل المنتجات."
          />

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <SummaryCard
              title="المنتجات"
              value={formatCount(activeSummary.total_products)}
              subtitle={
                hasLocalCriteria
                  ? `${formatCount(filteredProducts.length)} من ${formatCount(products.length)} منتج`
                  : hasScopedOrderFilters
                    ? "منتجات داخل نطاق الطلبات الحالي"
                    : "كل منتجات المتجر"
              }
              tone="blue"
            />
            <SummaryCard title="الفاريانت" value={formatCount(activeSummary.total_variants)} subtitle="إجمالي المتغيرات المرتبطة بالنتائج الحالية" tone="sky" />
            <SummaryCard title="صافي التسليم" value={formatCount(activeSummary.net_delivered_quantity)} subtitle={`${formatPercent(buildCompletionRate(activeSummary))} من المطلوب`} tone="emerald" />
            <SummaryCard title="صافي المبيعات" value={formatCurrency(activeSummary.net_sales)} subtitle={`الإجمالي ${formatCurrency(activeSummary.gross_sales)}`} tone="blue" />
            <SummaryCard title="مرتجعات" value={formatCount(activeSummary.returned_quantity)} subtitle={`${formatPercent(buildReturnRate(activeSummary))} من المُسلَّم`} tone="rose" />
            <SummaryCard title="معلق / ملغي" value={`${formatCount(activeSummary.pending_quantity)} / ${formatCount(activeSummary.cancelled_quantity)}`} subtitle={`${formatPercent(buildOpenRate(activeSummary))} من المطلوب`} tone="amber" />
            <SummaryCard title="الوحدات المطلوبة" value={formatCount(activeSummary.ordered_quantity)} subtitle="إجمالي الكميات على الطلبات" tone="slate" />
            <SummaryCard title="مهام SKU" value={formatCount(activeSummary.related_tasks_count)} subtitle="مرتبطة بالمنتجات عبر SKU" tone="sky" />
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">قائمة التحليل</h2>
                <p className="text-sm text-slate-500">الأرقام التالية تعكس صافي المبيعات بعد خصم الاسترجاعات ومراعاة حالة كل طلب.</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="ابحث باسم المنتج أو SKU أو الفاريانت"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["all", "الكل"],
                    ["attention", "يحتاج متابعة"],
                    ["returns", "مرتجعات"],
                    ["pending", "معلق"],
                    ["tasks", "له مهام"],
                  ].map(([id, label]) => (
                    <FilterButton key={id} active={filterMode === id} label={label} onClick={() => setFilterMode(id)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              عرض {formatCount(filteredProducts.length)} منتج من أصل {formatCount(products.length)}.
              {meta?.filtered_orders_count !== undefined ? (
                <span className="mr-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {meta?.applied_orders_limit ? (
                    <>
                      تحليل آخر {formatCount(meta.filtered_orders_count)} طلب
                      {meta?.total_orders_in_scope !== undefined
                        ? ` من أصل ${formatCount(meta.total_orders_in_scope)}`
                        : ""}
                      {" "}داخل النطاق الحالي
                    </>
                  ) : (
                    <>
                      {formatCount(meta.filtered_orders_count)} طلب داخل النطاق الحالي
                    </>
                  )}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                جاري تحميل تحليل المنتجات...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                {hasScopedOrderFilters
                  ? "لا توجد منتجات داخل هذا النطاق. جرّب توسيع الفلاتر أو تغيير الحالة."
                  : "لا توجد منتجات مطابقة للبحث أو الفلتر الحالي."}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProducts.map((product) => {
                  const sortedVariants = getSortedVariants(product?.variants);
                  return (
                    <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => navigate(`/products/${product.id}`)} className="text-right text-xl font-semibold text-slate-900 hover:text-sky-700">
                              {product.title}
                            </button>
                            <Badge>{`${formatCount(countRelevantVariants(sortedVariants))} فاريانت`}</Badge>
                            {toNumber(product.returned_quantity) > 0 ? <Badge tone="rose">{`مرتجع ${formatCount(product.returned_quantity)}`}</Badge> : null}
                            {toNumber(product.pending_quantity) > 0 ? <Badge tone="amber">{`معلق ${formatCount(product.pending_quantity)}`}</Badge> : null}
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            SKU: {product.sku || "-"} • المورد: {product.vendor || "-"} • النوع: {product.product_type || "-"} • المخزون: {formatCount(product.inventory_quantity)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">آخر نشاط: {formatDateTime(product.last_task_at || product.last_return_at || product.last_fulfillment_at || product.last_order_at)}</p>
                        </div>
                        <div className="text-right text-sm text-slate-600">
                          <p>معدل التسليم: <span className="font-semibold text-slate-900">{formatPercent(buildCompletionRate(product))}</span></p>
                          <p>ما لم يكتمل: <span className="font-semibold text-slate-900">{formatPercent(buildOpenRate(product))}</span></p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <MetricTile label="مطلوب" value={formatCount(product.ordered_quantity)} hint="كل الوحدات على الطلبات" />
                        <MetricTile label="تم تسليمه" value={formatCount(product.delivered_quantity)} hint="قبل خصم المرتجع" />
                        <MetricTile label="صافي التسليم" value={formatCount(product.net_delivered_quantity)} hint={`${formatPercent(buildCompletionRate(product))} من المطلوب`} tone="emerald" />
                        <MetricTile label="مرتجعات" value={formatCount(product.returned_quantity)} hint={`${formatPercent(buildReturnRate(product))} من المُسلَّم`} tone="rose" />
                        <MetricTile label="المبيعات" value={formatCurrency(product.net_sales)} hint={`الإجمالي ${formatCurrency(product.gross_sales)}`} tone="blue" />
                        <MetricTile label="مهام SKU" value={formatCount(product.related_tasks_count)} hint="مرتبطة عبر SKU" />
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-right text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600">
                              <th className="px-3 py-2 font-semibold">الفاريانت</th>
                              <th className="px-3 py-2 font-semibold">SKU</th>
                              <th className="px-3 py-2 font-semibold">المخزون</th>
                              <th className="px-3 py-2 font-semibold">مطلوب</th>
                              <th className="px-3 py-2 font-semibold">صافي التسليم</th>
                              <th className="px-3 py-2 font-semibold">مرتجع</th>
                              <th className="px-3 py-2 font-semibold">معلق</th>
                              <th className="px-3 py-2 font-semibold">ملغي</th>
                              <th className="px-3 py-2 font-semibold">الطلبات</th>
                              <th className="px-3 py-2 font-semibold">صافي المبيعات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedVariants.map((variant) => (
                              <tr key={`${product.id}-${variant.id}-${variant.sku}`} className="border-t border-slate-200">
                                <td className="px-3 py-2 font-medium text-slate-900">{getVariantDisplayTitle(product, variant)}</td>
                                <td className="px-3 py-2 text-slate-700">{variant.sku || "-"}</td>
                                <td className="px-3 py-2">{formatCount(variant.inventory_quantity)}</td>
                                <td className="px-3 py-2">{formatCount(variant.ordered_quantity)}</td>
                                <td className="px-3 py-2">{formatCount(variant.net_delivered_quantity)}</td>
                                <td className="px-3 py-2 text-rose-700">{formatCount(variant.returned_quantity)}</td>
                                <td className="px-3 py-2 text-amber-700">{formatCount(variant.pending_quantity)}</td>
                                <td className="px-3 py-2">{formatCount(variant.cancelled_quantity)}</td>
                                <td className="px-3 py-2">{formatCount(variant.orders_count)}</td>
                                <td className="px-3 py-2 font-medium text-slate-900">{formatCurrency(variant.net_sales)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ActionButton({ children, dark = false, icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-white ${
        dark ? "bg-slate-900 hover:bg-slate-950" : "bg-sky-700 hover:bg-sky-800"
      }`}
    >
      <Icon size={18} />
      {children}
    </button>
  );
}

function SummaryCard({ title, value, subtitle, tone = "blue" }) {
  const tones = {
    blue: "border-sky-100 bg-sky-50",
    sky: "border-cyan-100 bg-cyan-50",
    slate: "border-slate-200 bg-slate-50",
    emerald: "border-emerald-100 bg-emerald-50",
    rose: "border-rose-100 bg-rose-50",
    amber: "border-amber-100 bg-amber-50",
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.blue}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function FilterButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function MetricTile({ label, value, hint, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white",
    blue: "border-sky-100 bg-sky-50/70",
    emerald: "border-emerald-100 bg-emerald-50/70",
    rose: "border-rose-100 bg-rose-50/70",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-100 text-rose-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}
