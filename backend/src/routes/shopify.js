import express from "express";
import axios from "axios";
import {
  ShopifyToken,
  Product,
  Order,
  Customer,
  getAccessibleStoreIds,
} from "../models/index.js";
import { ShopifyService } from "../services/shopifyService.js";
import { ProductUpdateService } from "../services/productUpdateService.js";
import { OrderManagementService } from "../services/orderManagementService.js";
import { ProductManagementService } from "../services/productManagementService.js";
import {
  ensureWebhooksRegistered,
  getWebhookAddress,
  removeManagedWebhooks,
} from "../services/shopifyWebhookService.js";
import jwt from "jsonwebtoken";
import {
  getUserRole,
  normalizeRole,
  requireAdminRole,
  requirePermission,
} from "../middleware/permissions.js";

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to get user-specific shopify credentials
const getShopifyCredentials = async (userId) => {
  const { supabase } = await import("../supabaseClient.js");
  const { data, error } = await supabase
    .from("shopify_credentials")
    .select("api_key, api_secret")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Shopify credentials not found for this user.");
  }
  return { apiKey: data.api_key, apiSecret: data.api_secret };
};

// Helper to construct the redirect URI
const getRedirectUri = (req) => {
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/shopify/callback`;
  }
  // Fallback for local development
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/api/shopify/callback`;
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );
    const normalizedRole = normalizeRole(decoded.role);
    req.user = {
      ...decoded,
      role: normalizedRole,
      isAdmin: normalizedRole === "admin",
    };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const resolveIsAdmin = async (req) => {
  if (req.user?.role === "admin") {
    return true;
  }

  const role = await getUserRole(req.user?.id);
  if (role === "admin") {
    req.user.role = "admin";
    return true;
  }

  return false;
};

