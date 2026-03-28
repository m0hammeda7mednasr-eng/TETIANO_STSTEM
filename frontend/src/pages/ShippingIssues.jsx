import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  Eye,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { useLocale } from "../context/LocaleContext";
import { markSharedDataUpdated, subscribeToSharedDataUpdates } from "../utils/realtime";
import { extractArray, extractObject } from "../utils/response";
import {
  DEFAULT_SHIPPING_ISSUE_REASON,
  getShippingIssueBadgeClassName,
  getShippingIssueReasonLabel,
  getShippingIssueReasonOptions,
  isShippingIssueActive,
  normalizeShippingIssueReason,
} from "../utils/shippingIssues";

const FETCH_PAGE_LIMIT = 200;
const PAGE_SIZE = 50;
const PAGINATION_WINDOW = 5;
const CUSTOMER_SIDE_REASONS = new Set([
  "customer_issue",
  "customer_data_issue",
  "customer_cancelled",
]);

const matchesSearch = (order, keyword) => {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    order?.customer_name,
    order?.customer_email,
    order?.order_number,
    order?.shopify_id,
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
};

function SummaryCard({ title, value, tone = "violet" }) {
  const toneClassName = {
    violet: "from-violet-500 to-violet-700",
    amber: "from-amber-500 to-amber-700",
    sky: "from-sky-500 to-sky-700",
    rose: "from-rose-500 to-rose-700",
  }[tone];

  return (
    <div className={`rounded-2xl bg-gradient-to-br p-5 text-white shadow-sm ${toneClassName}`}>
      <p className="text-sm/6 text-white/80">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

export default function ShippingIssues() {
  const navigate = useNavigate();
  const { select, isRTL, formatDateTime, formatNumber, formatTime } = useLocale();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [updatingOrderIds, setUpdatingOrderIds] = useState({});

  const reasonOptions = useMemo(
    () => getShippingIssueReasonOptions(select),
    [select],
  );

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

  const fetchShippingIssues = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      let offset = 0;
      let hasMore = true;
      const rows = [];

      while (hasMore) {
        const response = await api.get("/shopify/orders", {
          params: {
            limit: FETCH_PAGE_LIMIT,
            offset,
            sort_by: "created_at",
            sort_dir: "desc",
            shipping_issue: "active",
          },
        });

        const payload = extractObject(response?.data);
        const batch = extractArray(payload).filter((order) =>
          isShippingIssueActive(order),
        );
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
            : batch.length === FETCH_PAGE_LIMIT;
        offset =
          typeof pagination.next_offset === "number"
            ? pagination.next_offset
            : offset + batch.length;
      }

      setOrders(rows);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Error fetching shipping issues:", requestError);
      setError(
        requestError?.response?.data?.error ||
          select("فشل تحميل مشاكل الشحن", "Failed to load shipping issues"),
      );
    } finally {
      setLoading(false);
    }
  }, [select]);

  useEffect(() => {
    fetchShippingIssues();
  }, [fetchShippingIssues]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchShippingIssues({ silent: true });
    });

    return () => unsubscribe();
  }, [fetchShippingIssues]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!matchesSearch(order, searchTerm)) {
          return false;
        }

        if (reasonFilter === "all") {
          return true;
        }

        return (
          normalizeShippingIssueReason(order?.shipping_issue?.reason) ===
          reasonFilter
        );
      }),
    [orders, reasonFilter, searchTerm],
  );

  const summary = useMemo(() => {
    const unspecified = filteredOrders.filter(
      (order) =>
        normalizeShippingIssueReason(order?.shipping_issue?.reason) ===
        DEFAULT_SHIPPING_ISSUE_REASON,
    ).length;
    const customerSide = filteredOrders.filter((order) =>
      CUSTOMER_SIDE_REASONS.has(
        normalizeShippingIssueReason(order?.shipping_issue?.reason),
      ),
    ).length;

    return {
      total: filteredOrders.length,
      unspecified,
      customerSide,
      deliverySide: filteredOrders.length - unspecified - customerSide,
    };
  }, [filteredOrders]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE)),
    [filteredOrders.length],
  );

  const paginatedOrders = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;
    return filteredOrders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredOrders, totalPages]);

  const visibleRange = useMemo(() => {
    if (filteredOrders.length === 0) {
      return { start: 0, end: 0 };
    }

    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE + 1;
    const end = Math.min(filteredOrders.length, safePage * PAGE_SIZE);

    return { start, end };
  }, [currentPage, filteredOrders.length, totalPages]);

  const paginationPages = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const halfWindow = Math.floor(PAGINATION_WINDOW / 2);
    const startPage = Math.max(1, safePage - halfWindow);
    const endPage = Math.min(totalPages, startPage + PAGINATION_WINDOW - 1);
    const pages = [];

    for (let page = startPage; page <= endPage; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reasonFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  const setUpdatingState = (orderId, value) => {
    setUpdatingOrderIds((current) => ({
      ...current,
      [orderId]: value,
    }));
  };

  const handleIssueReasonChange = async (orderId, reason) => {
    setUpdatingState(orderId, true);
    try {
      await api.post(`/shopify/orders/${orderId}/shipping-issue`, {
        active: true,
        reason,
      });
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                shipping_issue: {
                  ...order.shipping_issue,
                  reason,
                  updated_at: new Date().toISOString(),
                },
                shipping_issue_reason: reason,
              }
            : order,
        ),
      );
      markSharedDataUpdated();
    } catch (updateError) {
      console.error("Error updating shipping issue:", updateError);
      setError(
        updateError?.response?.data?.error ||
          select("فشل تحديث سبب المشكلة", "Failed to update issue reason"),
      );
    } finally {
      setUpdatingState(orderId, false);
    }
  };

  const handleReturnToOrders = async (orderId) => {
    setUpdatingState(orderId, true);
    try {
      await api.post(`/shopify/orders/${orderId}/shipping-issue`, {
        active: false,
      });
      setOrders((current) => current.filter((order) => order.id !== orderId));
      markSharedDataUpdated();
    } catch (updateError) {
      console.error("Error returning order to orders list:", updateError);
      setError(
        updateError?.response?.data?.error ||
          select("فشل إرجاع الأوردر لقائمة الأوردرات", "Failed to return order to Orders"),
      );
    } finally {
      setUpdatingState(orderId, false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={isRTL ? "text-right" : "text-left"}>
                <h1 className="text-3xl font-bold text-slate-900">
                  {select("مشاكل الشحن", "Shipping Issues")}
                </h1>
                <p className="mt-1 text-slate-600">
                  {select(
                    "كل أوردر متحول من قائمة الأوردرات علشان متابعة الشحن يظهر هنا مع سبب المشكلة وإمكانية الإرجاع.",
                    "Orders moved out of the main orders list for shipping follow-up appear here with their issue reason and a return action.",
                  )}
                </p>
                {lastUpdatedAt ? (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    <Clock3 size={12} />
                    {select("آخر تحديث", "Last refresh")}{" "}
                    {formatTime(lastUpdatedAt, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => fetchShippingIssues()}
                className="flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-white transition hover:bg-sky-800"
              >
                <RefreshCw size={18} />
                {select("تحديث", "Refresh")}
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title={select("إجمالي المشاكل", "Total Issues")} value={formatNumber(summary.total, { maximumFractionDigits: 0 })} />
            <SummaryCard title={select("بدون تحديد", "Unspecified")} value={formatNumber(summary.unspecified, { maximumFractionDigits: 0 })} tone="amber" />
            <SummaryCard title={select("مشاكل تخص العميل", "Customer-Side")} value={formatNumber(summary.customerSide, { maximumFractionDigits: 0 })} tone="sky" />
            <SummaryCard title={select("مشاكل التوصيل", "Delivery-Side")} value={formatNumber(summary.deliverySide, { maximumFractionDigits: 0 })} tone="rose" />
          </div>

          <div className="space-y-4 rounded-2xl bg-white p-4 shadow sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
                  placeholder={select("ابحث بالعميل أو رقم الأوردر", "Search by customer or order number")}
                  className={`w-full rounded-lg border border-slate-200 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isRTL ? "pr-8 pl-3 text-right" : "pl-8 pr-3 text-left"
                  }`}
                />
              </div>

              <select
                value={reasonFilter}
                onChange={(event) => setReasonFilter(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">{select("كل الأسباب", "All reasons")}</option>
                {reasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                {select("جاري تحميل مشاكل الشحن...", "Loading shipping issues...")}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                {select("لا توجد مشاكل شحن مطابقة حالياً.", "There are no matching shipping issues right now.")}
              </div>
            ) : (
              <>
                <div className="space-y-3 lg:hidden">
                  {paginatedOrders.map((order) => {
                    const reason = normalizeShippingIssueReason(order?.shipping_issue?.reason);
                    const isUpdating = Boolean(updatingOrderIds[order.id]);

                    return (
                      <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="text-lg font-semibold text-slate-900 transition hover:text-sky-700">
                              #{order.order_number || order.shopify_id}
                            </button>
                            <p className="mt-1 text-sm text-slate-500">{order.customer_name || select("عميل غير معروف", "Unknown customer")}</p>
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getShippingIssueBadgeClassName(reason)}`}>
                            {getShippingIssueReasonLabel(reason, select)}
                          </span>
                        </div>

                        <div className="mt-3 space-y-3">
                          <select
                            value={reason}
                            onChange={(event) => handleIssueReasonChange(order.id, event.target.value)}
                            disabled={isUpdating}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {reasonOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500">
                            {select("آخر تعديل", "Last update")}: {formatDate(order?.shipping_issue?.updated_at || order.updated_at)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                              <Eye size={15} />
                              {select("عرض", "View")}
                            </button>
                            <button type="button" onClick={() => handleReturnToOrders(order.id)} disabled={isUpdating} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                              <Undo2 size={15} />
                              {select("رجوع للأوردرات", "Return to Orders")}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden space-y-3 lg:block">
                  {paginatedOrders.map((order) => {
                    const reason = normalizeShippingIssueReason(order?.shipping_issue?.reason);
                    const isUpdating = Boolean(updatingOrderIds[order.id]);

                    return (
                      <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="grid items-center gap-4 xl:grid-cols-[160px_1fr_240px_260px_220px]">
                          <div>
                            <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="font-semibold text-slate-900 transition hover:text-sky-700">
                              #{order.order_number || order.shopify_id}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDate(order?.shipping_issue?.updated_at || order.updated_at)}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{order.customer_name || select("عميل غير معروف", "Unknown customer")}</p>
                            <p className="mt-1 text-xs text-slate-500">{order.customer_email || "-"}</p>
                          </div>
                          <div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getShippingIssueBadgeClassName(reason)}`}>
                              {getShippingIssueReasonLabel(reason, select)}
                            </span>
                          </div>
                          <select
                            value={reason}
                            onChange={(event) => handleIssueReasonChange(order.id, event.target.value)}
                            disabled={isUpdating}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {reasonOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => navigate(`/orders/${order.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                              <Eye size={15} />
                              {select("عرض", "View")}
                            </button>
                            <button type="button" onClick={() => handleReturnToOrders(order.id)} disabled={isUpdating} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                              <Undo2 size={15} />
                              {select("رجوع للأوردرات", "Return to Orders")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    {select(
                      `عرض ${formatNumber(visibleRange.start, { maximumFractionDigits: 0 })} - ${formatNumber(visibleRange.end, { maximumFractionDigits: 0 })} من ${formatNumber(filteredOrders.length, { maximumFractionDigits: 0 })} أوردر`,
                      `Showing ${formatNumber(visibleRange.start, { maximumFractionDigits: 0 })} - ${formatNumber(visibleRange.end, { maximumFractionDigits: 0 })} of ${formatNumber(filteredOrders.length, { maximumFractionDigits: 0 })} orders`,
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {select("السابق", "Previous")}
                    </button>
                    {paginationPages.map((pageNumber) => (
                      <button key={pageNumber} type="button" onClick={() => setCurrentPage(pageNumber)} className={`rounded-lg px-3 py-2 text-sm font-medium ${pageNumber === currentPage ? "bg-sky-700 text-white shadow-sm" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                        {formatNumber(pageNumber, { maximumFractionDigits: 0 })}
                      </button>
                    ))}
                    <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {select("التالي", "Next")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
