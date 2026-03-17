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
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { warehouseAPI } from "../utils/api";
import { formatCurrency, formatDateTime } from "../utils/helpers";
import { fetchAllPagesProgressively } from "../utils/pagination";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const PAGE_LIMIT = 100;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const matchesSearch = (row, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [row?.title, row?.sku, row?.vendor, row?.product_type].some((value) =>
    String(value || "").toLowerCase().includes(normalized),
  );
};

const isWarehouseRelatedSharedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return source.includes("/warehouse") || source.includes("/shopify/products");
};

const getRowClassName = (row) => {
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

export default function WarehouseStock() {
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const fetchStock = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const products = await fetchAllPagesProgressively(
        ({ limit, offset }) =>
          warehouseAPI.getStock({
            limit,
            offset,
            sort_by: "title",
            sort_dir: "asc",
          }),
        {
          limit: PAGE_LIMIT,
          onPage: ({ rows: accumulatedRows }) => {
            setRows(accumulatedRows);
          },
        },
      );

      setRows(products);
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

    filteredRows.forEach((row) => {
      warehouseUnits += toNumber(row?.warehouse_quantity);

      if (toNumber(row?.stock_difference) !== 0) {
        mismatched += 1;
      }

      if (toNumber(row?.warehouse_quantity) <= 0) {
        zeroStock += 1;
      }
    });

    return {
      totalProducts: filteredRows.length,
      warehouseUnits,
      mismatched,
      zeroStock,
    };
  }, [filteredRows]);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">المخزن</h1>
                <p className="text-slate-600 mt-1">
                  الرصيد هنا يعتمد فقط على حركات السكانر حسب SKU، وليس على ستوك Shopify.
                </p>
                {lastUpdatedAt && (
                  <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Clock3 size={12} />
                    آخر تحديث {formatDateTime(lastUpdatedAt)}
                  </div>
                )}
              </div>

              <button
                onClick={() => fetchStock()}
                className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <RefreshCw size={18} />
                تحديث
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              title="عدد المنتجات"
              value={summary.totalProducts.toLocaleString("ar-EG")}
              tone="blue"
              icon={Package}
            />
            <SummaryCard
              title="إجمالي وحدات المخزن"
              value={summary.warehouseUnits.toLocaleString("ar-EG")}
              tone="emerald"
              icon={Store}
            />
            <SummaryCard
              title="فروق تحتاج مراجعة"
              value={summary.mismatched.toLocaleString("ar-EG")}
              tone="amber"
              icon={ShieldAlert}
            />
            <SummaryCard
              title="رصيد صفر أو أقل"
              value={summary.zeroStock.toLocaleString("ar-EG")}
              tone="red"
              icon={AlertCircle}
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  رصيد المنتجات
                </h2>
                <p className="text-sm text-slate-500">
                  أي فرق ظاهر هنا يعني أن رصيد السكانر لا يطابق الرصيد الموجود في Shopify.
                </p>
              </div>

              <div className="relative w-full md:w-96">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث باسم المنتج أو SKU أو المورد"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                جاري تحميل رصيد المخزن...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                لا توجد منتجات مطابقة للبحث الحالي.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-right">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-4 py-3 font-semibold">المنتج</th>
                      <th className="px-4 py-3 font-semibold">SKU</th>
                      <th className="px-4 py-3 font-semibold">سعر البيع</th>
                      <th className="px-4 py-3 font-semibold">رصيد المخزن</th>
                      <th className="px-4 py-3 font-semibold">رصيد Shopify</th>
                      <th className="px-4 py-3 font-semibold">الفرق</th>
                      <th className="px-4 py-3 font-semibold">آخر سكان</th>
                      <th className="px-4 py-3 font-semibold">آخر مزامنة</th>
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
                            <div className="font-semibold text-slate-900">
                              {row.title}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {row.vendor || "-"}
                              {row.product_type ? ` • ${row.product_type}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">
                            {row.sku || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatCurrency(row.price)}
                          </td>
                          <td className="px-4 py-3">
                            {toNumber(row.warehouse_quantity).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-4 py-3">
                            {toNumber(row.shopify_inventory_quantity).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getDifferenceBadgeClassName(difference)}`}
                            >
                              {formatDifference(difference)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <div>{formatDateTime(row.last_scanned_at)}</div>
                            {row.last_movement_type && (
                              <div className="text-xs text-slate-500 mt-1">
                                آخر حركة{" "}
                                {row.last_movement_type === "in" ? "داخل" : "خارج"}
                                {row.last_movement_quantity
                                  ? ` • ${toNumber(row.last_movement_quantity).toLocaleString("ar-EG")}`
                                  : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDateTime(row.last_synced_at || row.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
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
