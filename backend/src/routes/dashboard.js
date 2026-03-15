import express from "express";
import {
  Product,
  Order,
  Customer,
  getAccessibleStoreIds,
} from "../models/index.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  requireAdminRole,
  requirePermission,
} from "../middleware/permissions.js";
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
const DASHBOARD_BATCH_SIZE = 50;
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const QUERY_RETRYABLE_ERROR_CODES = new Set(["57014"]);
const dashboardStatsCache = new Map();
const dashboardAnalyticsCache = new Map();
const DASHBOARD_PRODUCT_COUNT_SELECT = "id,store_id,user_id";
const DASHBOARD_CUSTOMER_COUNT_SELECT = "id,store_id,user_id";
const DASHBOARD_ORDER_STATS_SELECT = [
  "id",
  "store_id",
  "user_id",
  "total_price",
  "total_refunded",
  "financial_status",
  "status",
  "cancelled_at",
  "created_at",
].join(",");
const DASHBOARD_ORDER_STATS_SELECTS = [
  [
    "id",
    "store_id",
    "user_id",
    "total_price",
    "status",
    "created_at",
  ].join(","),
  [
    "id",
    "store_id",
    "user_id",
    "total_price",
    "status",
    "created_at",
    "data",
  ].join(","),
  DASHBOARD_ORDER_STATS_SELECT,
  [
    "id",
    "store_id",
    "user_id",
    "total_price",
    "financial_status",
    "status",
    "cancelled_at",
    "created_at",
  ].join(","),
  [
    "id",
    "store_id",
    "user_id",
    "total_price",
    "total_refunded",
    "financial_status",
    "status",
    "cancelled_at",
    "created_at",
    "data",
  ].join(","),
];
const DASHBOARD_ORDER_ANALYTICS_SELECT = [
  "id",
  "store_id",
  "user_id",
  "customer_name",
  "customer_email",
  "fulfillment_status",
  "total_price",
  "total_refunded",
  "financial_status",
  "status",
  "cancelled_at",
  "created_at",
  "data",
].join(",");
const DASHBOARD_ORDER_ANALYTICS_SELECTS = [
  [
    "id",
    "store_id",
    "user_id",
    "customer_name",
    "customer_email",
    "fulfillment_status",
    "total_price",
    "status",
    "created_at",
  ].join(","),
  [
    "id",
    "store_id",
    "user_id",
    "customer_name",
    "customer_email",
    "fulfillment_status",
    "total_price",
    "status",
    "created_at",
    "data",
  ].join(","),
  DASHBOARD_ORDER_ANALYTICS_SELECT,
  [
    "id",
    "store_id",
    "user_id",
    "customer_name",
    "customer_email",
    "fulfillment_status",
    "total_price",
    "financial_status",
    "status",
    "cancelled_at",
    "created_at",
    "data",
  ].join(","),
];

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

const isSchemaCompatibilityError = (error) => {
  if (!error) return false;

  const code = String(error.code || "");
  if (SCHEMA_ERROR_CODES.has(code)) {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("could not find the") ||
    text.includes("relation") ||
    text.includes("column")
  );
};

const isQueryRetryableError = (error) => {
  if (!error) return false;
  if (isSchemaCompatibilityError(error)) {
    return true;
  }

  const code = String(error.code || "");
  if (QUERY_RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return text.includes("statement timeout") || text.includes("timeout");
};

const getOrderFieldFallbacks = (primaryField, { allowUnordered = false } = {}) => {
  const candidates = [
    primaryField,
    primaryField !== "created_at" ? "created_at" : null,
    primaryField !== "updated_at" ? "updated_at" : null,
    allowUnordered ? null : undefined,
    primaryField !== "id" ? "id" : null,
  ];

  return candidates.filter(
    (candidate, index) =>
      candidate !== undefined && candidates.indexOf(candidate) === index,
  );
};

const getDashboardCacheKey = (req) =>
  `${String(req.user?.id || "").trim()}::${String(getRequestedStoreId(req) || "all").trim()}`;

const getFreshCacheEntry = (cache, key) => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.updatedAt > DASHBOARD_CACHE_TTL_MS) {
    return null;
  }

  return entry;
};

const rememberCacheEntry = (cache, key, payload) => {
  cache.set(key, {
    payload,
    updatedAt: Date.now(),
  });
};

