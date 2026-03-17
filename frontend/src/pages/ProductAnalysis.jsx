import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { productAnalysisAPI } from "../utils/api";
import { formatCurrency, formatDateTime } from "../utils/helpers";
import { extractArray, extractObject } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const EMPTY_SUMMARY = {
  total_products: 0,
  total_variants: 0,
  ordered_quantity: 0,
  delivered_quantity: 0,
  returned_quantity: 0,
  pending_quantity: 0,
  cancelled_quantity: 0,
  gross_sales: 0,
  net_sales: 0,
  related_tasks_count: 0,
};

const matchesSearch = (product, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const variantText = (product?.variants || [])
    .map((variant) => `${variant?.title || ""} ${variant?.sku || ""}`)
    .join(" ");

  return [
    product?.title,
    product?.sku,
    product?.vendor,
    product?.product_type,
    variantText,
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
};

const matchesFilter = (product, filter) => {
  if (filter === "attention") {
    return (
      toNumber(product?.returned_quantity) > 0 ||
      toNumber(product?.pending_quantity) > 0 ||
      toNumber(product?.cancelled_quantity) > 0
    );
  }

  if (filter === "returns") {
    return toNumber(product?.returned_quantity) > 0;
  }

  if (filter === "pending") {
    return toNumber(product?.pending_quantity) > 0;
  }

  if (filter === "tasks") {
    return toNumber(product?.related_tasks_count) > 0;
  }

  return true;
};

const isProductAnalysisRelatedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return (
    source.includes("/product-analysis") ||
    source.includes("/shopify/orders") ||
    source.includes("/shopify/products") ||
    source.includes("/tasks")
  );
};

const getProductCardClassName = (product) => {
  if (toNumber(product?.returned_quantity) > 0) {
    return "border-rose-200 bg-rose-50";
  }

  if (toNumber(product?.pending_quantity) > 0) {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-white";
};

const buildCompletionRate = (product) => {
  const ordered = toNumber(product?.ordered_quantity);
  if (ordered <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (toNumber(product?.delivered_quantity) / ordered) * 100),
  );
};