const getRequestedStoreId = (req) => {
  const fromHeader = req.headers["x-store-id"];
  const fromBody = req.body?.store_id;
  const fromQuery = req.query?.store_id;

  const value = fromHeader || fromBody || fromQuery;
  if (!value) return null;

  const normalized = String(value).trim();
  if (!UUID_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const resolveSyncToken = async ({ userId, requestedStoreId, isAdmin }) => {
  const { supabase } = await import("../supabaseClient.js");

  let accessibleStoreIds = [];
  if (!isAdmin) {
    accessibleStoreIds = await getAccessibleStoreIds(userId);
  }

  if (requestedStoreId) {
    if (
      !isAdmin &&
      accessibleStoreIds.length > 0 &&
      !accessibleStoreIds.includes(requestedStoreId)
    ) {
      return null;
    }

    const { data: tokenByRequestedStore } = await supabase
      .from("shopify_tokens")
      .select("*")
      .eq("store_id", requestedStoreId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenByRequestedStore) {
      return tokenByRequestedStore;
    }
  }

  const { data: tokenByUser } = await ShopifyToken.findByUser(
    userId,
    requestedStoreId,
  );
  if (tokenByUser) {
    return tokenByUser;
  }

  if (accessibleStoreIds.length > 0) {
    const { data: tokenByAccessibleStores } = await supabase
      .from("shopify_tokens")
      .select("*")
      .in("store_id", accessibleStoreIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenByAccessibleStores) {
      return tokenByAccessibleStores;
    }
  }

  if (isAdmin) {
    const { data: fallbackAdminToken } = await supabase
      .from("shopify_tokens")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return fallbackAdminToken || null;
  }

  return null;
};

const resolveUpdateErrorStatusCode = (errorMessage) => {
  const message = String(errorMessage || "").toLowerCase();
  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("cannot") ||
    message.includes("no updates")
  ) {
    return 400;
  }
  if (message.includes("shopify")) {
    return 502;
  }
  return 500;
};

const sanitizeVariantForRole = (variant, isAdmin) => {
  if (!variant || isAdmin) {
    return variant;
  }

  const { cost, cost_price, ...safeVariant } = variant;
  return safeVariant;
};

const sanitizeProductForRole = (product, isAdmin) => {
  if (!product || isAdmin) {
    return product;
  }

  const { cost_price, data, ...safeProduct } = product;

  if (Array.isArray(safeProduct.variants)) {
    safeProduct.variants = safeProduct.variants.map((variant) =>
      sanitizeVariantForRole(variant, false),
    );
  }

  return safeProduct;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseJsonField = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
};

const normalizeOrderReference = (value) => String(value || "").trim().toLowerCase();

const findOrderByReferenceForUser = async (userId, orderReference) => {
  const normalizedReference = String(orderReference || "").trim();
  if (!normalizedReference) {
    return { data: null, error: null };
  }

  const directLookup = await Order.findByIdForUser(userId, normalizedReference);
  if (directLookup?.error || directLookup?.data) {
    return directLookup;
  }

  const { data: orders, error } = await Order.findByUser(userId);
  if (error) {
    return { data: null, error };
  }

  const referenceLower = normalizeOrderReference(normalizedReference);
  const matchedOrder = (orders || []).find((order) => {
    const orderId = normalizeOrderReference(order?.id);
    const shopifyId = normalizeOrderReference(order?.shopify_id);
    const orderNumber = normalizeOrderReference(order?.order_number);
    return (
      orderId === referenceLower ||
      shopifyId === referenceLower ||
      orderNumber === referenceLower
    );
  });

  return { data: matchedOrder || null, error: null };
};

const getOrderFinancialStatus = (order) => {
  const data = parseJsonField(order?.data);
  return String(order?.financial_status || order?.status || data?.financial_status || "")
    .toLowerCase()
    .trim();
};

const isShopifyPaidOrder = (order) => {
  const status = getOrderFinancialStatus(order);
  return status === "paid" || status === "partially_paid";
};

const resolveOrderPaymentMethod = (order) => {
  if (isShopifyPaidOrder(order)) {
    return "shopify";
  }

  const data = parseJsonField(order?.data);
  const manualMethod = String(
    order?.manual_payment_method || data?.tetiano_payment_method || "",
  )
    .toLowerCase()
    .trim();

  if (manualMethod === "instapay" || manualMethod === "wallet") {
    return manualMethod;
  }

  return "none";
};

const applyOrdersQueryFilters = (rows, query = {}) => {
  let filtered = [...(rows || [])];

  if (query.search) {
    const keyword = String(query.search).toLowerCase().trim();
    filtered = filtered.filter((order) => {
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

  if (query.date_from) {
    const from = new Date(String(query.date_from));
    from.setHours(0, 0, 0, 0);
    filtered = filtered.filter((order) => new Date(order.created_at) >= from);
  }

  if (query.date_to) {
    const to = new Date(String(query.date_to));
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter((order) => new Date(order.created_at) <= to);
  }

  if (query.order_number_from !== undefined) {
    const minOrderNumber = toNumber(query.order_number_from);
    filtered = filtered.filter(
      (order) => toNumber(order.order_number) >= minOrderNumber,
    );
  }

  if (query.order_number_to !== undefined) {
    const maxOrderNumber = toNumber(query.order_number_to);
    filtered = filtered.filter(
      (order) => toNumber(order.order_number) <= maxOrderNumber,
    );
  }

  if (query.min_total !== undefined) {
    const minTotal = toNumber(query.min_total);
    filtered = filtered.filter((order) => toNumber(order.total_price) >= minTotal);
  }

  if (query.max_total !== undefined) {
    const maxTotal = toNumber(query.max_total);
    filtered = filtered.filter((order) => toNumber(order.total_price) <= maxTotal);
  }

  if (query.payment_status && query.payment_status !== "all") {
    const paymentStatus = String(query.payment_status).toLowerCase();
    filtered = filtered.filter((order) => {
      const status = String(order.financial_status || order.status || "")
        .toLowerCase()
        .trim();
      if (paymentStatus === "paid_or_partial") {
        return status === "paid" || status === "partially_paid";
      }
      if (paymentStatus === "pending_or_authorized") {
        return status === "pending" || status === "authorized";
      }
      return status === paymentStatus;
    });
  }

  if (query.payment_method && query.payment_method !== "all") {
    const paymentMethod = String(query.payment_method).toLowerCase().trim();
    filtered = filtered.filter(
      (order) => resolveOrderPaymentMethod(order) === paymentMethod,
    );
  }

  if (query.fulfillment_status && query.fulfillment_status !== "all") {
    const fulfillmentStatus = String(query.fulfillment_status).toLowerCase();
    filtered = filtered.filter((order) => {
      const status = String(order.fulfillment_status || "").toLowerCase().trim();
      if (fulfillmentStatus === "unfulfilled") {
        return !status || status === "unfulfilled" || status === "null";
      }
      return status === fulfillmentStatus;
    });
  }

  if (query.refund_filter && query.refund_filter !== "all") {
    const refundFilter = String(query.refund_filter).toLowerCase().trim();
    filtered = filtered.filter((order) => {
      const status = String(order.financial_status || order.status || "")
        .toLowerCase()
        .trim();
      const data = parseJsonField(order.data);
      const refunds = Array.isArray(data?.refunds) ? data.refunds : [];
      const refundedFromTransactions = refunds.reduce((sum, refund) => {
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
      const totalPrice = toNumber(order.total_price);
      const refundedAmount = Math.max(
        toNumber(order.total_refunded),
        refundedFromTransactions,
      );
      const hasAnyRefund =
        refundedAmount > 0 ||
        status === "refunded" ||
        status === "partially_refunded";
      const isPartialRefund =
        status === "partially_refunded" ||
        (hasAnyRefund && refundedAmount > 0 && refundedAmount < totalPrice);
      const isFullRefund =
        status === "refunded" ||
        (hasAnyRefund && totalPrice > 0 && refundedAmount >= totalPrice);

      if (refundFilter === "any") return hasAnyRefund;
      if (refundFilter === "partial") return isPartialRefund;
      if (refundFilter === "full") return isFullRefund;
      if (refundFilter === "none") return !hasAnyRefund;
      return true;
    });
  }

  if (String(query.cancelled_only || "").toLowerCase() === "true") {
    filtered = filtered.filter((order) => {
      const data = parseJsonField(order.data);
      const status = String(order.financial_status || order.status || "")
        .toLowerCase()
        .trim();
      return (
        Boolean(order.cancelled_at) ||
        Boolean(data?.cancelled_at) ||
        status === "voided" ||
        status === "cancelled"
      );
    });
  }

  const sortBy = String(query.sort_by || "created_at").toLowerCase();
  const sortDir = String(query.sort_dir || "desc").toLowerCase() === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortBy === "total_price") {
      return (toNumber(a.total_price) - toNumber(b.total_price)) * sortDir;
    }
    if (sortBy === "order_number") {
      return (toNumber(a.order_number) - toNumber(b.order_number)) * sortDir;
    }
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * sortDir;
  });

  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limitValue = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;
  if (limit === null) return filtered;
  return filtered.slice(offset, offset + limit);
};

const applyProductsQueryFilters = (rows, query = {}) => {
  let filtered = [...(rows || [])];

  if (query.search) {
    const keyword = String(query.search).toLowerCase().trim();
    filtered = filtered.filter((product) => {
      const title = String(product.title || "").toLowerCase();
      const vendor = String(product.vendor || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      const type = String(product.product_type || "").toLowerCase();
      return (
        title.includes(keyword) ||
        vendor.includes(keyword) ||
        sku.includes(keyword) ||
        type.includes(keyword)
      );
    });
  }

  if (query.vendor && query.vendor !== "all") {
    filtered = filtered.filter(
      (product) =>
        String(product.vendor || "").toLowerCase() ===
        String(query.vendor).toLowerCase(),
    );
  }

  if (query.product_type && query.product_type !== "all") {
    filtered = filtered.filter(
      (product) =>
        String(product.product_type || "").toLowerCase() ===
        String(query.product_type).toLowerCase(),
    );
  }

  if (query.stock_status && query.stock_status !== "all") {
    const stockStatus = String(query.stock_status).toLowerCase().trim();
    filtered = filtered.filter((product) => {
      const quantity = toNumber(product.inventory_quantity);
      if (stockStatus === "out_of_stock") return quantity <= 0;
      if (stockStatus === "low_stock") return quantity > 0 && quantity < 10;
      if (stockStatus === "in_stock") return quantity >= 10;
      return true;
    });
  }

  if (query.sync_status && query.sync_status !== "all") {
    const syncStatus = String(query.sync_status).toLowerCase().trim();
    filtered = filtered.filter((product) => {
      if (syncStatus === "pending") return Boolean(product.pending_sync);
      if (syncStatus === "failed") return Boolean(product.sync_error);
      if (syncStatus === "synced") return Boolean(product.last_synced_at);
      if (syncStatus === "never")
        return !product.pending_sync && !product.sync_error && !product.last_synced_at;
      return true;
    });
  }

  if (query.min_price !== undefined) {
    const minPrice = toNumber(query.min_price);
    filtered = filtered.filter((product) => toNumber(product.price) >= minPrice);
  }

  if (query.max_price !== undefined) {
    const maxPrice = toNumber(query.max_price);
    filtered = filtered.filter((product) => toNumber(product.price) <= maxPrice);
  }

  if (query.min_inventory !== undefined) {
    const minInventory = toNumber(query.min_inventory);
    filtered = filtered.filter(
      (product) => toNumber(product.inventory_quantity) >= minInventory,
    );
  }

  if (query.max_inventory !== undefined) {
    const maxInventory = toNumber(query.max_inventory);
    filtered = filtered.filter(
      (product) => toNumber(product.inventory_quantity) <= maxInventory,
    );
  }

  if (query.updated_from) {
    const from = new Date(String(query.updated_from));
    from.setHours(0, 0, 0, 0);
    filtered = filtered.filter((product) => new Date(product.updated_at) >= from);
  }

  if (query.updated_to) {
    const to = new Date(String(query.updated_to));
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter((product) => new Date(product.updated_at) <= to);
  }

  const sortBy = String(query.sort_by || "updated_at").toLowerCase();
  const sortDir = String(query.sort_dir || "desc").toLowerCase() === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortBy === "price") return (toNumber(a.price) - toNumber(b.price)) * sortDir;
    if (sortBy === "inventory_quantity") {
      return (toNumber(a.inventory_quantity) - toNumber(b.inventory_quantity)) * sortDir;
    }
    if (sortBy === "title") {
      return String(a.title || "").localeCompare(String(b.title || "")) * sortDir;
    }
    return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * sortDir;
  });

  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limitValue = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;
  if (limit === null) return filtered;
  return filtered.slice(offset, offset + limit);
};

// 1. Get Shopify Authorization URL
router.post("/auth-url", verifyToken, async (req, res) => {
  try {
    const inputShop = String(req.body?.shop || "").trim().toLowerCase();
    const userId = req.user.id; // Changed from req.user.userId

    if (!inputShop) {
      return res.status(400).json({ error: "Shop parameter is required" });
    }

    const { apiKey } = await getShopifyCredentials(userId);
    const scopes =
      "read_products,write_products,read_orders,read_customers,write_orders";
    const redirectUri = getRedirectUri(req);

    const authUrl = `https://${inputShop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${userId}`;

    res.json({ authUrl });
  } catch (error) {
    console.error("Error getting auth URL:", error);
    res
      .status(500)
      .json({ error: "Failed to create Shopify authorization URL." });
  }
});

// 2. OAuth Callback
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const shop = String(req.query?.shop || "").trim().toLowerCase();
  const userId = state;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  if (!code || !shop || !userId) {
    return res.redirect(`${frontendUrl}/settings?error=invalid_callback`);
  }

  try {
    const { apiKey, apiSecret } = await getShopifyCredentials(userId);

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: apiKey,
        client_secret: apiSecret,
        code: code,
      },
    );

    const accessToken = response.data.access_token;
    const { supabase } = await import('../supabaseClient.js');

    // Find or create a store for the Shopify shop
    let { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('name', shop)
      .single();

    if (storeError && storeError.code === 'PGRST116') {
      // Store not found, create it
      const { data: newStore, error: newStoreError } = await supabase
        .from('stores')
        .insert({ name: shop, created_by: userId })
        .select('id')
        .single();
      if (newStoreError) throw newStoreError;
      store = newStore;
    } else if (storeError) {
      throw storeError;
    }

    const storeId = store.id;

    // Grant the user access to this store
    await supabase.from('user_stores').upsert({ user_id: userId, store_id: storeId });

    await ShopifyToken.save(userId, shop, accessToken, storeId);

    // Perform initial sync in the background
    ShopifyService.syncAllData(userId, shop, accessToken, storeId).catch((syncError) => {
      console.error("Background sync error after callback:", syncError);
    });
    ensureWebhooksRegistered({
      shop,
      accessToken,
      webhookAddress: getWebhookAddress(req),
    }).catch((webhookError) => {
      console.error("Webhook registration error after callback:", webhookError);
    });

    res.redirect(`${frontendUrl}/settings?connected=true`);
  } catch (error) {
    console.error(
      "Shopify OAuth Callback Error:",
      error.response?.data || error.message,
    );
    res.redirect(`${frontendUrl}/settings?error=callback_failed`);
  }
});

