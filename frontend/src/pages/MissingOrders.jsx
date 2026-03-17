import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import { extractArray, extractObject } from "../utils/response";

const PAGE_LIMIT = 100;

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeStatus = (value, fallback = "none") => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
};

const getStateBadge = (order) =>
  order?.missing_state === "escalated"
    ? {
        label: "خطر",
        className: "bg-red-600 text-white border-red-600",
      }
    : {
        label: "مفقود",
        className: "bg-amber-500 text-white border-amber-500",
      };

const getCardClassName = (order) =>
  order?.missing_state === "escalated"
    ? "border-red-200 bg-red-50"
    : "border-amber-200 bg-amber-50";

const matchesSearch = (order, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystacks = [
    order?.customer_name,
    order?.customer_email,
    order?.order_number,
    order?.shopify_id,
  ];

  return haystacks.some((value) =>
    String(value || "").toLowerCase().includes(normalized),
  );
};

export default function MissingOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const fetchMissingOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      let offset = 0;
      let hasMore = true;
      const rows = [];

      while (hasMore) {
        const response = await api.get("/shopify/orders/missing", {
          params: {
            limit: PAGE_LIMIT,
            offset,
          },
        });

        const payload = extractObject(response?.data);
        const batch = extractArray(payload);
        const pagination =
          payload?.pagination && typeof payload.pagination === "object"
            ? payload.pagination
            : {};

        rows.push(...batch);

        if (batch.length === 0) {
          break;
        }

        hasMore =
          typeof pagination.has_more === "boolean"
            ? pagination.has_more
            : batch.length === PAGE_LIMIT;
        offset =
          typeof pagination.next_offset === "number"
            ? pagination.next_offset
            : offset + batch.length;
      }

      setOrders(rows);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Error fetching missing orders:", requestError);
      setError(
        requestError?.response?.data?.error || "فشل تحميل الطلبات المفقودة",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissingOrders();
  }, [fetchMissingOrders]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (String(event?.resource || "").toLowerCase() === "notifications") {
        return;
      }
      fetchMissingOrders({ silent: true });
    });

    return () => unsubscribe();
  }, [fetchMissingOrders]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => matchesSearch(order, searchTerm)),
    [orders, searchTerm],
  );

  const summary = useMemo(() => {
    const escalatedCount = filteredOrders.filter(
      (order) => order?.missing_state === "escalated",
    ).length;

    return {
      total: filteredOrders.length,
      missing: filteredOrders.length - escalatedCount,
      escalated: escalatedCount,
    };
  }, [filteredOrders]);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  الطلبات المفقودة
                </h1>
                <p className="text-slate-600 mt-1">
                  أي طلب لم يحصل على أكشن حقيقي لمدة 3 أيام يظهر هنا. إذا وصل إلى
                  6 أيام بدون أكشن يتحول للأحمر.
                </p>
                {lastUpdatedAt && (
                  <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Clock3 size={12} />
                    آخر تحديث {lastUpdatedAt.toLocaleTimeString("ar-EG")}
                  </div>
                )}
              </div>

              <button
                onClick={() => fetchMissingOrders()}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              title="إجمالي الطلبات المفقودة"
              value={summary.total.toLocaleString()}
              tone="blue"
              icon={Search}
            />
            <SummaryCard
              title="تحتاج متابعة"
              value={summary.missing.toLocaleString()}
              tone="amber"
              icon={AlertTriangle}
            />
            <SummaryCard
              title="حالات خطر"
              value={summary.escalated.toLocaleString()}
              tone="red"
              icon={ShieldAlert}
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  قائمة الطلبات
                </h2>
                <p className="text-sm text-slate-500">
                  اللون الأحمر يعني أن الطلب ما زال بدون أكشن بعد مرور 6 أيام أو أكثر.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث بالعميل أو الإيميل أو رقم الطلب"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                جاري تحميل الطلبات المفقودة...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                لا توجد طلبات مفقودة حاليًا.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const stateBadge = getStateBadge(order);
                  const fulfillmentStatus = normalizeStatus(
                    order?.fulfillment_status,
                    "unfulfilled",
                  );
                  const paymentStatus = normalizeStatus(
                    order?.financial_status || order?.status,
                    "pending",
                  );

                  return (
                    <article
                      key={order.id}
                      className={`border rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-md ${getCardClassName(order)}`}
                    >
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="text-lg font-semibold text-slate-900 hover:text-sky-700"
                            >
                              طلب #{order.order_number || order.shopify_id}
                            </button>
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${stateBadge.className}`}
                            >
                              {stateBadge.label}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700">
                              بدون أكشن {order.days_without_action} يوم
                            </span>
                          </div>

                          <div className="text-sm text-slate-700 space-y-1">
                            <p className="font-medium text-slate-900">
                              {order.customer_name || "عميل غير معروف"}
                            </p>
                            <p>{order.customer_email || "-"}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm min-w-0 xl:min-w-[32rem]">
                          <InfoBox
                            label="آخر أكشن"
                            value={formatDate(order.last_action_at)}
                          />
                          <InfoBox
                            label="دخل الصفحة"
                            value={formatDate(order.missing_since)}
                          />
                          <InfoBox
                            label="الحالة المالية"
                            value={paymentStatus}
                          />
                          <InfoBox
                            label="Fulfillment"
                            value={fulfillmentStatus}
                          />
                        </div>
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

function SummaryCard({ title, value, tone, icon: Icon }) {
  const toneClassName = {
    blue: "from-sky-500 to-sky-700",
    amber: "from-amber-500 to-amber-700",
    red: "from-red-500 to-red-700",
  }[tone] || "from-slate-500 to-slate-700";

  return (
    <div className={`rounded-2xl text-white p-5 shadow-sm bg-gradient-to-br ${toneClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm/6 text-white/80">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900 mt-1 break-words">{value}</p>
    </div>
  );
}
