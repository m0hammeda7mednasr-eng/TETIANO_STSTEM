import express from "express";
import { Product, Order, Customer } from "../models/index.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireAdminRole, requirePermission } from "../middleware/permissions.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAID_STATUSES = new Set(["paid", "partially_paid"]);
const PAID_LIKE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);
const REFUNDED_STATUSES = new Set(["refunded", "partially_refunded"]);
const PENDING_STATUSES = new Set(["pending", "authorized"]);
const CANCELLED_STATUSES = new Set(["voided", "cancelled"]);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .trim()
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  const parsed = parseFloat(normalized);
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

const parseLineItems = (order) => {
  if (Array.isArray(order?.line_items)) return order.line_items;

  if (typeof order?.line_items === "string") {
    try {
      const parsed = JSON.parse(order.line_items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const data = parseOrderData(order);
  if (Array.isArray(data?.line_items)) {
    return data.line_items;
  }

  return [];
};

const getOrderFinancialStatus = (order) => {
  const data = parseOrderData(order);
  return String(order?.financial_status || order?.status || data?.financial_status || "")
    .toLowerCase()
    .trim();
};

const getOrderGrossAmount = (order) => {
  const data = parseOrderData(order);
  return toNumber(order?.total_price ?? data?.total_price);
};

const getOrderCurrentAmount = (order) => {
  const data = parseOrderData(order);
  return toNumber(order?.current_total_price ?? data?.current_total_price);
};

const getRefundedAmountFromTransactions = (order) => {
  const data = parseOrderData(order);
  const refunds = Array.isArray(data?.refunds) ? data.refunds : [];
  return refunds.reduce((sum, refund) => {
    const transactions = Array.isArray(refund?.transactions)
      ? refund.transactions
      : [];
    return (
      sum +
      transactions.reduce(
        (transactionSum, transaction) => transactionSum + toNumber(transaction?.amount),
        0,
      )
    );
  }, 0);
};

const getOrderRefundedAmount = (order) => {
  const status = getOrderFinancialStatus(order);
  const grossAmount = getOrderGrossAmount(order);
  const currentAmount = getOrderCurrentAmount(order);

  const refundedFromColumn = toNumber(order?.total_refunded);
  const refundedFromTransactions = getRefundedAmountFromTransactions(order);
  const refundedFromCurrentAmount =
    grossAmount > 0 && currentAmount > 0 && currentAmount <= grossAmount
      ? grossAmount - currentAmount
      : 0;

  let refundedAmount = Math.max(
    refundedFromColumn,
    refundedFromTransactions,
    refundedFromCurrentAmount,
  );

  // Full refund status without refund breakdown should still zero out revenue.
  if (status === "refunded" && refundedAmount <= 0 && grossAmount > 0) {
    refundedAmount = grossAmount;
  }

  return Math.min(grossAmount, Math.max(0, refundedAmount));
};

const isCancelledOrder = (order) => {
  const data = parseOrderData(order);
  const status = getOrderFinancialStatus(order);
  return (
    Boolean(order?.cancelled_at) ||
    Boolean(data?.cancelled_at) ||
    CANCELLED_STATUSES.has(status)
  );
};

const isPaidOrder = (order) => PAID_STATUSES.has(getOrderFinancialStatus(order));

const isRefundedOrder = (order) => {
  const status = getOrderFinancialStatus(order);
  return REFUNDED_STATUSES.has(status) || getOrderRefundedAmount(order) > 0;
};

const isPendingOrder = (order) =>
  PENDING_STATUSES.has(getOrderFinancialStatus(order));

const getOrderGrossSalesAmount = (order) => {
  const status = getOrderFinancialStatus(order);
  if (isCancelledOrder(order) || !PAID_LIKE_STATUSES.has(status)) {
    return 0;
  }
  return getOrderGrossAmount(order);
};

const getOrderNetSalesAmount = (order) => {
  const grossAmount = getOrderGrossSalesAmount(order);
  if (grossAmount <= 0) {
    return 0;
  }

  const refundedAmount = getOrderRefundedAmount(order);
  return Math.max(0, grossAmount - refundedAmount);
};

const getRequestedStoreId = (req) => {
  const value = req.headers["x-store-id"] || req.query.store_id;
  if (!value) return null;

  const normalized = String(value).trim();
  if (!UUID_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const applyStoreFilter = (rows, storeId) => {
  if (!storeId) return rows;

  const filtered = (rows || []).filter(
    (row) => row?.store_id !== undefined && String(row.store_id) === storeId,
  );

  // Legacy compatibility: if historical rows don't have store_id yet,
  // keep data visible instead of returning an empty dashboard.
  if (filtered.length === 0) {
    const hasOnlyNullStoreIds = (rows || []).every((row) => !row?.store_id);
    if (hasOnlyNullStoreIds) {
      return rows || [];
    }
  }

  return filtered;
};

const getScopedRows = async (req, entityModel) => {
  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = req.user?.role === "admin";
  const sourceResult = isAdmin
    ? await entityModel.findAll()
    : await entityModel.findByUser(req.user.id);

  return applyStoreFilter(sourceResult.data || [], requestedStoreId);
};

const getOperationalCostsByProduct = async (productIds, userId) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("operational_costs")
    .select("*")
    .in("product_id", productIds)
    .eq("is_active", true);

  // Keep non-admin costs scoped to their own rows for compatibility.
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data || [];
};

const getGlobalOperationalCosts = async (userId) => {
  let query = supabase
    .from("operational_costs")
    .select("*")
    .is("product_id", null)
    .eq("is_active", true);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data || [];
};

// Dashboard summary cards
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const [products, orders, customers] = await Promise.all([
      getScopedRows(req, Product),
      getScopedRows(req, Order),
      getScopedRows(req, Customer),
    ]);

    const saleOrders = orders.filter((order) => getOrderNetSalesAmount(order) > 0);
    const totalSales = saleOrders.reduce(
      (sum, order) => sum + getOrderNetSalesAmount(order),
      0,
    );

    res.json({
      total_sales: parseFloat(totalSales.toFixed(2)),
      total_orders: orders.length,
      total_products: products.length,
      total_customers: customers.length,
      avg_order_value:
        saleOrders.length > 0
          ? parseFloat((totalSales / saleOrders.length).toFixed(2))
          : 0,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// Advanced analytics (admin only)
router.get("/analytics", authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const [orders, customers] = await Promise.all([
      getScopedRows(req, Order),
      getScopedRows(req, Customer),
    ]);

    const allOrders = orders || [];
    const paidOrders = allOrders.filter((order) => isPaidOrder(order));
    const refundedOrders = allOrders.filter((order) => isRefundedOrder(order));
    const cancelledOrders = allOrders.filter((order) => isCancelledOrder(order));

    const ordersByStatus = {
      pending: allOrders.filter((order) => isPendingOrder(order)).length,
      paid: paidOrders.length,
      refunded: refundedOrders.length,
      cancelled: cancelledOrders.length,
      fulfilled: allOrders.filter((o) => {
        const s = String(o.fulfillment_status || "").toLowerCase().trim();
        return s === "fulfilled";
      }).length,
      unfulfilled: allOrders.filter((o) => {
        const s = String(o.fulfillment_status || "").toLowerCase().trim();
        return s === "" || s === "unfulfilled" || s === "null";
      }).length,
    };

    const totalRevenue = allOrders.reduce(
      (sum, order) => sum + getOrderGrossSalesAmount(order),
      0,
    );

    const refundedAmount = allOrders.reduce(
      (sum, order) => sum + getOrderRefundedAmount(order),
      0,
    );

    const netRevenue = Math.max(0, totalRevenue - refundedAmount);
    const revenueOrders = allOrders.filter(
      (order) => getOrderGrossSalesAmount(order) > 0,
    );

    const pendingAmount = allOrders
      .filter((order) => isPendingOrder(order))
      .reduce((sum, order) => sum + getOrderGrossAmount(order), 0);

    const now = new Date();
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthOrders = allOrders.filter((order) => {
        const created = new Date(order.created_at);
        return created >= start && created <= end;
      });

      const monthRevenue = monthOrders.reduce(
        (sum, order) => sum + getOrderNetSalesAmount(order),
        0,
      );

      monthlyTrends.push({
        month: start.toLocaleDateString("ar-EG", {
          month: "long",
          year: "numeric",
        }),
        orders: monthOrders.length,
        revenue: parseFloat(monthRevenue.toFixed(2)),
        cancelled: monthOrders.filter((o) => isCancelledOrder(o)).length,
        refunded: monthOrders.filter((o) => isRefundedOrder(o)).length,
      });
    }

    const productRevenueMap = new Map();
    revenueOrders.forEach((order) => {
      const grossOrderAmount = getOrderGrossSalesAmount(order);
      const netOrderAmount = getOrderNetSalesAmount(order);
      const netRatio =
        grossOrderAmount > 0
          ? Math.min(1, Math.max(0, netOrderAmount / grossOrderAmount))
          : 0;
      if (netRatio <= 0) {
        return;
      }
      const lineItems = parseLineItems(order);
      lineItems.forEach((item) => {
        const productKey = String(item.product_id || item.id || item.sku || "");
        if (!productKey) return;

        const quantity = toNumber(item.quantity || 0);
        const lineRevenue = toNumber(item.price || 0) * quantity * netRatio;

        const current = productRevenueMap.get(productKey) || {
          product_id: item.product_id || null,
          title: item.title || item.name || "Unknown product",
          total_revenue: 0,
          total_quantity: 0,
          orders_count: 0,
        };

        current.total_revenue += lineRevenue;
        current.total_quantity += quantity;
        current.orders_count += 1;
        productRevenueMap.set(productKey, current);
      });
    });

    const topProducts = Array.from(productRevenueMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        total_revenue: parseFloat(item.total_revenue.toFixed(2)),
      }));

    const customerMap = new Map();
    customers.forEach((customer) => {
      customerMap.set(String(customer.shopify_id || customer.id), customer);
    });

    const customerSpendMap = new Map();
    allOrders.forEach((order) => {
      const key = String(order.customer_id || order.customer_email || "");
      if (!key) return;

      const current = customerSpendMap.get(key) || {
        customer_id: order.customer_id || null,
        email: order.customer_email || order.email || "",
        name: order.customer_name || "",
        orders_count: 0,
        total_spent: 0,
      };

      current.orders_count += 1;
      current.total_spent += getOrderNetSalesAmount(order);
      customerSpendMap.set(key, current);
    });

    const topCustomers = Array.from(customerSpendMap.values())
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map((entry) => {
        const customerLookupKey = String(entry.customer_id || "");
        const customer = customerMap.get(customerLookupKey);
        return {
          ...entry,
          name: entry.name || customer?.name || customer?.customer_name || "",
          total_spent: parseFloat(entry.total_spent.toFixed(2)),
        };
      });

    const totalOrders = allOrders.length;
    res.json({
      ordersByStatus,
      financial: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        refundedAmount: parseFloat(refundedAmount.toFixed(2)),
        pendingAmount: parseFloat(pendingAmount.toFixed(2)),
        netRevenue: parseFloat(netRevenue.toFixed(2)),
      },
      monthlyTrends,
      topProducts,
      topCustomers,
      summary: {
        totalOrders,
        successRate:
          totalOrders > 0
            ? parseFloat(((ordersByStatus.paid / totalOrders) * 100).toFixed(2))
            : 0,
        cancellationRate:
          totalOrders > 0
            ? parseFloat(
                ((ordersByStatus.cancelled / totalOrders) * 100).toFixed(2),
              )
            : 0,
        refundRate:
          totalOrders > 0
            ? parseFloat(((ordersByStatus.refunded / totalOrders) * 100).toFixed(2))
            : 0,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Customers list
router.get(
  "/customers",
  authenticateToken,
  requirePermission("can_view_customers"),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;

      const customers = await getScopedRows(req, Customer);
      const sorted = [...customers].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );
      const paginated = sorted.slice(offset, offset + limit);

      res.json({
        data: paginated,
        total: sorted.length,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Dashboard customers error:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  },
);

// Products list with profitability metrics (admin only)
router.get("/products", authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const [products, orders] = await Promise.all([
      getScopedRows(req, Product),
      getScopedRows(req, Order),
    ]);

    const revenueOrders = orders.filter(
      (order) => getOrderGrossSalesAmount(order) > 0,
    );

    const salesByProduct = new Map();
    const ordersByProduct = new Map();

    revenueOrders.forEach((order) => {
      const grossOrderAmount = getOrderGrossSalesAmount(order);
      const netOrderAmount = getOrderNetSalesAmount(order);
      const netRatio =
        grossOrderAmount > 0
          ? Math.min(1, Math.max(0, netOrderAmount / grossOrderAmount))
          : 0;
      if (netRatio <= 0) {
        return;
      }
      const lineItems = parseLineItems(order);
      const orderProductSet = new Set();

      lineItems.forEach((item) => {
        const qty = toNumber(item.quantity || 0) * netRatio;
        const unitPrice = toNumber(item.price || 0);
        const revenue = qty * unitPrice;
        const keys = [
          String(item.product_id || ""),
          String(item.id || ""),
          String(item.sku || ""),
        ].filter(Boolean);

        keys.forEach((key) => {
          const current = salesByProduct.get(key) || {
            soldQuantity: 0,
            totalRevenue: 0,
          };
          current.soldQuantity += qty;
          current.totalRevenue += revenue;
          salesByProduct.set(key, current);
          orderProductSet.add(key);
        });
      });

      orderProductSet.forEach((key) => {
        ordersByProduct.set(key, (ordersByProduct.get(key) || 0) + 1);
      });
    });

    const productIds = products.map((p) => p.id);
    const [productCosts, globalCosts] = await Promise.all([
      getOperationalCostsByProduct(productIds, null),
      getGlobalOperationalCosts(null),
    ]);

    const costsByProductId = new Map();
    productCosts.forEach((cost) => {
      const list = costsByProductId.get(cost.product_id) || [];
      list.push(cost);
      costsByProductId.set(cost.product_id, list);
    });

    const totalFixedCosts = globalCosts.reduce((sum, cost) => {
      if (String(cost.apply_to || "") === "fixed") {
        return sum + toNumber(cost.amount);
      }
      return sum;
    }, 0);

    const metrics = products.map((product) => {
      const productKeys = [
        String(product.id),
        String(product.shopify_id || ""),
        String(product.sku || ""),
      ].filter(Boolean);

      let soldQuantity = 0;
      let totalRevenue = 0;
      let ordersCount = 0;
      productKeys.forEach((key) => {
        const sales = salesByProduct.get(key);
        if (sales) {
          soldQuantity = Math.max(soldQuantity, sales.soldQuantity);
          totalRevenue = Math.max(totalRevenue, sales.totalRevenue);
        }
        const cnt = ordersByProduct.get(key) || 0;
        ordersCount = Math.max(ordersCount, cnt);
      });

      const unitCost = toNumber(product.cost_price);
      const totalCost = unitCost * soldQuantity;
      const grossProfit = totalRevenue - totalCost;

      const operationalCosts = costsByProductId.get(product.id) || [];
      const perUnitCosts = operationalCosts
        .filter((c) => String(c.apply_to || "") === "per_unit")
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      const perOrderCosts = operationalCosts
        .filter((c) => String(c.apply_to || "") === "per_order")
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      const fixedProductCosts = operationalCosts
        .filter((c) => String(c.apply_to || "") === "fixed")
        .reduce((sum, c) => sum + toNumber(c.amount), 0);

      const operationalCostsTotal =
        perUnitCosts * soldQuantity + perOrderCosts * ordersCount + fixedProductCosts;

      const fixedShare =
        soldQuantity > 0 && totalFixedCosts > 0
          ? (soldQuantity /
              Math.max(
                1,
                products.reduce((sum, p) => {
                  const keys = [
                    String(p.id),
                    String(p.shopify_id || ""),
                    String(p.sku || ""),
                  ].filter(Boolean);
                  let qty = 0;
                  keys.forEach((k) => {
                    const val = salesByProduct.get(k);
                    if (val) qty = Math.max(qty, val.soldQuantity);
                  });
                  return sum + qty;
                }, 0),
              )) *
            totalFixedCosts
          : 0;

      const netProfit = grossProfit - operationalCostsTotal - fixedShare;
      const profitPerUnit = soldQuantity > 0 ? netProfit / soldQuantity : 0;
      const avgSellingPrice = soldQuantity > 0 ? totalRevenue / soldQuantity : toNumber(product.price);
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        ...product,
        sold_quantity: soldQuantity,
        orders_count: ordersCount,
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        total_cost: parseFloat(totalCost.toFixed(2)),
        gross_profit: parseFloat(grossProfit.toFixed(2)),
        operational_costs_total: parseFloat(operationalCostsTotal.toFixed(2)),
        fixed_cost_share: parseFloat(fixedShare.toFixed(2)),
        net_profit: parseFloat(netProfit.toFixed(2)),
        profit_per_unit: parseFloat(profitPerUnit.toFixed(2)),
        avg_selling_price: parseFloat(avgSellingPrice.toFixed(2)),
        profit_margin: parseFloat(profitMargin.toFixed(2)),
      };
    });

    const sorted = metrics.sort((a, b) => b.total_revenue - a.total_revenue);
    const paginated = sorted.slice(offset, offset + limit);

    const summary = sorted.reduce(
      (acc, item) => {
        acc.total_revenue += toNumber(item.total_revenue);
        acc.total_cost += toNumber(item.total_cost);
        acc.total_operational_costs +=
          toNumber(item.operational_costs_total) + toNumber(item.fixed_cost_share);
        acc.total_net_profit += toNumber(item.net_profit);
        acc.total_sold_units += toNumber(item.sold_quantity);
        return acc;
      },
      {
        total_revenue: 0,
        total_cost: 0,
        total_operational_costs: 0,
        total_net_profit: 0,
        total_sold_units: 0,
      },
    );

    summary.profit_margin =
      summary.total_revenue > 0
        ? parseFloat(
            ((summary.total_net_profit / summary.total_revenue) * 100).toFixed(2),
          )
        : 0;

    res.json({
      data: paginated,
      total: sorted.length,
      limit,
      offset,
      summary: {
        total_revenue: parseFloat(summary.total_revenue.toFixed(2)),
        total_cost: parseFloat(summary.total_cost.toFixed(2)),
        total_operational_costs: parseFloat(
          summary.total_operational_costs.toFixed(2),
        ),
        total_net_profit: parseFloat(summary.total_net_profit.toFixed(2)),
        total_sold_units: parseFloat(summary.total_sold_units.toFixed(2)),
        profit_margin: summary.profit_margin,
      },
    });
  } catch (error) {
    console.error("Dashboard products error:", error);
    res.status(500).json({ error: "Failed to fetch products profitability" });
  }
});

// Orders list
router.get(
  "/orders",
  authenticateToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;

      const orders = await getScopedRows(req, Order);
      const sorted = [...orders].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );
      const paginated = sorted.slice(offset, offset + limit);

      res.json({
        data: paginated,
        total: sorted.length,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Dashboard orders error:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  },
);

// Update product cost price (admin only)
router.put("/products/:id", authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const { id } = req.params;
    const { cost_price } = req.body;

    const { data, error } = await Product.update(id, { cost_price: toNumber(cost_price) });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error("Update product cost price error:", error);
    res.status(500).json({ error: "Failed to update cost price" });
  }
});

export default router;