// 3. Sync data from Shopify
router.post(
  "/sync",
  verifyToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
  try {
    const userId = req.user.id; // Changed from req.user.userId
    const requestedStoreId = getRequestedStoreId(req);
    const isAdmin = await resolveIsAdmin(req);

    const tokenData = await resolveSyncToken({
      userId,
      requestedStoreId,
      isAdmin,
    });

    if (!tokenData) {
      return res
        .status(400)
        .json({
          error: "Shopify is not connected for this account/store.",
          code: "SHOPIFY_NOT_CONNECTED",
        });
    }

    const syncOwnerUserId = tokenData.user_id || userId;
    const syncStoreId = requestedStoreId || tokenData.store_id || null;

    const { products, orders, customers } = await ShopifyService.syncAllData(
      syncOwnerUserId,
      tokenData.shop,
      tokenData.access_token,
      syncStoreId,
    );
    let webhookSync = null;
    try {
      webhookSync = await ensureWebhooksRegistered({
        shop: tokenData.shop,
        accessToken: tokenData.access_token,
        webhookAddress: getWebhookAddress(req),
      });
    } catch (webhookError) {
      console.error("Webhook registration error during sync:", webhookError);
      webhookSync = {
        error: "Webhook registration failed",
      };
    }

    res.json({
      success: true,
      message: "Data synced successfully",
      store_id: syncStoreId,
      webhook_sync: webhookSync,
      counts: {
        products: products.length,
        orders: orders.length,
        customers: customers.length,
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Failed to sync data from Shopify." });
  }
  },
);

// 4. Check Shopify connection status
router.get("/status", verifyToken, async (req, res) => {
  try {
    const requestedStoreId = getRequestedStoreId(req);
    const isAdmin = await resolveIsAdmin(req);
    const tokenData = await resolveSyncToken({
      userId: req.user.id,
      requestedStoreId,
      isAdmin,
    });

    const redirectUri = getRedirectUri(req);

    res.json({
      connected: !!tokenData?.access_token,
      shop: tokenData?.shop || null,
      store_id: tokenData?.store_id || requestedStoreId || null,
      redirectUri: redirectUri,
      webhookAddress: getWebhookAddress(req),
    });
  } catch (error) {
    res.json({
      connected: false,
      shop: null,
      redirectUri: getRedirectUri(req),
      webhookAddress: getWebhookAddress(req),
    });
  }
});

router.post(
  "/disconnect",
  verifyToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
  try {
    const requestedStoreId = getRequestedStoreId(req);
    const isAdmin = await resolveIsAdmin(req);
    const userId = req.user.id;

    const tokenData = await resolveSyncToken({
      userId,
      requestedStoreId,
      isAdmin,
    });

    if (!tokenData) {
      return res.status(400).json({
        error: "Shopify is not connected for this account/store.",
        code: "SHOPIFY_NOT_CONNECTED",
      });
    }

    const isConnectionOwner = String(tokenData.user_id || "") === String(userId || "");
    const webhookAddress = getWebhookAddress(req);
    if (isConnectionOwner && webhookAddress) {
      try {
        await removeManagedWebhooks({
          shop: tokenData.shop,
          accessToken: tokenData.access_token,
          webhookAddress,
        });
      } catch (webhookError) {
        console.error("Failed to remove Shopify webhooks during disconnect:", webhookError);
      }
    }

    const { supabase } = await import("../supabaseClient.js");
    const storeId = requestedStoreId || tokenData.store_id || null;

    if (isConnectionOwner) {
      let deleteTokensQuery = supabase
        .from("shopify_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("shop", tokenData.shop);
      if (storeId) {
        deleteTokensQuery = deleteTokensQuery.eq("store_id", storeId);
      }
      const { error: deleteTokensError } = await deleteTokensQuery;
      if (deleteTokensError) {
        return res.status(500).json({ error: deleteTokensError.message });
      }
    }

    if (storeId) {
      await supabase
        .from("user_stores")
        .delete()
        .eq("user_id", userId)
        .eq("store_id", storeId);
    }

    res.json({
      success: true,
      message: isConnectionOwner
        ? "Shopify disconnected successfully."
        : "Your access to this Shopify store has been removed.",
      shop: tokenData.shop,
      store_id: storeId,
      disconnected_scope: isConnectionOwner ? "store_connection" : "user_access",
    });
  } catch (error) {
    console.error("Disconnect Shopify error:", error);
    res.status(500).json({ error: "Failed to disconnect Shopify." });
  }
  },
);

// 5. Save Shopify API credentials
router.post("/save-credentials", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id; // Changed from req.user.userId
    const { apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret) {
      return res
        .status(400)
        .json({ error: "API Key and API Secret are required." });
    }

    const { supabase } = await import("../supabaseClient.js");
    const { data: existing } = await supabase
      .from("shopify_credentials")
      .select("id")
      .eq("user_id", userId)
      .single();

    const payload = { user_id: userId, api_key: apiKey, api_secret: apiSecret };
    let error;

    if (existing) {
      const result = await supabase
        .from("shopify_credentials")
        .update({ api_key: apiKey, api_secret: apiSecret })
        .eq("user_id", userId);
      error = result.error;
    } else {
      const result = await supabase
        .from("shopify_credentials")
        .insert([payload]);
      error = result.error;
    }

    if (error) throw error;

    res.json({ success: true, message: "Credentials saved successfully." });
  } catch (error) {
    console.error("Save credentials error:", error);
    res.status(500).json({ error: "Failed to save credentials." });
  }
});

