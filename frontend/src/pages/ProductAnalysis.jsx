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

const formatCount = (value) => toNumber(value).toLocaleString("ar-EG");

const formatPercent = (value) =>
  `${Math.max(0, toNumber(value)).toLocaleString("ar-EG", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

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

const normalizeSummary = (summary) => ({
  total_products: toNumber(summary?.total_products),
  total_variants: toNumber(summary?.total_variants),
  ordered_quantity: toNumber(summary?.ordered_quantity),
  delivered_quantity: toNumber(summary?.delivered_quantity),
  net_delivered_quantity: toNumber(summary?.net_delivered_quantity),
  returned_quantity: toNumber(summary?.returned_quantity),
  pending_quantity: toNumber(summary?.pending_quantity),
  cancelled_quantity: toNumber(summary?.cancelled_quantity),
  gross_sales: toNumber(summary?.gross_sales),
  net_sales: toNumber(summary?.net_sales),
  related_tasks_count: toNumber(summary?.related_tasks_count),
});

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
    return (
      toNumber(product?.pending_quantity) > 0 ||
      toNumber(product?.cancelled_quantity) > 0
    );
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

const getLatestTimestamp = (...values) => {
  let latestValue = null;
  let latestTime = 0;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const parsedTime = new Date(value).getTime();
    if (!Number.isFinite(parsedTime) || parsedTime <= latestTime) {
      continue;
    }

    latestTime = parsedTime;
    latestValue = value;
  }

  return latestValue;
};

const getLastActivityAt = (record) =>
  getLatestTimestamp(
    record?.last_task_at,
    record?.last_return_at,
    record?.last_fulfillment_at,
    record?.last_order_at,
    record?.updated_at,
    record?.last_synced_at,
    record?.created_at,
  );

const buildCompletionRate = (record) => {
  const ordered = toNumber(record?.ordered_quantity);
  if (ordered <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (toNumber(record?.net_delivered_quantity) / ordered) * 100),
  );
};

const buildReturnRate = (record) => {
  const deliveredBase = Math.max(
    toNumber(record?.delivered_quantity),
    toNumber(record?.net_delivered_quantity) + toNumber(record?.returned_quantity),
  );
  if (deliveredBase <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (toNumber(record?.returned_quantity) / deliveredBase) * 100),
  );
};

const buildOpenRate = (record) => {
  const ordered = toNumber(record?.ordered_quantity);
  if (ordered <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      ((toNumber(record?.pending_quantity) + toNumber(record?.cancelled_quantity)) /
        ordered) *
        100,
    ),
  );
};

const getProductCardClassName = (product) => {
  if (
    toNumber(product?.cancelled_quantity) > 0 ||
    buildReturnRate(product) >= 25
  ) {
    return "border-rose-200 bg-rose-50/70";
  }

  if (
    toNumber(product?.pending_quantity) > 0 ||
    toNumber(product?.related_tasks_count) > 0
  ) {
    return "border-amber-200 bg-amber-50/70";
  }

  return "border-slate-200 bg-white";
};

const getVariantRowClassName = (variant) => {
  if (
    toNumber(variant?.cancelled_quantity) > 0 ||
    buildReturnRate(variant) >= 25
  ) {
    return "bg-rose-50/70";
  }

  if (
    toNumber(variant?.pending_quantity) > 0 ||
    toNumber(variant?.related_tasks_count) > 0
  ) {
    return "bg-amber-50/70";
  }

  return "bg-white";
};

const getVariantDisplayTitle = (product, variant) => {
  const title = String(variant?.title || "").trim();
  if (!title || title === "Default Title" || title === product?.title) {
    return "الافتراضي";
  }

  return title;
};

const getSortedVariants = (variants) =>
  [...(Array.isArray(variants) ? variants : [])].sort((left, right) => {
    const orderedDelta =
      toNumber(right?.ordered_quantity) - toNumber(left?.ordered_quantity);
    if (orderedDelta !== 0) {
      return orderedDelta;
    }

    const salesDelta = toNumber(right?.net_sales) - toNumber(left?.net_sales);
    if (salesDelta !== 0) {
      return salesDelta;
    }

    return String(left?.title || "").localeCompare(String(right?.title || ""), "ar");
  });

export default function ProductAnalysis() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [storeSummary, setStoreSummary] = useState(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = String(deferredSearchTerm || "").trim();
  const hasActiveCriteria = filterMode !== "all" || normalizedSearchTerm.length > 0;

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
      setStoreSummary(normalizeSummary(payload?.summary));
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

  const activeSummary = hasActiveCriteria ? filteredSummary : storeSummary;

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

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:grid-cols-3">
            <InsightBanner
              label="نطاق الأرقام"
              value={
                hasActiveCriteria
                  ? "الأرقام الحالية تخص النتائج بعد البحث أو الفلترة"
                  : "الأرقام الحالية تخص إجمالي المتجر"
              }
            />
            <InsightBanner
              label="تعريف صافي التسليم"
              value="تم تسليمه فعليًا بعد خصم المرتجع"
            />
            <InsightBanner
              label="المبيعات الصافية"
              value="تعتمد على الوحدات غير الملغاة وغير المرتجعة"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <SummaryCard
              title="المنتجات"
              value={formatCount(activeSummary.total_products)}
              subtitle={
                hasActiveCriteria
                  ? `${formatCount(filteredProducts.length)} من ${formatCount(products.length)} منتج`
                  : "كل منتجات المتجر الحالي"
              }
              tone="blue"
              icon={Package}
            />
            <SummaryCard
              title="الفاريانت"
              value={formatCount(activeSummary.total_variants)}
              subtitle="إجمالي المتغيرات المرتبطة بالنتائج الحالية"
              tone="sky"
              icon={ShoppingCart}
            />
            <SummaryCard
              title="تم تسليمه"
              value={formatCount(activeSummary.delivered_quantity)}
              subtitle="إجمالي ما تم تسليمه قبل خصم المرتجع"
              tone="emerald"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="مرتجعات"
              value={formatCount(activeSummary.returned_quantity)}
              subtitle={`${formatPercent(buildReturnRate(activeSummary))} من المُسلَّم`}
              tone="rose"
              icon={RotateCcw}
            />
            <SummaryCard
              title="معلق / لم يكتمل"
              value={`${formatCount(activeSummary.pending_quantity)} / ${formatCount(activeSummary.cancelled_quantity)}`}
              subtitle={`${formatPercent(buildOpenRate(activeSummary))} من المطلوب لم يكتمل`}
              tone="amber"
              icon={Clock3}
            />
            <SummaryCard
              title="الوحدات المطلوبة"
              value={formatCount(activeSummary.ordered_quantity)}
              subtitle="كل الكميات التي دخلت على الطلبات"
              tone="slate"
              icon={BarChart3}
            />
            <SummaryCard
              title="صافي التسليم"
              value={formatCount(activeSummary.net_delivered_quantity)}
              subtitle={`${formatPercent(buildCompletionRate(activeSummary))} من المطلوب`}
              tone="emerald"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="صافي المبيعات"
              value={formatCurrency(activeSummary.net_sales)}
              subtitle={`الإجمالي ${formatCurrency(activeSummary.gross_sales)}`}
              tone="blue"
              icon={BarChart3}
            />
            <SummaryCard
              title="مهام SKU"
              value={formatCount(activeSummary.related_tasks_count)}
              subtitle="عدد المهام المرتبطة بالمنتجات عبر SKU"
              tone="sky"
              icon={AlertCircle}
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              عرض {formatCount(filteredProducts.length)} منتج من أصل{" "}
              {formatCount(products.length)}.
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
                {filteredProducts.map((product) => {
                  const lastActivityAt = getLastActivityAt(product);
                  const sortedVariants = getSortedVariants(product?.variants);

                  return (
                  <article
                    key={product.id}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${getProductCardClassName(product)}`}
                  >
                    <div className="flex flex-col 2xl:flex-row 2xl:items-start 2xl:justify-between gap-4">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <ProductThumbnail src={product?.image_url} title={product?.title} />
                        <div className="space-y-3 min-w-0 flex-1">
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

                        <div className="text-xs text-slate-500">
                          آخر نشاط: {formatDateTime(lastActivityAt)}
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                          <MetricTile
                            label="مطلوب"
                            value={formatCount(product.ordered_quantity)}
                            hint="كل الوحدات على الطلبات"
                          />
                          <MetricTile
                            label="تم تسليمه"
                            value={formatCount(product.delivered_quantity)}
                            hint="قبل خصم المرتجع"
                          />
                          <MetricTile
                            label="صافي التسليم"
                            value={formatCount(product.net_delivered_quantity)}
                            hint={`${formatPercent(buildCompletionRate(product))} من المطلوب`}
                            tone="emerald"
                          />
                          <MetricTile
                            label="مرتجعات"
                            value={formatCount(product.returned_quantity)}
                            hint={`${formatPercent(buildReturnRate(product))} من المُسلَّم`}
                            tone="rose"
                          />
                          <MetricTile
                            label="المبيعات"
                            value={formatCurrency(product.net_sales)}
                            hint={`الإجمالي ${formatCurrency(product.gross_sales)}`}
                            tone="blue"
                          />
                          <MetricTile
                            label="مهام SKU"
                            value={formatCount(product.related_tasks_count)}
                            hint="مرتبطة عبر SKU"
                          />
                        </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 xl:grid-cols-1 gap-3 xl:min-w-[16rem] text-sm">
                        <InfoBox
                          label="معدل التسليم"
                          value={formatPercent(buildCompletionRate(product))}
                          hint="صافي التسليم / المطلوب"
                        />
                        <InfoBox
                          label="نسبة ما لم يكتمل"
                          value={formatPercent(buildOpenRate(product))}
                          hint="معلق + ملغي"
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

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
                      صافي التسليم في الجدول = تم تسليمه بعد خصم المرتجع، وترتيب
                      الفاريانت يبدأ بالأعلى طلبًا والأعلى مبيعًا.
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
                          {sortedVariants.map((variant) => (
                            <tr key={`${product.id}-${variant.id}-${variant.sku}`} className={`border-t border-slate-200/70 ${getVariantRowClassName(variant)}`}>
                              <td className="px-3 py-2 text-slate-900 font-medium">
                                {getVariantDisplayTitle(product, variant)}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {variant.sku || "-"}
                              </td>
                              <td className="px-3 py-2">
                                {formatCount(variant.inventory_quantity)}
                              </td>
                              <td className="px-3 py-2">
                                {formatCount(variant.ordered_quantity)}
                              </td>
                              <td className="px-3 py-2">
                                {formatCount(variant.net_delivered_quantity)}
                              </td>
                              <td className="px-3 py-2 text-rose-700">
                                {formatCount(variant.returned_quantity)}
                              </td>
                              <td className="px-3 py-2 text-amber-700">
                                {formatCount(variant.pending_quantity)}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {formatCount(variant.cancelled_quantity)}
                              </td>
                              <td className="px-3 py-2">
                                {formatCount(variant.orders_count)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-900">
                                  {formatCurrency(variant.net_sales)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  الإجمالي {formatCurrency(variant.gross_sales)}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {formatCount(variant.related_tasks_count)}
                              </td>
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
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ title, value, subtitle, tone, icon: Icon }) {
  const tones = {
    blue: "bg-sky-50 text-sky-700 border-sky-100",
    sky: "bg-cyan-50 text-cyan-700 border-cyan-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
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
          {subtitle ? (
            <p className="mt-2 text-xs leading-6 opacity-80">{subtitle}</p>
          ) : null}
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

function MetricTile({ label, value, hint, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white/80",
    blue: "border-sky-100 bg-sky-50/80",
    emerald: "border-emerald-100 bg-emerald-50/80",
    rose: "border-rose-100 bg-rose-50/80",
    amber: "border-amber-100 bg-amber-50/80",
  };

  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-2">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function InfoBox({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-2">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function StatusChip({ tone = "slate", icon: Icon, label }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    sky: "border-cyan-200 bg-cyan-50 text-cyan-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-100 text-rose-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.slate}`}
    >
      {Icon ? <Icon size={12} /> : null}
      {label}
    </span>
  );
}

function InsightBanner({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function ProductThumbnail({ src, title }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = String(title || "P").trim().slice(0, 1).toUpperCase();

  if (!src || imageFailed) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-xl font-bold text-slate-500">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title || "Product"}
      className="h-20 w-20 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
    />
  );
}
