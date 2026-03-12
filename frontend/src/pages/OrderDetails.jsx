import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import OrderComments from "../components/OrderComments";
import {
  ArrowLeft,
  Package,
  User,
  MapPin,
  CreditCard,
  Truck,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { markSharedDataUpdated } from "../utils/realtime";

const CURRENCY_LABEL = "LE";
const PAYMENT_METHOD_LABELS = {
  shopify: "Shopify",
  instapay: "InstaPay",
  wallet: "Wallet",
  none: "None",
};

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPaymentMethod, setUpdatingPaymentMethod] = useState(false);
  const [profitData, setProfitData] = useState(null);
  const canEditOrders = hasPermission("can_edit_orders");

  useEffect(() => {
    fetchOrderDetails();
    if (isAdmin) {
      fetchOrderProfit();
    } else {
      setProfitData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/shopify/orders/${id}/details`);
      setOrder(response.data);
    } catch (error) {
      console.error("Error fetching order details:", error);
      showNotification("ÙØ´Ù„ ØªØ­Ù…ÙŠÙ„ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderProfit = async () => {
    try {
      const response = await api.get(`/shopify/orders/${id}/profit`);
      setProfitData(response.data);
    } catch (error) {
      console.error("Error fetching order profit:", error);
      // Don't show error notification for profit calculation failure
    }
  };


  const handleStatusChange = async (newStatus) => {
    if (newStatus === order?.status) return;

    let voidReason = "";
    if (newStatus === "voided") {
      const promptValue = window.prompt("Please enter the reason for voiding this order:");
      if (promptValue === null) return;
      voidReason = promptValue.trim();
      if (!voidReason) {
        showNotification("Void reason is required", "error");
        return;
      }
    }

    setUpdatingStatus(true);
    try {
      await api.post(`/shopify/orders/${id}/update-status`, {
        status: newStatus,
        void_reason: voidReason,
      });
      markSharedDataUpdated();
      showNotification("Order status updated successfully", "success");
      fetchOrderDetails();
    } catch (error) {
      console.error("Error updating status:", error);
      showNotification(
        error?.response?.data?.error || "Failed to update order status",
        "error",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const isShopifyPaidOrder = (orderValue) => {
    const status = String(
      orderValue?.financial_status || orderValue?.status || "",
    )
      .toLowerCase()
      .trim();
    return status === "paid" || status === "partially_paid";
  };

  const getEffectivePaymentMethod = (orderValue) => {
    if (!orderValue) return "none";
    if (isShopifyPaidOrder(orderValue)) return "shopify";
    const normalized = String(orderValue.payment_method || "").toLowerCase().trim();
    if (normalized === "instapay" || normalized === "wallet") {
      return normalized;
    }
    return "none";
  };

  const handlePaymentMethodChange = async (paymentMethod) => {
    if (!order || !canEditOrders) return;

    const currentMethod = getEffectivePaymentMethod(order);
    if (paymentMethod === currentMethod) return;

    setUpdatingPaymentMethod(true);
    try {
      const response = await api.post(`/shopify/orders/${id}/payment-method`, {
        payment_method: paymentMethod,
      });
      const nextMethod = String(response?.data?.payment_method || paymentMethod)
        .toLowerCase()
        .trim();
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              payment_method: nextMethod,
            }
          : prev,
      );
      markSharedDataUpdated();
      showNotification("Payment method updated successfully", "success");
    } catch (error) {
      console.error("Error updating payment method:", error);
      showNotification(
        error?.response?.data?.error || "Failed to update payment method",
        "error",
      );
    } finally {
      setUpdatingPaymentMethod(false);
    }
  };

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const getStatusColor = (status) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case "paid":
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
      case "authorized":
        return "bg-yellow-100 text-yellow-800";
      case "partially_paid":
      case "partially_refunded":
        return "bg-blue-100 text-blue-800";
      case "refunded":
      case "voided":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentMethodColor = (method) => {
    const normalized = String(method || "").toLowerCase();
    if (normalized === "shopify") return "bg-emerald-100 text-emerald-800";
    if (normalized === "instapay") return "bg-blue-100 text-blue-800";
    if (normalized === "wallet") return "bg-violet-100 text-violet-800";
    return "bg-slate-100 text-slate-700";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSyncStatusIcon = () => {
    if (order?.pending_sync) {
      return (
        <Clock
          size={16}
          className="text-yellow-500"
          title="ÙÙŠ Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©"
        />
      );
    }
    if (order?.sync_error) {
      return (
        <AlertCircle
          size={16}
          className="text-red-500"
          title={order.sync_error}
        />
      );
    }
    if (order?.last_synced_at) {
      return (
        <CheckCircle
          size={16}
          className="text-green-500"
          title="ØªÙ…Øª Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©"
        />
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package size={64} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨</p>
            <button
              onClick={() => navigate("/orders")}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨Ø§Øª
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Notification */}
          {notification && (
            <div
              className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
                notification.type === "success"
                  ? "bg-green-500 text-white"
                  : notification.type === "error"
                    ? "bg-red-500 text-white"
                    : "bg-blue-500 text-white"
              }`}
            >
              {notification.type === "success" && <CheckCircle size={20} />}
              {notification.type === "error" && <AlertCircle size={20} />}
              <span>{notification.message}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/orders")}
                className="p-2 hover:bg-gray-200 rounded-lg transition"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-800">
                    Ø·Ù„Ø¨ #{order.order_number || order.shopify_id}
                  </h1>
                  {getSyncStatusIcon()}
                </div>
                <p className="text-gray-600">
                  ØªÙ… Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡ ÙÙŠ {formatDate(order.created_at)}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="min-w-[210px]">
                <label className="block text-xs text-gray-500 mb-1">
                  Payment Method
                </label>
                <select
                  value={getEffectivePaymentMethod(order)}
                  onChange={(e) => handlePaymentMethodChange(e.target.value)}
                  disabled={!canEditOrders || updatingPaymentMethod || isShopifyPaidOrder(order)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isShopifyPaidOrder(order) && (
                    <option value="shopify">{PAYMENT_METHOD_LABELS.shopify}</option>
                  )}
                  <option value="none">{PAYMENT_METHOD_LABELS.none}</option>
                  <option value="instapay">{PAYMENT_METHOD_LABELS.instapay}</option>
                  <option value="wallet">{PAYMENT_METHOD_LABELS.wallet}</option>
                </select>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getPaymentMethodColor(
                      getEffectivePaymentMethod(order),
                    )}`}
                  >
                    {PAYMENT_METHOD_LABELS[getEffectivePaymentMethod(order)] ||
                      PAYMENT_METHOD_LABELS.none}
                  </span>
                  {isShopifyPaidOrder(order) && (
                    <span className="text-[11px] text-gray-500">
                      Locked: paid on Shopify
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-[210px]">
                <label className="block text-xs text-gray-500 mb-1">
                  Payment Status
                </label>
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={!canEditOrders || updatingStatus}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="pending">Pending</option>
                  <option value="authorized">Authorized</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="voided">Voided</option>
                  <option value="partially_refunded">Partially Refunded</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Line Items */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Package size={20} />
                  Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ({order.line_items?.length || 0})
                </h2>
                <div className="space-y-4">
                  {order.line_items?.map((item, index) => (
                    <div
                      key={index}
                      className="flex gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <Package size={32} className="text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">
                          {item.title}
                        </h3>
                        {item.variant_title && (
                          <p className="text-sm text-gray-600">
                            {item.variant_title}
                          </p>
                        )}
                        {item.sku && (
                          <p className="text-xs text-gray-500">
                            SKU: {item.sku}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-sm text-gray-600">
                            Ø§Ù„ÙƒÙ…ÙŠØ©: {item.quantity}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {item.price} {CURRENCY_LABEL}
                          </span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold text-gray-800">
                          {(item.quantity * parseFloat(item.price)).toFixed(2)}{" "}
                          {CURRENCY_LABEL}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Totals */}
                <div className="mt-6 pt-6 border-t space-y-2">
                  <div className="flex justify-between text-gray-600">
                    <span>Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙØ±Ø¹ÙŠ:</span>
                    <span>
                      {order.subtotal_price} {CURRENCY_LABEL}
                    </span>
                  </div>
                  {order.total_tax > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨:</span>
                      <span>
                        {order.total_tax} {CURRENCY_LABEL}
                      </span>
                    </div>
                  )}
                  {order.total_shipping > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Ø§Ù„Ø´Ø­Ù†:</span>
                      <span>
                        {order.total_shipping} {CURRENCY_LABEL}
                      </span>
                    </div>
                  )}
                  {order.total_discounts > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Ø§Ù„Ø®ØµÙ…:</span>
                      <span>
                        -{order.total_discounts} {CURRENCY_LABEL}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-gray-800 pt-2 border-t">
                    <span>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ:</span>
                    <span>
                      {order.total_price} {CURRENCY_LABEL}
                    </span>
                  </div>

                  {/* Refunds Section */}
                  {order.refunds && order.refunds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-red-200 bg-red-50 rounded-lg p-4">
                      <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2">
                        <AlertCircle size={18} />
                        Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª ({order.refunds.length})
                      </h3>
                      <div className="space-y-3">
                        {order.refunds.map((refund, idx) => (
                          <div
                            key={idx}
                            className="bg-white rounded p-3 border border-red-200"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-sm text-gray-600">
                                {formatDate(refund.created_at)}
                              </span>
                              <span className="font-semibold text-red-600">
                                -
                                {refund.transactions
                                  ?.reduce(
                                    (sum, t) => sum + parseFloat(t.amount || 0),
                                    0,
                                  )
                                  .toFixed(2)}{" "}
                                {CURRENCY_LABEL}
                              </span>
                            </div>
                            {refund.note && (
                              <p className="text-sm text-gray-700">
                                {refund.note}
                              </p>
                            )}
                            {refund.refund_line_items &&
                              refund.refund_line_items.length > 0 && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <p className="font-medium">Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª:</p>
                                  {refund.refund_line_items.map((item, i) => (
                                    <p key={i}>
                                      â€¢ {item.line_item?.title} (Ø§Ù„ÙƒÙ…ÙŠØ©:{" "}
                                      {item.quantity})
                                    </p>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                        <div className="flex justify-between text-red-800 font-bold pt-2 border-t border-red-200">
                          <span>Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª:</span>
                          <span>
                            -{order.total_refunded?.toFixed(2)} {CURRENCY_LABEL}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Info */}
                  {order.cancelled_at && (
                    <div className="mt-4 pt-4 border-t border-red-200 bg-red-50 rounded-lg p-4">
                      <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={18} />
                        Ø·Ù„Ø¨ Ù…Ù„ØºÙŠ
                      </h3>
                      <div className="space-y-1 text-sm">
                        <p className="text-gray-700">
                          <span className="font-medium">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥Ù„ØºØ§Ø¡:</span>{" "}
                          {formatDate(order.cancelled_at)}
                        </p>
                        {order.cancel_reason && (
                          <p className="text-gray-700">
                            <span className="font-medium">Ø§Ù„Ø³Ø¨Ø¨:</span>{" "}
                            {order.cancel_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Profit Information */}
                  {profitData && (
                    <div className="mt-4 pt-4 border-t border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 space-y-3">
                      <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                        <TrendingUp size={18} />
                        ØªØ­Ù„ÙŠÙ„ Ø§Ù„Ø±Ø¨Ø­ÙŠØ©
                      </h3>

                      {/* Revenue */}
                      <div className="flex justify-between text-gray-700">
                        <span className="font-medium">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª:</span>
                        <span className="font-semibold">
                          {parseFloat(profitData.total_revenue || 0).toFixed(2)}{" "}
                          {CURRENCY_LABEL}
                        </span>
                      </div>

                      {/* Cost */}
                      <div className="flex justify-between text-orange-700">
                        <span className="font-medium">ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª:</span>
                        <span className="font-semibold">
                          -{parseFloat(profitData.total_cost || 0).toFixed(2)}{" "}
                          {CURRENCY_LABEL}
                        </span>
                      </div>

                      {/* Gross Profit */}
                      <div className="flex justify-between text-blue-700 pb-2 border-b border-green-200">
                        <span className="font-medium">Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ:</span>
                        <span className="font-semibold">
                          {parseFloat(profitData.gross_profit || 0).toFixed(2)}{" "}
                          {CURRENCY_LABEL}
                        </span>
                      </div>

                      {/* Operational Costs */}
                      {profitData.total_operational_costs > 0 && (
                        <div className="flex justify-between text-red-700">
                          <span className="font-medium">
                            Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ©:
                          </span>
                          <span className="font-semibold">
                            -
                            {parseFloat(
                              profitData.total_operational_costs || 0,
                            ).toFixed(2)}{" "}
                            {CURRENCY_LABEL}
                          </span>
                        </div>
                      )}

                      {/* Net Profit */}
                      <div className="flex justify-between text-green-900 pt-2 border-t-2 border-green-300">
                        <span className="font-bold text-lg">ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­:</span>
                        <span className="font-bold text-xl">
                          {parseFloat(profitData.net_profit || 0).toFixed(2)}{" "}
                          {CURRENCY_LABEL}
                        </span>
                      </div>

                      {/* Profit Margin */}
                      <div className="flex justify-between text-green-800">
                        <span className="font-medium">Ù‡Ø§Ù…Ø´ Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØµØ§ÙÙŠ:</span>
                        <span className="font-bold text-lg">
                          {parseFloat(profitData.profit_margin || 0).toFixed(2)}
                          %
                        </span>
                      </div>

                      {/* Profit Status Badge */}
                      <div className="mt-2 pt-2 border-t border-green-200">
                        {profitData.net_profit > 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-full text-sm font-semibold">
                            <CheckCircle size={14} />
                            Ø·Ù„Ø¨ Ù…Ø±Ø¨Ø­
                          </span>
                        ) : profitData.net_profit < 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-full text-sm font-semibold">
                            <AlertCircle size={14} />
                            Ø·Ù„Ø¨ Ø®Ø§Ø³Ø±
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-600 text-white rounded-full text-sm font-semibold">
                            Ø¨Ø¯ÙˆÙ† Ø±Ø¨Ø­
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <OrderComments
                orderId={order.shopify_id || ""}
                legacyOrderId={order.id}
                orderNumber={order.order_number || order.name}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <User size={18} />
                  Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø¹Ù…ÙŠÙ„
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Ø§Ù„Ø§Ø³Ù…</p>
                    <p className="font-semibold text-gray-800">
                      {order.customer_name || "ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ"}
                    </p>
                  </div>
                  {order.customer_email && (
                    <div>
                      <p className="text-sm text-gray-600">Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ</p>
                      <p className="text-gray-800">{order.customer_email}</p>
                    </div>
                  )}
                  {order.customer_phone && (
                    <div>
                      <p className="text-sm text-gray-600">Ø§Ù„Ù‡Ø§ØªÙ</p>
                      <p className="text-gray-800">{order.customer_phone}</p>
                    </div>
                  )}
                  {order.customer_info && (
                    <>
                      {order.customer_info.orders_count > 0 && (
                        <div>
                          <p className="text-sm text-gray-600">Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</p>
                          <p className="text-gray-800">
                            {order.customer_info.orders_count}
                          </p>
                        </div>
                      )}
                      {order.customer_info.total_spent && (
                        <div>
                          <p className="text-sm text-gray-600">
                            Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª
                          </p>
                          <p className="text-gray-800">
                            {order.customer_info.total_spent} {CURRENCY_LABEL}
                          </p>
                        </div>
                      )}
                      {order.customer_info.tags && (
                        <div>
                          <p className="text-sm text-gray-600">Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª</p>
                          <p className="text-gray-800">
                            {order.customer_info.tags}
                          </p>
                        </div>
                      )}
                      {order.customer_info.note && (
                        <div>
                          <p className="text-sm text-gray-600">Ù…Ù„Ø§Ø­Ø¸Ø©</p>
                          <p className="text-gray-800 text-sm">
                            {order.customer_info.note}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Shipping Address */}
              {order.shipping_address && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <MapPin size={18} />
                    Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ø´Ø­Ù†
                  </h2>
                  <div className="text-gray-700 space-y-1">
                    {(order.shipping_address.first_name ||
                      order.shipping_address.last_name) && (
                      <p className="font-semibold">
                        {order.shipping_address.first_name}{" "}
                        {order.shipping_address.last_name}
                      </p>
                    )}
                    {order.shipping_address.company && (
                      <p className="text-sm text-gray-600">
                        {order.shipping_address.company}
                      </p>
                    )}
                    {order.shipping_address.address1 && (
                      <p>{order.shipping_address.address1}</p>
                    )}
                    {order.shipping_address.address2 && (
                      <p>{order.shipping_address.address2}</p>
                    )}
                    {order.shipping_address.city && (
                      <p>
                        {order.shipping_address.city}
                        {order.shipping_address.zip &&
                          `, ${order.shipping_address.zip}`}
                      </p>
                    )}
                    {order.shipping_address.province && (
                      <p>{order.shipping_address.province}</p>
                    )}
                    {order.shipping_address.country && (
                      <p>{order.shipping_address.country}</p>
                    )}
                    {order.shipping_address.phone && (
                      <p className="mt-2 text-sm">
                        ðŸ“ž {order.shipping_address.phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Billing Address */}
              {order.billing_address && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <CreditCard size={18} />
                    Ø¹Ù†ÙˆØ§Ù† Ø§Ù„ÙÙˆØ§ØªÙŠØ±
                  </h2>
                  <div className="text-gray-700 space-y-1">
                    {(order.billing_address.first_name ||
                      order.billing_address.last_name) && (
                      <p className="font-semibold">
                        {order.billing_address.first_name}{" "}
                        {order.billing_address.last_name}
                      </p>
                    )}
                    {order.billing_address.company && (
                      <p className="text-sm text-gray-600">
                        {order.billing_address.company}
                      </p>
                    )}
                    {order.billing_address.address1 && (
                      <p>{order.billing_address.address1}</p>
                    )}
                    {order.billing_address.address2 && (
                      <p>{order.billing_address.address2}</p>
                    )}
                    {order.billing_address.city && (
                      <p>
                        {order.billing_address.city}
                        {order.billing_address.zip &&
                          `, ${order.billing_address.zip}`}
                      </p>
                    )}
                    {order.billing_address.province && (
                      <p>{order.billing_address.province}</p>
                    )}
                    {order.billing_address.country && (
                      <p>{order.billing_address.country}</p>
                    )}
                    {order.billing_address.phone && (
                      <p className="mt-2 text-sm">
                        ðŸ“ž {order.billing_address.phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Status */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <CreditCard size={18} />
                  Ø­Ø§Ù„Ø© Ø§Ù„Ø¯ÙØ¹
                </h2>
                <div className="space-y-3">
                  <span
                    className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(order.financial_status || order.status)}`}
                  >
                    {order.financial_status || order.status}
                  </span>
                  {order.payment_gateway_names &&
                    order.payment_gateway_names.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-600">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹</p>
                        <p className="text-gray-800">
                          {order.payment_gateway_names.join(", ")}
                        </p>
                      </div>
                    )}
                  {order.processing_method && (
                    <div>
                      <p className="text-sm text-gray-600">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©</p>
                      <p className="text-gray-800">{order.processing_method}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Fulfillment Status */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Truck size={18} />
                  Ø­Ø§Ù„Ø© Ø§Ù„ØªÙˆØµÙŠÙ„
                </h2>
                <div className="space-y-3">
                  <span
                    className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                      order.fulfillment_status === "fulfilled"
                        ? "bg-green-100 text-green-800"
                        : order.fulfillment_status === "partial"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {order.fulfillment_status || "pending"}
                  </span>
                  {order.fulfillments && order.fulfillments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-gray-600 font-medium">
                        Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø´Ø­Ù†:
                      </p>
                      {order.fulfillments.map((fulfillment, idx) => (
                        <div
                          key={idx}
                          className="text-sm bg-gray-50 p-2 rounded"
                        >
                          {fulfillment.tracking_company && (
                            <p>Ø§Ù„Ø´Ø±ÙƒØ©: {fulfillment.tracking_company}</p>
                          )}
                          {fulfillment.tracking_number && (
                            <p>Ø±Ù‚Ù… Ø§Ù„ØªØªØ¨Ø¹: {fulfillment.tracking_number}</p>
                          )}
                          {fulfillment.tracking_url && (
                            <a
                              href={fulfillment.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              ØªØªØ¨Ø¹ Ø§Ù„Ø´Ø­Ù†Ø©
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Method */}
              {order.shipping_lines && order.shipping_lines.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø´Ø­Ù†
                  </h2>
                  {order.shipping_lines.map((line, idx) => (
                    <div key={idx} className="space-y-1">
                      <p className="font-semibold text-gray-800">
                        {line.title}
                      </p>
                      <p className="text-sm text-gray-600">
                        {line.price} {CURRENCY_LABEL}
                      </p>
                      {line.code && (
                        <p className="text-xs text-gray-500">
                          Ø§Ù„ÙƒÙˆØ¯: {line.code}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Discount Codes */}
              {order.discount_codes && order.discount_codes.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø®ØµÙ…
                  </h2>
                  {order.discount_codes.map((discount, idx) => (
                    <div
                      key={idx}
                      className="bg-green-50 p-3 rounded-lg space-y-1"
                    >
                      <p className="font-semibold text-green-800">
                        {discount.code}
                      </p>
                      <p className="text-sm text-green-700">
                        {discount.amount} {CURRENCY_LABEL}
                      </p>
                      {discount.type && (
                        <p className="text-xs text-green-600">
                          Ø§Ù„Ù†ÙˆØ¹: {discount.type}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              {order.tags && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {order.tags.split(",").map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Note */}
              {order.customer_note && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„
                  </h2>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">
                    {order.customer_note}
                  </p>
                </div>
              )}

              {/* Source Information */}
              {order.source_name && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ù…ØµØ¯Ø± Ø§Ù„Ø·Ù„Ø¨
                  </h2>
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-700">
                      <span className="font-medium">Ø§Ù„Ù…ØµØ¯Ø±:</span>{" "}
                      {order.source_name}
                    </p>
                    {order.referring_site && (
                      <p className="text-gray-700">
                        <span className="font-medium">Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ù…ÙØ­ÙŠÙ„:</span>{" "}
                        {order.referring_site}
                      </p>
                    )}
                    {order.landing_site && (
                      <p className="text-gray-700">
                        <span className="font-medium">ØµÙØ­Ø© Ø§Ù„Ù‡Ø¨ÙˆØ·:</span>{" "}
                        {order.landing_site}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Sync Status */}
              {order.last_synced_at && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©
                  </h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {getSyncStatusIcon()}
                      <span className="text-gray-600">
                        {order.pending_sync
                          ? "ÙÙŠ Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©"
                          : order.sync_error
                            ? "ÙØ´Ù„Øª Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©"
                            : "ØªÙ…Øª Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©"}
                      </span>
                    </div>
                    {order.last_synced_at && (
                      <p className="text-gray-600">
                        Ø¢Ø®Ø± Ù…Ø²Ø§Ù…Ù†Ø©: {formatDate(order.last_synced_at)}
                      </p>
                    )}
                    {order.sync_error && (
                      <p className="text-red-600 text-xs">{order.sync_error}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