// 6. Get Shopify credentials for current user
router.get("/get-credentials", verifyToken, async (req, res) => {
  try {
    const { apiKey } = await getShopifyCredentials(req.user.id); // Changed from req.user.userId
    res.json({ hasCredentials: true, apiKey });
  } catch (error) {
    res.json({ hasCredentials: false });
  }
});

// Other data-fetching routes remain unchanged...
router.get(
  "/products",
  verifyToken,
  requirePermission("can_view_products"),
  async (req, res) => {
  try {
    const isAdmin = await resolveIsAdmin(req);
    const { data, error } = await Product.findByUser(req.user.id);
    if (error) {
      console.error("Error fetching products:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(
      `Returning ${data?.length || 0} products for user ${req.user.id}`,
    );
    const sanitizedProducts = (data || []).map((product) =>
      sanitizeProductForRole(product, isAdmin),
    );
    const filteredProducts = applyProductsQueryFilters(sanitizedProducts, req.query);
    res.json(filteredProducts);
  } catch (e) {
    console.error("Exception fetching products:", e);
    res.status(500).json({ error: e.message });
  }
  },
);
router.get(
  "/orders",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
  try {
    const { data, error } = await Order.findByUser(req.user.id);
    if (error) {
      console.error("Error fetching orders:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(
      `Returning ${data?.length || 0} orders for user ${req.user.id}`,
    );
    const normalizedOrders = (data || []).map((order) => ({
      ...order,
      payment_method: resolveOrderPaymentMethod(order),
    }));
    const filteredOrders = applyOrdersQueryFilters(normalizedOrders, req.query);
    res.json(filteredOrders);
  } catch (e) {
    console.error("Exception fetching orders:", e);
    res.status(500).json({ error: e.message });
  }
  },
);
router.get(
  "/customers",
  verifyToken,
  requirePermission("can_view_customers"),
  async (req, res) => {
  try {
    const { data, error } = await Customer.findByUser(req.user.id);
    if (error) {
      console.error("Error fetching customers:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(
      `Returning ${data?.length || 0} customers for user ${req.user.id}`,
    );
      res.json(data || []);
  } catch (e) {
    console.error("Exception fetching customers:", e);
    res.status(500).json({ error: e.message });
  }
  },
);
router.get(
  "/products/:id",
  verifyToken,
  requirePermission("can_view_products"),
  async (req, res) => {
  try {
    const isAdmin = await resolveIsAdmin(req);
    const { data, error } = await Product.findByIdForUser(
      req.user.id,
      req.params.id,
    );
    if (error) return res.status(500).json({ error: error.message });
    if (!data) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(sanitizeProductForRole(data, isAdmin));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  },
);

router.get(
  "/products/:id/details",
  verifyToken,
  requirePermission("can_view_products"),
  async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.id;
    const isAdmin = await resolveIsAdmin(req);

    const product = await ProductManagementService.getProductDetails(
      userId,
      productId,
    );

      res.json(sanitizeProductForRole(product, isAdmin));
  } catch (error) {
    console.error("Get product details error:", error);
    res.status(500).json({ error: error.message });
  }
  },
);
router.get(
  "/orders/:id",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
  try {
    const { data, error } = await Order.findByIdForUser(
      req.user.id,
      req.params.id,
    );
    if (error) return res.status(500).json({ error: error.message });
    if (!data) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  },
);

// MVP: Product Update Endpoints

router.post(
  "/products/:id/update-price",
  verifyToken,
  requirePermission("can_edit_products"),
  async (req, res) => {
  try {
    const { price } = req.body;
    const productId = req.params.id;
    const userId = req.user.id;

    if (price === undefined || price === null) {
      return res.status(400).json({ error: "Price is required" });
    }

    const result = await ProductUpdateService.updatePrice(
      userId,
      productId,
      parseFloat(price),
    );
    res.json(result);
  } catch (error) {
    console.error("Update price error:", error);
    res.status(resolveUpdateErrorStatusCode(error.message)).json({ error: error.message });
  }
  },
);

router.post(
  "/products/:id/update-inventory",
  verifyToken,
  requirePermission("can_edit_products"),
  async (req, res) => {
  try {
    const { inventory } = req.body;
    const productId = req.params.id;
    const userId = req.user.id;

    if (inventory === undefined || inventory === null) {
      return res.status(400).json({ error: "Inventory is required" });
    }

    const result = await ProductUpdateService.updateInventory(
      userId,
      productId,
      parseInt(inventory),
    );
    res.json(result);
  } catch (error) {
    console.error("Update inventory error:", error);
    res.status(resolveUpdateErrorStatusCode(error.message)).json({ error: error.message });
  }
  },
);

router.post(
  "/products/:id/update",
  verifyToken,
  requirePermission("can_edit_products"),
  async (req, res) => {
  try {
    const isAdmin = await resolveIsAdmin(req);
    const { price, cost_price, inventory } = req.body;
    const productId = req.params.id;
    const userId = req.user.id;

    if (
      (cost_price !== undefined && cost_price !== null) &&
      !isAdmin
    ) {
      return res.status(403).json({
        error: "Access denied: admin access required for cost price updates",
      });
    }

    const updates = {};
    if (price !== undefined && price !== null)
      updates.price = parseFloat(price);
    if (cost_price !== undefined && cost_price !== null)
      updates.cost_price = parseFloat(cost_price);
    if (inventory !== undefined && inventory !== null)
      updates.inventory = parseInt(inventory);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const result = await ProductUpdateService.updateProduct(
      userId,
      productId,
      updates,
    );
    res.json(result);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(resolveUpdateErrorStatusCode(error.message)).json({ error: error.message });
  }
  },
);

// Order Management Endpoints

router.get(
  "/orders/:id/details",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;

    const order = await OrderManagementService.getOrderDetails(userId, orderId);

      res.json(order);
  } catch (error) {
    console.error("Get order details error:", error);
    res.status(500).json({ error: error.message });
  }
  },
);

