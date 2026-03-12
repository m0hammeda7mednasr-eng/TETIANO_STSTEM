import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const POLLING_INTERVAL_MS = 30000;

const INITIAL_FILTERS = {
  searchTerm: "",
  dateFrom: "",
  dateTo: "",
  orderNumberFrom: "",
  orderNumberTo: "",
  amountMin: "",
  amountMax: "",
  paymentFilter: "all",
  fulfillmentFilter: "all",
  refundFilter: "all",
  cancelledOnly: false,
  fulfilledOnly: false,
  paidOnly: false,
  sortBy: "newest",
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseOrderData = (order) => {
  if (!order) return {};
  if (typeof order.data === "string") {
    try {
      return JSON.parse(order.data);
    } catch {
      return {};
    }
  }
  return order.data || {};
};

const getOrderMeta = (order) => {
  const data = parseOrderData(order);
  const paymentStatus = String(
    order.financial_status || order.status || data.financial_status || "",
  )
    .toLowerCase()
    .trim();
  const fulfillmentStatus = String(
    order.fulfillment_status || data.fulfillment_status || "",
  )
    .toLowerCase()
    .trim();

  const refunds = Array.isArray(data.refunds) ? data.refunds : [];
  const refundedAmountFromRefunds = refunds.reduce((sum, refund) => {
    const transactions = Array.isArray(refund?.transactions)
      ? refund.transactions
      : [];
    return (
      sum +
      transactions.reduce(
        (innerSum, transaction) => innerSum + toNumber(transaction?.amount),
        0,
      )
    );
  }, 0);

  const totalPrice = toNumber(order.total_price);
  const refundedAmount = Math.max(
    toNumber(order.total_refunded),
    refundedAmountFromRefunds,
  );
  const isCancelled =
    Boolean(order.cancelled_at) ||
    Boolean(data.cancelled_at) ||
    paymentStatus === "voided" ||
    paymentStatus === "cancelled";

  const hasAnyRefund =
    refundedAmount > 0 ||
    paymentStatus === "refunded" ||
    paymentStatus === "partially_refunded";
  const isPartialRefund =
    paymentStatus === "partially_refunded" ||
    (hasAnyRefund && refundedAmount > 0 && refundedAmount < totalPrice);
  const isFullRefund =
    paymentStatus === "refunded" ||
    (hasAnyRefund && totalPrice > 0 && refundedAmount >= totalPrice);
  const isPaid = paymentStatus === "paid" || paymentStatus === "partially_paid";
  const isFulfilled = fulfillmentStatus === "fulfilled";

  return {
    paymentStatus,
    fulfillmentStatus,
    refundedAmount,
    totalPrice,
    isCancelled,
    hasAnyRefund,
    isPartialRefund,
    isFullRefund,
    isPaid,
    isFulfilled,
    orderNumberNumeric: toNumber(order.order_number),
    createdAtDate: new Date(order.created_at),
  };
};

const startOfDay = (dateString) => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (dateString) => {
  const date = new Date(dateString);
  date.setHours(23, 59, 59, 999);
  return date;
};

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await api.get("/shopify/orders");
      setOrders(Array.isArray(response.data) ? response.data : []);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Error fetching orders:", requestError);
      if (!silent) {
        setOrders([]);
        setError("Failed to load orders");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const interval = setInterval(() => {
      fetchOrders({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchOrders({ silent: true });
    });

    const onFocus = () => fetchOrders({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchOrders]);

  const ordersWithMeta = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        _meta: getOrderMeta(order),
      })),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let result = [...ordersWithMeta];

    if (filters.searchTerm.trim()) {
      const keyword = filters.searchTerm.trim().toLowerCase();
      result = result.filter((order) => {
        const customerName = String(order.customer_name || "").toLowerCase();
        const customerEmail = String(order.customer_email || "").toLowerCase();
        const orderNumber = String(order.order_number || "");
        const shopifyId = String(order.shopify_id || "");
        return (
          customerName.includes(keyword) ||
          customerEmail.includes(keyword) ||
          orderNumber.includes(keyword) ||
          shopifyId.includes(keyword)
        );
      });
    }

    if (filters.dateFrom) {
      const from = startOfDay(filters.dateFrom);
      result = result.filter((order) => order._meta.createdAtDate >= from);
    }

    if (filters.dateTo) {
      const to = endOfDay(filters.dateTo);
      result = result.filter((order) => order._meta.createdAtDate <= to);
    }

    if (filters.orderNumberFrom) {
      const minOrderNumber = toNumber(filters.orderNumberFrom);
      result = result.filter(
        (order) => order._meta.orderNumberNumeric >= minOrderNumber,
      );
    }

    if (filters.orderNumberTo) {
      const maxOrderNumber = toNumber(filters.orderNumberTo);
      result = result.filter(
        (order) => order._meta.orderNumberNumeric <= maxOrderNumber,
      );
    }

    if (filters.amountMin) {
      const minAmount = toNumber(filters.amountMin);
      result = result.filter((order) => order._meta.totalPrice >= minAmount);
    }

    if (filters.amountMax) {
      const maxAmount = toNumber(filters.amountMax);
      result = result.filter((order) => order._meta.totalPrice <= maxAmount);
    }

    if (filters.paymentFilter !== "all") {
      result = result.filter((order) => {
        const status = order._meta.paymentStatus;
        if (filters.paymentFilter === "pending_or_authorized") {
          return status === "pending" || status === "authorized";
        }
        if (filters.paymentFilter === "paid_or_partial") {
          return status === "paid" || status === "partially_paid";
        }
        return status === filters.paymentFilter;
      });
    }

    if (filters.fulfillmentFilter !== "all") {
      result = result.filter((order) => {
        const status = order._meta.fulfillmentStatus;
        if (filters.fulfillmentFilter === "unfulfilled") {
          return !status || status === "unfulfilled" || status === "null";
        }
        return status === filters.fulfillmentFilter;
      });
    }

    if (filters.refundFilter !== "all") {
      result = result.filter((order) => {
        if (filters.refundFilter === "any") return order._meta.hasAnyRefund;
        if (filters.refundFilter === "partial") return order._meta.isPartialRefund;
        if (filters.refundFilter === "full") return order._meta.isFullRefund;
        if (filters.refundFilter === "none") return !order._meta.hasAnyRefund;
        return true;
      });
    }

    if (filters.cancelledOnly) {
      result = result.filter((order) => order._meta.isCancelled);
    }

    if (filters.fulfilledOnly) {
      result = result.filter((order) => order._meta.isFulfilled);
    }

    if (filters.paidOnly) {
      result = result.filter((order) => order._meta.isPaid);
    }

    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "amount_desc":
          return b._meta.totalPrice - a._meta.totalPrice;
        case "amount_asc":
          return a._meta.totalPrice - b._meta.totalPrice;
        case "order_desc":
          return b._meta.orderNumberNumeric - a._meta.orderNumberNumeric;
        case "order_asc":
          return a._meta.orderNumberNumeric - b._meta.orderNumberNumeric;
        case "newest":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });

    return result;
  }, [filters, ordersWithMeta]);

  const summary = useMemo(() => {
    const totalAmount = filteredOrders.reduce(
      (sum, order) => sum + order._meta.totalPrice,
      0,
    );
    const paidCount = filteredOrders.filter((order) => order._meta.isPaid).length;
    const fulfilledCount = filteredOrders.filter(
      (order) => order._meta.isFulfilled,
    ).length;
    const refundedCount = filteredOrders.filter(
      (order) => order._meta.hasAnyRefund,
    ).length;

    return {
      totalOrders: filteredOrders.length,
      totalAmount,
      paidCount,
      fulfilledCount,
      refundedCount,
    };
  }, [filteredOrders]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "paid" || normalized === "completed") {
      return "bg-green-100 text-green-800";
    }
    if (normalized === "pending" || normalized === "authorized") {
      return "bg-yellow-100 text-yellow-800";
    }
    if (normalized === "partially_paid" || normalized === "partially_refunded") {
      return "bg-blue-100 text-blue-800";
    }
    if (normalized === "refunded" || normalized === "voided") {
      return "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const getFulfillmentColor = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "fulfilled") return "bg-green-100 text-green-800";
    if (normalized === "partial") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Orders</h1>
              <p className="text-slate-600">
                Full filtering by date, status, payment, fulfillment, and refund type.
              </p>
              {lastUpdatedAt && (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                  <Clock3 size={12} />
                  Last refresh: {lastUpdatedAt.toLocaleTimeString("ar-EG")}
                </p>
              )}
            </div>
            <button
              onClick={() => fetchOrders()}
              disabled={loading}
              className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <SummaryCard
              label="Orders"
              value={summary.totalOrders.toLocaleString()}
              icon={ShoppingCart}
              color="from-blue-500 to-blue-700"
            />
            <SummaryCard
              label="Total Value"
              value={`$${summary.totalAmount.toFixed(2)}`}
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-700"
            />
            <SummaryCard
              label="Paid"
              value={summary.paidCount.toLocaleString()}
              icon={TrendingUp}
              color="from-violet-500 to-violet-700"
            />
            <SummaryCard
              label="Fulfilled"
              value={summary.fulfilledCount.toLocaleString()}
              icon={TrendingUp}
              color="from-teal-500 to-teal-700"
            />
            <SummaryCard
              label="Refunded"
              value={summary.refundedCount.toLocaleString()}
              icon={AlertCircle}
              color="from-rose-500 to-rose-700"
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Order Filters</h2>
              <button
                onClick={resetFilters}
                className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Customer, email, order #..."
                    value={filters.searchTerm}
                    onChange={(event) =>
                      handleFilterChange("searchTerm", event.target.value)
                    }
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">From Date</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => handleFilterChange("dateFrom", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">To Date</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => handleFilterChange("dateTo", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Order # From</label>
                <input
                  type="number"
                  value={filters.orderNumberFrom}
                  onChange={(event) =>
                    handleFilterChange("orderNumberFrom", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Order # To</label>
                <input
                  type="number"
                  value={filters.orderNumberTo}
                  onChange={(event) =>
                    handleFilterChange("orderNumberTo", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount Min</label>
                <input
                  type="number"
                  value={filters.amountMin}
                  onChange={(event) => handleFilterChange("amountMin", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount Max</label>
                <input
                  type="number"
                  value={filters.amountMax}
                  onChange={(event) => handleFilterChange("amountMax", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Status</label>
                <select
                  value={filters.paymentFilter}
                  onChange={(event) =>
                    handleFilterChange("paymentFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="paid_or_partial">Paid + Partial</option>
                  <option value="pending_or_authorized">Pending + Authorized</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="pending">Pending</option>
                  <option value="authorized">Authorized</option>
                  <option value="refunded">Refunded</option>
                  <option value="partially_refunded">Partially Refunded</option>
                  <option value="voided">Voided</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Fulfillment</label>
                <select
                  value={filters.fulfillmentFilter}
                  onChange={(event) =>
                    handleFilterChange("fulfillmentFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="partial">Partial</option>
                  <option value="unfulfilled">Unfulfilled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Refund Filter</label>
                <select
                  value={filters.refundFilter}
                  onChange={(event) =>
                    handleFilterChange("refundFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="any">Any Refund</option>
                  <option value="partial">Partial Refund</option>
                  <option value="full">Full Refund</option>
                  <option value="none">No Refund</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Sort</label>
                <select
                  value={filters.sortBy}
                  onChange={(event) => handleFilterChange("sortBy", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="amount_desc">Amount (High)</option>
                  <option value="amount_asc">Amount (Low)</option>
                  <option value="order_desc">Order # (High)</option>
                  <option value="order_asc">Order # (Low)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.paidOnly}
                  onChange={(event) => handleFilterChange("paidOnly", event.target.checked)}
                />
                Paid only
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.fulfilledOnly}
                  onChange={(event) =>
                    handleFilterChange("fulfilledOnly", event.target.checked)
                  }
                />
                Fulfilled only
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.cancelledOnly}
                  onChange={(event) =>
                    handleFilterChange("cancelledOnly", event.target.checked)
                  }
                />
                Cancelled only
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Order
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Items
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Payment
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Fulfillment
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Refund
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="px-6 py-10 text-center text-slate-500">
                        Loading orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          #{order.order_number || order.shopify_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-800">
                            {order.customer_name || "Unknown"}
                          </p>
                          <p className="text-xs text-slate-500">{order.customer_email || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {toNumber(order.items_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          {order._meta.totalPrice.toFixed(2)} {order.currency || "USD"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                              order._meta.paymentStatus,
                            )}`}
                          >
                            {order._meta.paymentStatus || "n/a"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getFulfillmentColor(
                              order._meta.fulfillmentStatus,
                            )}`}
                          >
                            {order._meta.fulfillmentStatus || "unfulfilled"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {order._meta.hasAnyRefund ? (
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                order._meta.isPartialRefund
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {order._meta.isPartialRefund ? "Partial" : "Full"}
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                              None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                            className="text-sky-700 hover:text-sky-900 flex items-center gap-1 text-sm font-medium"
                          >
                            <Eye size={15} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" className="px-6 py-12 text-center text-slate-500">
                        <ShoppingCart size={44} className="mx-auto mb-3 text-slate-300" />
                        <p className="font-semibold mb-1">No matching orders found</p>
                        <p className="text-sm">Try adjusting or resetting filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className={`bg-gradient-to-r ${color} rounded-xl text-white p-4`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-white/90">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon size={24} />
      </div>
    </div>
  );
}
