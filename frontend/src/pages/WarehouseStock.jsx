import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  Clock3,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Tags,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { warehouseAPI } from "../utils/api";
import { formatCurrency, formatDateTime } from "../utils/helpers";
import { fetchAllPagesProgressively } from "../utils/pagination";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import { extractObject } from "../utils/response";

const PAGE_LIMIT = 100;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCount = (value) => toNumber(value).toLocaleString("ar-EG");

const matchesSearch = (row, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    row?.display_title,
    row?.product_title,
    row?.variant_title,
    row?.sku,
    row?.vendor,
    row?.product_type,
    ...(Array.isArray(row?.option_values) ? row.option_values : []),
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
};

const isWarehouseRelatedSharedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return source.includes("/warehouse") || source.includes("/shopify/products");
};

const getRowClassName = (row) => {
  if (row?.is_archived) {
    return "bg-slate-50";
  }

  if (toNumber(row?.warehouse_quantity) <= 0) {
    return "bg-rose-50";
  }

  if (toNumber(row?.stock_difference) !== 0) {
    return "bg-amber-50";
  }

  return "bg-white";
};

const getDifferenceBadgeClassName = (difference) => {
  if (difference === 0) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (difference > 0) {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }

  return "bg-amber-50 text-amber-700 border-amber-200";
};

const formatDifference = (value) => {
  const numericValue = toNumber(value);
  if (numericValue > 0) {
    return `+${numericValue.toLocaleString("ar-EG")}`;
  }

  return numericValue.toLocaleString("ar-EG");
};

const getDisplayTitle = (row) =>
  row?.display_title || row?.product_title || row?.title || row?.sku || "SKU";

const getVariantLabel = (row) => {
  const variantTitle = String(row?.variant_title || "").trim();
  if (!variantTitle || variantTitle === "Default Variant") {
    return "الافتراضي";
  }

  return variantTitle;
};