router.post(
  "/orders/:id/notes",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
  try {
    const { content } = req.body;
    const orderId = req.params.id;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Note content is required" });
    }

    // Get user info for author name
    const { supabase } = await import("../supabaseClient.js");
    const { data: userData } = await supabase
      .from("users")
      .select("name, email")
      .eq("id", userId)
      .single();

    const author = userData?.name || userData?.email || "مستخدم";

    const result = await OrderManagementService.addOrderNote(
      userId,
      orderId,
      content,
      author,
    );
      res.json(result);
  } catch (error) {
    console.error("Add order note error:", error);
    res.status(500).json({ error: error.message });
  }
  },
);

router.post(
  "/orders/:id/payment-method",
  verifyToken,
  requirePermission("can_edit_orders"),
  async (req, res) => {
  try {
    const allowedMethods = new Set(["none", "shopify", "instapay", "wallet"]);
    const requestedMethod = String(req.body?.payment_method || "")
      .toLowerCase()
      .trim();
    const orderId = req.params.id;
    const userId = req.user.id;

    if (!allowedMethods.has(requestedMethod)) {
      return res.status(400).json({
        error: "payment_method must be one of: none, shopify, instapay, wallet",
      });
    }

    const { data: order, error } = await findOrderByReferenceForUser(
      userId,
      orderId,
    );
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const isShopifyPaid = isShopifyPaidOrder(order);
    if (isShopifyPaid && requestedMethod !== "shopify") {
      return res.status(400).json({
        error: "This order is already paid on Shopify and must stay on Shopify payment method",
      });
    }
    if (!isShopifyPaid && requestedMethod === "shopify") {
      return res.status(400).json({
        error: "Shopify payment method can only be selected for paid Shopify orders",
      });
    }

    const currentData = parseJsonField(order.data);
    const updatedData = { ...currentData };
    if (requestedMethod === "none") {
      delete updatedData.tetiano_payment_method;
    } else {
      updatedData.tetiano_payment_method = requestedMethod;
    }

    const { supabase } = await import("../supabaseClient.js");
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        data: updatedData,
        local_updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    const paymentMethod = resolveOrderPaymentMethod(updatedOrder);
    res.json({
      success: true,
      payment_method: paymentMethod,
      order: {
        ...updatedOrder,
        payment_method: paymentMethod,
      },
    });
  } catch (error) {
    console.error("Update order payment method error:", error);
    res.status(resolveUpdateErrorStatusCode(error.message)).json({ error: error.message });
  }
  },
);

