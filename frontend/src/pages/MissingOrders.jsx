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
import { useLocale } from "../context/LocaleContext";
import api from "../utils/api";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import { extractArray, extractObject } from "../utils/response";

const PAGE_LIMIT = 100;

const normalizeStatus = (value, fallback = "none") => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
};

const PAYMENT_STATUS_LABELS = {
  pending: { ar: "معلق", en: "Pending" },
  authorized: { ar: "مصرح به", en: "Authorized" },
  paid: { ar: "مدفوع", en: "Paid" },
  partially_paid: { ar: "مدفوع جزئيًا", en: "Partially Paid" },
  refunded: { ar: "مسترد", en: "Refunded" },
  partially_refunded: { ar: "استرداد جزئي", en: "Partially Refunded" },
  voided: { ar: "ملغي", en: "Voided" },
  failed: { ar: "فشل", en: "Failed" },
};

const FULFILLMENT_STATUS_LABELS = {
  fulfilled: { ar: "تم التسليم", en: "Fulfilled" },
  partial: { ar: "تسليم جزئي", en: "Partially Fulfilled" },
  unfulfilled: { ar: "غير مسلّم", en: "Unfulfilled" },
  restocked: { ar: "أعيد للمخزون", en: "Restocked" },
  none: { ar: "-", en: "-" },
};

const getLocalizedStatusLabel = (status, locale, dictionary) => {
  const normalizedLocale = locale === "ar" ? "ar" : "en";
  return (
    dictionary[String(status || "").trim().toLowerCase()]?.[normalizedLocale] ||
    String(status || "-")
  );
};

const getStateBadge = (order, locale) =>
  order?.missing_state === "escalated"
    ? {
        label: locale === "ar" ? "خطر" : "Critical",
        className: "bg-red-600 text-white border-red-600",
      }
    : {
        label: locale === "ar" ? "مفقود" : "Missing",
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
  const { locale, isRTL, select, formatDateTime, formatNumber, formatTime } =
    useLocale();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const formatDate = useCallback(
    (value) => {
      if (!value) return "-";
      return formatDateTime(value, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [formatDateTime],
  );

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
        requestError?.response?.data?.error ||
          select("فشل تحميل الطلبات المفقودة", "Failed to load missing orders"),
      );
    } finally {
      setLoading(false);
    }
  }, [select]);

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
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={isRTL ? "text-right" : "text-left"}>
                <h1 className="text-3xl font-bold text-slate-900">
                  {select("الطلبات المفقودة", "Missing Orders")}
                </h1>
                <p className="mt-1 text-slate-600">
                  {select(
                    "أي طلب لم يحصل على أكشن حقيقي لمدة 3 أيام يظهر هنا. إذا وصل إلى 6 أيام بدون أكشن يتحول للأحمر.",
                    "Any order with no real action for 3 days appears here. If it reaches 6 days without action, it becomes critical.",
                  )}
                </p>
                {lastUpdatedAt && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    <Clock3 size={12} />
                    {select("آخر تحديث", "Last refresh")}{" "}
                    {formatTime(lastUpdatedAt, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={() => fetchMissingOrders()}
                className="flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-white hover:bg-sky-800"
              >
                <RefreshCw size={18} />
                {select("تحديث", "Refresh")}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard
              title={select("إجمالي الطلبات المفقودة", "Total Missing Orders")}
              value={formatNumber(summary.total, {
                maximumFractionDigits: 0,
              })}
              tone="blue"
              icon={Search}
            />
            <SummaryCard
              title={select("تحتاج متابعة", "Need Follow-up")}
              value={formatNumber(summary.missing, {
                maximumFractionDigits: 0,
              })}
              tone="amber"
              icon={AlertTriangle}
            />
            <SummaryCard
              title={select("حالات خطر", "Critical Cases")}
              value={formatNumber(summary.escalated, {
                maximumFractionDigits: 0,
              })}
              tone="red"
              icon={ShieldAlert}
            />
          </div>

          <div className="space-y-4 rounded-xl bg-white p-4 shadow">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className={isRTL ? "text-right" : "text-left"}>
                <h2 className="text-lg font-semibold text-slate-900">
                  {select("قائمة الطلبات", "Orders List")}
                </h2>
                <p className="text-sm text-slate-500">
                  {select(
                    "اللون الأحمر يعني أن الطلب ما زال بدون أكشن بعد مرور 6 أيام أو أكثر.",
                    "Red means the order still has no action after 6 days or more.",
                  )}
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search
                  className={`absolute top-2.5 text-slate-400 ${
                    isRTL ? "right-3" : "left-3"
                  }`}
                  size={16}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={select(
                    "ابحث بالعميل أو الإيميل أو رقم الطلب",
                    "Search by customer, email, or order number",
                  )}
                  className={`w-full rounded-lg border border-slate-200 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isRTL ? "pr-8 pl-3 text-right" : "pl-8 pr-3 text-left"
                  }`}
                />
              </div>
            </div>

            {loading ? (
              <EmptyState
                text={select(
                  "جاري تحميل الطلبات المفقودة...",
                  "Loading missing orders...",
                )}
              />
            ) : filteredOrders.length === 0 ? (
              <EmptyState
                text={select(
                  "لا توجد طلبات مفقودة حاليًا.",
                  "There are no missing orders right now.",
                )}
              />
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const stateBadge = getStateBadge(order, locale);
                  const fulfillmentStatus = getLocalizedStatusLabel(
                    normalizeStatus(order?.fulfillment_status, "unfulfilled"),
                    locale,
                    FULFILLMENT_STATUS_LABELS,
                  );
                  const paymentStatus = getLocalizedStatusLabel(
                    normalizeStatus(order?.financial_status || order?.status, "pending"),
                    locale,
                    PAYMENT_STATUS_LABELS,
                  );

                  return (
                    <article
                      key={order.id}
                      className={`rounded-2xl border p-4 transition-shadow hover:shadow-md sm:p-5 ${getCardClassName(order)}`}
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="text-lg font-semibold text-slate-900 hover:text-sky-700"
                            >
                              {select("طلب", "Order")} #
                              {order.order_number || order.shopify_id}
                            </button>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${stateBadge.className}`}
                            >
                              {stateBadge.label}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                              {select("بدون أكشن", "No action for")}{" "}
                              {formatNumber(order.days_without_action || 0, {
                                maximumFractionDigits: 0,
                              })}{" "}
                              {select("يوم", "days")}
                            </span>
                          </div>

                          <div className="space-y-1 text-sm text-slate-700">
                            <p className="font-medium text-slate-900">
                              {order.customer_name ||
                                select("عميل غير معروف", "Unknown customer")}
                            </p>
                            <p>{order.customer_email || "-"}</p>
                          </div>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:min-w-[32rem] xl:grid-cols-4">
                          <InfoBox
                            label={select("آخر أكشن", "Last Action")}
                            value={formatDate(order.last_action_at)}
                          />
                          <InfoBox
                            label={select("دخل الصفحة", "Entered Queue")}
                            value={formatDate(order.missing_since)}
                          />
                          <InfoBox
                            label={select("الحالة المالية", "Payment Status")}
                            value={paymentStatus}
                          />
                          <InfoBox
                            label={select("حالة التسليم", "Fulfillment")}
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
    <div
      className={`rounded-2xl bg-gradient-to-br p-5 text-white shadow-sm ${toneClassName}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm/6 text-white/80">{title}</p>
          <p className="mt-2 text-3xl font-bold">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
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
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
      {text}
    </div>
  );
}