const dedupeRowsById = (rows = []) => {
  const seen = new Set();
  const uniqueRows = [];

  for (const row of rows || []) {
    const key = String(row?.id || "");
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
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

const TETIANO_STATUS_TAG_PREFIXES = ["tetiano_status:"];
const TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES = ["tetiano_status", "status"];

const parseTagList = (tagsValue) => {
  if (Array.isArray(tagsValue)) {
    return tagsValue.map((tag) => String(tag || "").trim()).filter(Boolean);
  }

  return String(tagsValue || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const extractTagValueByPrefixes = (tags, prefixes = []) => {
  for (const rawTag of tags || []) {
    const tag = String(rawTag || "").trim();
    const lowerTag = tag.toLowerCase();

    for (const prefix of prefixes) {
      const normalizedPrefix = String(prefix || "").toLowerCase();
      if (!lowerTag.startsWith(normalizedPrefix)) {
        continue;
      }

      const rawValue = tag.slice(prefix.length).trim();
      if (rawValue) {
        return rawValue;
      }
    }
  }

  return "";
};

const getNoteAttributeValue = (data, keys = []) => {
  const normalizedKeys = new Set(
    (keys || [])
      .map((key) =>
        String(key || "")
          .toLowerCase()
          .trim(),
      )
      .filter(Boolean),
  );
  const attributes = Array.isArray(data?.note_attributes)
    ? data.note_attributes
    : [];

  for (const attribute of attributes) {
    const name = String(attribute?.name || "")
      .toLowerCase()
      .trim();
    if (!normalizedKeys.has(name)) {
      continue;
    }

    const value = String(attribute?.value || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
};

const getTetianoStatus = (data = {}) => {
  const directStatus = String(data?.tetiano_status || "")
    .toLowerCase()
    .trim();
  if (directStatus) {
    return directStatus;
  }

  const noteAttributeStatus = String(
    getNoteAttributeValue(data, TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES),
  )
    .toLowerCase()
    .trim();
  if (noteAttributeStatus) {
    return noteAttributeStatus;
  }

  return String(
    extractTagValueByPrefixes(parseTagList(data?.tags), TETIANO_STATUS_TAG_PREFIXES),
  )
    .toLowerCase()
    .trim();
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
  return String(
    getTetianoStatus(data) ||
      data?.financial_status ||
      order?.financial_status ||
      order?.status ||
      "",
  )
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
        (transactionSum, transaction) =>
          transactionSum + toNumber(transaction?.amount),
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

const isPaidOrder = (order) =>
  PAID_STATUSES.has(getOrderFinancialStatus(order));

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

const getOrderBookedGrossAmount = (order) => {
  if (isCancelledOrder(order)) {
    return 0;
  }

  return getOrderGrossAmount(order);
};

const getOrderBookedNetAmount = (order) => {
  const grossAmount = getOrderBookedGrossAmount(order);
  if (grossAmount <= 0) {
    return 0;
  }

  return Math.max(0, grossAmount - getOrderRefundedAmount(order));
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

  let sourceResult;

  if (isAdmin) {
    // Admin gets all data
    sourceResult = await entityModel.findAll();
  } else {
    // Regular users get only their accessible data — no fallback to all data
    sourceResult = await entityModel.findByUser(req.user.id);
  }

  return applyStoreFilter(sourceResult.data || [], requestedStoreId);
};

const getScopedRowsBatched = async (
  req,
  entityModel,
  {
    select = "*",
    selects = null,
    orderField = "created_at",
    allowUnorderedFallback = false,
  } = {},
) => {
  const tableName =
    entityModel === Product
      ? "products"
      : entityModel === Order
        ? "orders"
        : entityModel === Customer
          ? "customers"
          : null;

  if (!tableName) {
    throw new Error("Unsupported dashboard entity model");
  }

  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = req.user?.role === "admin";
  const accessibleStoreIds = isAdmin
    ? []
    : await getAccessibleStoreIds(req.user.id);
  const rows = [];

  const loadBatch = async (
    selectedColumns,
    currentOrderField,
    offset,
    useLegacyUserScope,
  ) => {
    let query = supabase.from(tableName).select(selectedColumns);

    if (currentOrderField) {
      query = query.order(currentOrderField, { ascending: false });
    }

    query = query.range(offset, offset + DASHBOARD_BATCH_SIZE - 1);

    if (!isAdmin) {
      if (!useLegacyUserScope && accessibleStoreIds.length > 0) {
        query = query.in("store_id", accessibleStoreIds);
      } else {
        query = query.eq("user_id", req.user.id);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data || [];
  };

  const selectCandidates = [
    ...(Array.isArray(selects) ? selects : []),
    ...(select ? [select] : []),
  ].filter(Boolean);
  const orderFieldCandidates = getOrderFieldFallbacks(orderField, {
    allowUnordered: allowUnorderedFallback,
  });

  let lastError = null;

  for (const selectedColumns of selectCandidates) {
    for (const currentOrderField of orderFieldCandidates) {
      rows.length = 0;
      let offset = 0;
      let useLegacyUserScope = false;

      try {
        while (true) {
          const batch = await loadBatch(
            selectedColumns,
            currentOrderField,
            offset,
            useLegacyUserScope,
          );

          if (
            !isAdmin &&
            accessibleStoreIds.length > 0 &&
            offset === 0 &&
            batch.length === 0 &&
            !useLegacyUserScope
          ) {
            useLegacyUserScope = true;
            continue;
          }

          rows.push(...batch);

          if (batch.length < DASHBOARD_BATCH_SIZE) {
            return applyStoreFilter(dedupeRowsById(rows), requestedStoreId);
          }

          offset += batch.length;
        }
      } catch (error) {
        lastError = error;
        if (isSchemaCompatibilityError(error)) {
          break;
        }

        if (isQueryRetryableError(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return applyStoreFilter(dedupeRowsById(rows), requestedStoreId);
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
  const cacheKey = getDashboardCacheKey(req);
  const cachedEntry = getFreshCacheEntry(dashboardStatsCache, cacheKey);
  if (cachedEntry) {
    res.setHeader("X-Dashboard-Cache", "hit");
    return res.json(cachedEntry.payload);
  }

  try {
    const [products, orders, customers] = await Promise.all([
      getScopedRowsBatched(req, Product, {
        select: DASHBOARD_PRODUCT_COUNT_SELECT,
        allowUnorderedFallback: true,
      }),
      getScopedRowsBatched(req, Order, {
        selects: DASHBOARD_ORDER_STATS_SELECTS,
        allowUnorderedFallback: true,
      }),
      getScopedRowsBatched(req, Customer, {
        select: DASHBOARD_CUSTOMER_COUNT_SELECT,
        allowUnorderedFallback: true,
      }),
    ]);

    const saleOrders = orders.filter(
      (order) => getOrderNetSalesAmount(order) > 0,
    );
    const totalOrderValue = orders.reduce(
      (sum, order) => sum + getOrderGrossAmount(order),
      0,
    );
    const totalSales = saleOrders.reduce(
      (sum, order) => sum + getOrderNetSalesAmount(order),
      0,
    );
    const pendingOrderValue = orders
      .filter((order) => isPendingOrder(order))
      .reduce((sum, order) => sum + getOrderGrossAmount(order), 0);

    const payload = {
      total_sales: parseFloat(totalSales.toFixed(2)),
      total_order_value: parseFloat(totalOrderValue.toFixed(2)),
      pending_order_value: parseFloat(pendingOrderValue.toFixed(2)),
      total_orders: orders.length,
      total_products: products.length,
      total_customers: customers.length,
      avg_order_value:
        saleOrders.length > 0
          ? parseFloat((totalSales / saleOrders.length).toFixed(2))
          : 0,
    };

    rememberCacheEntry(dashboardStatsCache, cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error("Dashboard stats error:", error);
    const staleEntry = dashboardStatsCache.get(cacheKey);
    if (staleEntry?.payload) {
      res.setHeader("X-Dashboard-Cache", "stale");
      return res.json(staleEntry.payload);
    }
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// Advanced analytics (admin only)
router.get(
  "/analytics",
  authenticateToken,
  requireAdminRole,
  async (req, res) => {
    const cacheKey = getDashboardCacheKey(req);
    const cachedEntry = getFreshCacheEntry(dashboardAnalyticsCache, cacheKey);
    if (cachedEntry) {
      res.setHeader("X-Dashboard-Cache", "hit");
      return res.json(cachedEntry.payload);
    }

    try {
      const [orders, customers] = await Promise.all([
        getScopedRowsBatched(req, Order, {
          selects: DASHBOARD_ORDER_ANALYTICS_SELECTS,
          allowUnorderedFallback: true,
        }),
        getScopedRowsBatched(req, Customer, {
          select: DASHBOARD_CUSTOMER_COUNT_SELECT,
          allowUnorderedFallback: true,
        }),
      ]);

      const allOrders = orders || [];
      const paidOrders = allOrders.filter((order) => isPaidOrder(order));
      const refundedOrders = allOrders.filter((order) =>
        isRefundedOrder(order),
      );
      const cancelledOrders = allOrders.filter((order) =>
        isCancelledOrder(order),
      );

      const ordersByStatus = {
        pending: allOrders.filter((order) => isPendingOrder(order)).length,
        paid: paidOrders.length,
        refunded: refundedOrders.length,
        cancelled: cancelledOrders.length,
        fulfilled: allOrders.filter((o) => {
          const s = String(o.fulfillment_status || "")
            .toLowerCase()
            .trim();
          return s === "fulfilled";
        }).length,
        unfulfilled: allOrders.filter((o) => {
          const s = String(o.fulfillment_status || "")
            .toLowerCase()
            .trim();
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
          const productKey = String(
            item.product_id || item.id || item.sku || "",
          );
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
      const payload = {
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
              ? parseFloat(
                ((ordersByStatus.paid / totalOrders) * 100).toFixed(2),
              )
              : 0,
          cancellationRate:
            totalOrders > 0
              ? parseFloat(
                ((ordersByStatus.cancelled / totalOrders) * 100).toFixed(2),
              )
              : 0,
          refundRate:
            totalOrders > 0
              ? parseFloat(
                ((ordersByStatus.refunded / totalOrders) * 100).toFixed(2),
              )
              : 0,
        },
      };

      rememberCacheEntry(dashboardAnalyticsCache, cacheKey, payload);
      res.json(payload);
    } catch (error) {
      console.error("Analytics error:", error);
      const staleEntry = dashboardAnalyticsCache.get(cacheKey);
      if (staleEntry?.payload) {
        res.setHeader("X-Dashboard-Cache", "stale");
        return res.json(staleEntry.payload);
      }
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  },
);

// Customers list
router.get(
  "/customers",
  authenticateToken,
  requirePermission("can_view_customers"),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;

      const customers = await getScopedRowsBatched(req, Customer);
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
router.get(
  "/products",
  authenticateToken,
  requireAdminRole,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;

      const [products, orders] = await Promise.all([
        getScopedRowsBatched(req, Product),
        getScopedRowsBatched(req, Order),
      ]);

      const profitabilityOrders = orders.filter(
        (order) => getOrderBookedNetAmount(order) > 0,
      );

      const salesByProduct = new Map();
      const ordersByProduct = new Map();

      profitabilityOrders.forEach((order) => {
        const grossOrderAmount = getOrderBookedGrossAmount(order);
        const netOrderAmount = getOrderBookedNetAmount(order);
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
      const scopedUserId = req.user?.role === "admin" ? null : req.user?.id;
      const [productCosts, globalCosts] = await Promise.all([
        getOperationalCostsByProduct(productIds, scopedUserId),
        getGlobalOperationalCosts(scopedUserId),
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
      const fixedSharePerProduct =
        products.length > 0 ? totalFixedCosts / products.length : 0;

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
          perUnitCosts * soldQuantity +
          perOrderCosts * ordersCount +
          fixedProductCosts;

        const fixedShare = totalFixedCosts > 0 ? fixedSharePerProduct : 0;

        const netProfit = grossProfit - operationalCostsTotal - fixedShare;
        const profitPerUnit = soldQuantity > 0 ? netProfit / soldQuantity : 0;
        const avgSellingPrice =
          soldQuantity > 0
            ? totalRevenue / soldQuantity
            : toNumber(product.price);
        const profitMargin =
          totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

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
            toNumber(item.operational_costs_total) +
            toNumber(item.fixed_cost_share);
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
            (
              (summary.total_net_profit / summary.total_revenue) *
              100
            ).toFixed(2),
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
  },
);

// Orders list
router.get(
  "/orders",
  authenticateToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;

      const orders = await getScopedRowsBatched(req, Order);
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
router.put(
  "/products/:id",
  authenticateToken,
  requireAdminRole,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { cost_price } = req.body;

      const { data, error } = await Product.update(id, {
        cost_price: toNumber(cost_price),
      });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      res.json(data);
    } catch (error) {
      console.error("Update product cost price error:", error);
      res.status(500).json({ error: "Failed to update cost price" });
    }
  },
);

export default router;
