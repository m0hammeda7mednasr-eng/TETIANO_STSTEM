import {
  getOrderFinancialStatus,
  getOrderGrossAmount,
  getOrderRefundedAmount,
  isCancelledOrder,
} from "./orderAnalytics.js";

const PAID_LIKE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);

const PENDING_STATUSES = new Set(["pending", "authorized"]);

export const getOrderGrossSalesAmount = (order) => {
  const status = getOrderFinancialStatus(order);
  if (isCancelledOrder(order) || !PAID_LIKE_STATUSES.has(status)) {
    return 0;
  }

  return getOrderGrossAmount(order);
};

export const getOrderNetSalesAmount = (order) => {
  const grossAmount = getOrderGrossSalesAmount(order);
  if (grossAmount <= 0) {
    return 0;
  }

  return Math.max(0, grossAmount - getOrderRefundedAmount(order));
};

export const isPendingDashboardOrder = (order) =>
  PENDING_STATUSES.has(getOrderFinancialStatus(order));

export const calculateDashboardOrderStats = (orders = []) => {
  const normalizedOrders = Array.isArray(orders) ? orders : [];
  const saleOrders = normalizedOrders.filter(
    (order) => getOrderNetSalesAmount(order) > 0,
  );
  const totalOrderValue = normalizedOrders.reduce(
    (sum, order) => sum + getOrderGrossSalesAmount(order),
    0,
  );
  const totalSales = saleOrders.reduce(
    (sum, order) => sum + getOrderNetSalesAmount(order),
    0,
  );
  const pendingOrderValue = normalizedOrders
    .filter((order) => isPendingDashboardOrder(order))
    .reduce((sum, order) => sum + getOrderGrossAmount(order), 0);

  return {
    saleOrders,
    totalOrderValue,
    totalSales,
    pendingOrderValue,
  };
};

const roundMetric = (value) => Number.parseFloat(Number(value || 0).toFixed(2));

export const buildDashboardSummaryPayload = ({
  orders = [],
  totalOrders = null,
  totalProducts = 0,
  totalCustomers = 0,
  lowStockProducts = 0,
  ordersWindowLimit = 0,
} = {}) => {
  const normalizedOrders = Array.isArray(orders) ? orders : [];
  const { saleOrders, totalOrderValue, totalSales, pendingOrderValue } =
    calculateDashboardOrderStats(normalizedOrders);
  const resolvedTotalOrders = Number.isFinite(Number(totalOrders))
    ? Number(totalOrders)
    : normalizedOrders.length;
  const paidOrdersCount = saleOrders.length;

  return {
    total_sales: roundMetric(totalSales),
    total_order_value: roundMetric(totalOrderValue),
    pending_order_value: roundMetric(pendingOrderValue),
    total_orders: Math.max(0, resolvedTotalOrders),
    total_products: Math.max(0, Number(totalProducts) || 0),
    total_customers: Math.max(0, Number(totalCustomers) || 0),
    low_stock_products: Math.max(0, Number(lowStockProducts) || 0),
    orders_window_limit: Math.max(0, Number(ordersWindowLimit) || 0),
    paid_orders_count: paidOrdersCount,
    avg_order_value:
      paidOrdersCount > 0 ? roundMetric(totalSales / paidOrdersCount) : 0,
  };
};