export default function ProductAnalysis() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const fetchAnalysis = useCallback(async ({ forceRefresh = false, silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await productAnalysisAPI.get({
        refresh: forceRefresh ? "true" : "false",
      });
      const payload = extractObject(response?.data);
      setProducts(extractArray(payload));
      setMeta(payload?.meta || {});
    } catch (requestError) {
      console.error("Error fetching product analysis:", requestError);
      setError(
        requestError?.response?.data?.error || "فشل تحميل تحليل المنتجات",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (!isProductAnalysisRelatedUpdate(event)) {
        return;
      }

      fetchAnalysis({ silent: true });
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
          acc.total_variants += (product?.variants || []).length;
          acc.ordered_quantity += toNumber(product?.ordered_quantity);
          acc.delivered_quantity += toNumber(product?.delivered_quantity);
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

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <BarChart3 className="text-sky-700" size={28} />
                  تحليل المنتجات
                </h1>
                <p className="text-slate-600 mt-1">
                  تحليل كل Product وكل Variant حسب الطلبات والتسليمات والمرتجعات، مع مطابقة مهام الـ SKU عندما تكون متاحة.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    <Clock3 size={12} />
                    آخر تحديث {formatDateTime(meta?.generated_at)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    <Package size={12} />
                    المتجر الحالي فقط
                  </span>
                  {meta?.task_metrics_available ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={12} />
                      المهام محسوبة عبر SKU
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle size={12} />
                      المهام غير متاحة في هذه البيئة
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchAnalysis()}
                  className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw size={18} />
                  تحديث
                </button>
                <button
                  onClick={() => fetchAnalysis({ forceRefresh: true })}
                  className="bg-slate-900 hover:bg-slate-950 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <RotateCcw size={18} />
                  تحديث كامل
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <SummaryCard
              title="المنتجات"
              value={filteredSummary.total_products.toLocaleString("ar-EG")}
              tone="blue"
              icon={Package}
            />
            <SummaryCard
              title="الفاريانت"
              value={filteredSummary.total_variants.toLocaleString("ar-EG")}
              tone="sky"
              icon={ShoppingCart}
            />
            <SummaryCard
              title="تم تسليمه"
              value={filteredSummary.delivered_quantity.toLocaleString("ar-EG")}
              tone="emerald"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="مرتجعات"
              value={filteredSummary.returned_quantity.toLocaleString("ar-EG")}
              tone="rose"
              icon={RotateCcw}
            />
            <SummaryCard
              title="معلق / لم يكتمل"
              value={filteredSummary.pending_quantity.toLocaleString("ar-EG")}
              tone="amber"
              icon={Clock3}
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  قائمة التحليل
                </h2>
                <p className="text-sm text-slate-500">
                  الرقم المالي الظاهر هنا هو صافي المبيعات الموزع على المنتج بعد مراعاة حالة الطلب والمرتجعات.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                <div className="relative w-full sm:w-80">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="ابحث باسم المنتج أو SKU أو الفاريانت"
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterButton
                    active={filterMode === "all"}
                    label="الكل"
                    onClick={() => setFilterMode("all")}
                  />
                  <FilterButton
                    active={filterMode === "attention"}
                    label="يحتاج متابعة"
                    onClick={() => setFilterMode("attention")}
                  />
                  <FilterButton
                    active={filterMode === "returns"}
                    label="مرتجعات"
                    onClick={() => setFilterMode("returns")}
                  />
                  <FilterButton
                    active={filterMode === "pending"}
                    label="معلق"
                    onClick={() => setFilterMode("pending")}
                  />
                  <FilterButton
                    active={filterMode === "tasks"}
                    label="له مهام"
                    onClick={() => setFilterMode("tasks")}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                جاري تحميل تحليل المنتجات...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                لا توجد منتجات مطابقة للبحث أو الفلتر الحالي.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProducts.map((product) => (
                  <article
                    key={product.id}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${getProductCardClassName(product)}`}
                  >
                    <div className="flex flex-col 2xl:flex-row 2xl:items-start 2xl:justify-between gap-4">
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => navigate(`/products/${product.id}`)}
                            className="text-xl font-semibold text-slate-900 hover:text-sky-700 text-right"
                          >
                            {product.title}
                          </button>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700">
                            {product.variants_count.toLocaleString("ar-EG")} فاريانت
                          </span>
                          {toNumber(product.returned_quantity) > 0 && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-rose-200 bg-rose-100 text-xs font-semibold text-rose-700">
                              مرتجع {toNumber(product.returned_quantity).toLocaleString("ar-EG")}
                            </span>
                          )}
                          {toNumber(product.pending_quantity) > 0 && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-amber-200 bg-amber-100 text-xs font-semibold text-amber-700">
                              معلق {toNumber(product.pending_quantity).toLocaleString("ar-EG")}
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                          <span>SKU الأساسي: {product.sku || "-"}</span>
                          <span>المورد: {product.vendor || "-"}</span>
                          <span>النوع: {product.product_type || "-"}</span>
                          <span>رصيد المخزون الحالي: {toNumber(product.inventory_quantity).toLocaleString("ar-EG")}</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                          <MetricTile
                            label="مطلوب"
                            value={toNumber(product.ordered_quantity).toLocaleString("ar-EG")}
                          />
                          <MetricTile
                            label="تم تسليمه"
                            value={toNumber(product.delivered_quantity).toLocaleString("ar-EG")}
                          />
                          <MetricTile
                            label="صافي التسليم"
                            value={toNumber(product.net_delivered_quantity).toLocaleString("ar-EG")}
                          />
                          <MetricTile
                            label="مرتجعات"
                            value={toNumber(product.returned_quantity).toLocaleString("ar-EG")}
                          />
                          <MetricTile
                            label="المبيعات"
                            value={formatCurrency(product.net_sales)}
                          />
                          <MetricTile
                            label="مهام SKU"
                            value={toNumber(product.related_tasks_count).toLocaleString("ar-EG")}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 xl:grid-cols-1 gap-3 xl:min-w-[16rem] text-sm">
                        <InfoBox
                          label="معدل التسليم"
                          value={`${buildCompletionRate(product).toFixed(1)}%`}
                        />
                        <InfoBox
                          label="آخر طلب"
                          value={formatDateTime(product.last_order_at)}
                        />
                        <InfoBox
                          label="آخر تسليم"
                          value={formatDateTime(product.last_fulfillment_at)}
                        />
                        <InfoBox
                          label="آخر مرتجع"
                          value={formatDateTime(product.last_return_at)}
                        />
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-sm text-right">
                        <thead>
                          <tr className="bg-white/80 text-slate-600">
                            <th className="px-3 py-2 font-semibold">الفاريانت</th>
                            <th className="px-3 py-2 font-semibold">SKU</th>
                            <th className="px-3 py-2 font-semibold">المخزون</th>
                            <th className="px-3 py-2 font-semibold">مطلوب</th>
                            <th className="px-3 py-2 font-semibold">تم تسليمه</th>
                            <th className="px-3 py-2 font-semibold">مرتجع</th>
                            <th className="px-3 py-2 font-semibold">معلق</th>
                            <th className="px-3 py-2 font-semibold">ملغي</th>
                            <th className="px-3 py-2 font-semibold">الطلبات</th>
                            <th className="px-3 py-2 font-semibold">صافي المبيعات</th>
                            <th className="px-3 py-2 font-semibold">مهام SKU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(product.variants || []).map((variant) => (
                            <tr key={`${product.id}-${variant.id}-${variant.sku}`} className="border-t border-slate-200/70">
                              <td className="px-3 py-2 text-slate-900 font-medium">
                                {variant.title || "Default"}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {variant.sku || "-"}
                              </td>
                              <td className="px-3 py-2">
                                {toNumber(variant.inventory_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2">
                                {toNumber(variant.ordered_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2">
                                {toNumber(variant.delivered_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2 text-rose-700">
                                {toNumber(variant.returned_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2 text-amber-700">
                                {toNumber(variant.pending_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {toNumber(variant.cancelled_quantity).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2">
                                {toNumber(variant.orders_count).toLocaleString("ar-EG")}
                              </td>
                              <td className="px-3 py-2">
                                {formatCurrency(variant.net_sales)}
                              </td>
                              <td className="px-3 py-2">
                                {toNumber(variant.related_tasks_count).toLocaleString("ar-EG")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ title, value, tone, icon: Icon }) {
  const tones = {
    blue: "bg-sky-50 text-sky-700 border-sky-100",
    sky: "bg-cyan-50 text-cyan-700 border-cyan-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.blue}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function FilterButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
        active
          ? "bg-sky-700 text-white border-sky-700"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-2">{value}</div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-2">{value}</div>
    </div>
  );
}