router.post(
  "/orders/:id/update-status",
  verifyToken,
  requirePermission("can_edit_orders"),
  async (req, res) => {
  try {
    const { status, void_reason } = req.body;
    const orderId = req.params.id;
    const userId = req.user.id;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    if (status === "voided" && !String(void_reason || "").trim()) {
      return res.status(400).json({ error: "Void reason is required" });
    }

    const result = await OrderManagementService.updateOrderStatus(
      userId,
      orderId,
      status,
      {
        voidReason: void_reason,
      },
    );
    res.json(result);
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(resolveUpdateErrorStatusCode(error.message)).json({ error: error.message });
  }
  },
);

router.get("/orders/:id/profit", verifyToken, requireAdminRole, async (req, res) => {
  try {
    const orderId = req.params.id;

    // Get order
    const { data: order } = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Calculate profit using the database function (includes operational costs)
    const { supabase } = await import("../supabaseClient.js");
    const { data: profitData, error } = await supabase.rpc(
      "calculate_order_net_profit",
      { order_id_param: orderId },
    );

    if (error) {
      console.error("Calculate profit error:", error);
      return res.status(500).json({ error: "Failed to calculate profit" });
    }

    const result =
      profitData && profitData.length > 0
        ? profitData[0]
        : {
          total_revenue: 0,
          total_cost: 0,
          total_operational_costs: 0,
          gross_profit: 0,
          net_profit: 0,
          profit_margin: 0,
        };

    res.json({
      total_revenue: result.total_revenue || 0,
      total_cost: result.total_cost || 0,
      total_operational_costs: result.total_operational_costs || 0,
      gross_profit: result.gross_profit || 0,
      net_profit: result.net_profit || 0,
      profit_margin: result.profit_margin || 0,
    });
  } catch (error) {
    console.error("Get order profit error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