export default function WarehouseStock() {
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [setupNotice, setSetupNotice] = useState("");

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const fetchStock = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
      setSetupNotice("");
    }

    try {
      let schemaReady = true;
      let setupMessage = "";
      const variants = await fetchAllPagesProgressively(
        ({ limit, offset }) =>
          warehouseAPI.getStock({
            limit,
            offset,
            sort_by: "title",
            sort_dir: "asc",
          }),
        {
          limit: PAGE_LIMIT,
          onPage: ({ rows: accumulatedRows, payload }) => {
            setRows(accumulatedRows);
            const responsePayload = extractObject(payload);
            if (
              responsePayload?.schema_ready === false ||
              responsePayload?.setup_required
            ) {
              schemaReady = false;
              setupMessage =
                responsePayload?.message ||
                "Warehouse is not configured yet on the database.";
            }
          },
        },
      );

      setRows(variants);
      setSetupNotice(schemaReady ? "" : setupMessage);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Error fetching warehouse stock:", requestError);
      setError(
        requestError?.response?.data?.error || "فشل تحميل رصيد المخزن",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (!isWarehouseRelatedSharedUpdate(event)) {
        return;
      }

      fetchStock({ silent: true });
    });

    return () => unsubscribe();
  }, [fetchStock]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, deferredSearchTerm)),
    [rows, deferredSearchTerm],
  );

  const summary = useMemo(() => {
    let warehouseUnits = 0;
    let mismatched = 0;
    let zeroStock = 0;
    let archived = 0;

    filteredRows.forEach((row) => {
      warehouseUnits += toNumber(row?.warehouse_quantity);

      if (toNumber(row?.stock_difference) !== 0) {
        mismatched += 1;
      }

      if (toNumber(row?.warehouse_quantity) <= 0) {
        zeroStock += 1;
      }

      if (row?.is_archived) {
        archived += 1;
      }
    });

    return {
      totalVariants: filteredRows.length,
      warehouseUnits,
      mismatched,
      zeroStock,
      archived,
    };
  }, [filteredRows]);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-slate-50 via-white to-sky-50/80 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    المخزن
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                    رصيد المخزن هنا معروض على مستوى كل Variant وكل SKU. كل حركة
                    تعتمد على الـ Scanner والـ SKU فقط، وليس على المنتج المجمع.
                  </p>
                  {lastUpdatedAt && (
                    <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      <Clock3 size={12} />
                      آخر تحديث {formatDateTime(lastUpdatedAt)}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fetchStock()}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-800"
                >
                  <RefreshCw size={18} />
                  تحديث
                </button>
              </div>
            </div>

            <div className="grid gap-3 border-t border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 sm:grid-cols-3">
              <InsightBanner
                label="طريقة العرض"
                value="كل صف يمثل SKU واحدًا وليس المنتج بالكامل"
              />
              <InsightBanner
                label="اعتماد الرصيد"
                value="الرصيد الفعلي للمخزن = حركات السكانر فقط"
              />
              <InsightBanner
                label="فرق الرصيد"
                value="المقارنة دائمًا بين رصيد المخزن ورصيد Shopify لنفس الـ SKU"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {setupNotice && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Warehouse setup required</p>
                <p className="mt-1 text-sm">
                  {setupNotice}. صفحات المخزن ستظل للقراءة فقط حتى يتم إنشاء
                  جداول المخزن.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="عدد الـ SKU"
              value={formatCount(summary.totalVariants)}
              tone="blue"
              icon={Tags}
            />
            <SummaryCard
              title="وحدات المخزن"
              value={formatCount(summary.warehouseUnits)}
              tone="emerald"
              icon={Store}
            />
            <SummaryCard
              title="فروق تحتاج مراجعة"
              value={formatCount(summary.mismatched)}
              tone="amber"
              icon={ShieldAlert}
            />
            <SummaryCard
              title="رصيد صفر أو أقل"
              value={formatCount(summary.zeroStock)}
              tone="red"
              icon={AlertCircle}
            />
            <SummaryCard
              title="SKU غير مرتبط"
              value={formatCount(summary.archived)}
              tone="slate"
              icon={Package}
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  رصيد الفاريانتات
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  أي فرق ظاهر هنا يعني أن رصيد السكانر لا يطابق رصيد Shopify لنفس
                  الـ SKU.
                </p>
              </div>

              <div className="relative w-full lg:w-96">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث باسم المنتج أو الفاريانت أو SKU أو المورد"
                  className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              عرض {formatCount(filteredRows.length)} SKU من أصل{" "}
              {formatCount(rows.length)}.
            </div>

            <div className="p-4 sm:p-5">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                  جاري تحميل رصيد المخزن...
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                  لا توجد نتائج مطابقة للبحث الحالي.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600">
                        <th className="px-4 py-3 font-semibold">الفاريانت</th>
                        <th className="px-4 py-3 font-semibold">SKU</th>
                        <th className="px-4 py-3 font-semibold">السعر</th>
                        <th className="px-4 py-3 font-semibold">المخزن</th>
                        <th className="px-4 py-3 font-semibold">Shopify</th>
                        <th className="px-4 py-3 font-semibold">الفرق</th>
                        <th className="px-4 py-3 font-semibold">آخر حركة</th>
                        <th className="px-4 py-3 font-semibold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const difference = toNumber(row?.stock_difference);

                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-100 align-top ${getRowClassName(row)}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                <WarehouseRowThumbnail
                                  src={row?.image_url}
                                  label={getDisplayTitle(row)}
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900">
                                    {getDisplayTitle(row)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {row?.product_title || "-"}
                                    {row?.variant_title
                                      ? ` • ${getVariantLabel(row)}`
                                      : ""}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {row?.vendor || "-"}
                                    {row?.product_type ? ` • ${row.product_type}` : ""}
                                  </div>
                                  {Array.isArray(row?.option_values) &&
                                  row.option_values.length > 0 ? (
                                    <div className="mt-1 text-xs text-slate-500">
                                      {row.option_values.join(" • ")}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              <div>{row.sku || "-"}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {row?.barcode ? `Barcode: ${row.barcode}` : "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {formatCurrency(row.price)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {formatCount(row.warehouse_quantity)}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {formatCount(row.shopify_inventory_quantity)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getDifferenceBadgeClassName(difference)}`}
                              >
                                {formatDifference(difference)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{formatDateTime(row.last_scanned_at)}</div>
                              {row.last_movement_type && (
                                <div className="mt-1 text-xs text-slate-500">
                                  آخر حركة{" "}
                                  {row.last_movement_type === "in"
                                    ? "داخل"
                                    : "خارج"}
                                  {row.last_movement_quantity
                                    ? ` • ${formatCount(row.last_movement_quantity)}`
                                    : ""}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-2">
                                {row?.is_archived ? (
                                  <Badge tone="slate" label="SKU غير مرتبط" />
                                ) : null}
                                {difference === 0 ? (
                                  <Badge tone="emerald" label="متطابق" />
                                ) : difference > 0 ? (
                                  <Badge tone="sky" label="المخزن أعلى" />
                                ) : (
                                  <Badge tone="amber" label="Shopify أعلى" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ title, value, tone, icon: Icon }) {
  const tones = {
    blue: "bg-sky-50 text-sky-700 border-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.blue}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function InsightBanner({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function Badge({ tone = "slate", label }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.slate}`}
    >
      {label}
    </span>
  );
}

function WarehouseRowThumbnail({ src, label }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = String(label || "S").trim().slice(0, 1).toUpperCase();

  if (!src || imageFailed) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-lg font-bold text-slate-500">
        {fallback}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label || "SKU"}
      className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
    />
  );
}
