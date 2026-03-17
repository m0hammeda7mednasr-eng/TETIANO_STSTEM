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
import { queueShopifyBackgroundSync } from "../services/shopifyBackgroundSyncService.js";
import { emitRealtimeEvent } from "../services/realtimeEventService.js";
import {
  requireAdminRole,
  requirePermission,
} from "../middleware/permissions.js";
import { authenticateToken } from "../middleware/auth.js";
import { supabase as db } from "../supabaseClient.js";
import { extractCustomerPhone } from "../helpers/customerContact.js";
import { buildProductsSummaryExportPayload } from "../helpers/orderExport.js";

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_BACKGROUND_SYNC_COOLDOWN_MS = 45 * 1000;
const ORDER_BACKGROUND_SYNC_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 200;
const ORDER_LIST_PAGE_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSING_ORDER_GRACE_MS = 3 * DAY_MS;
const MISSING_ORDER_ESCALATION_MS = 6 * DAY_MS;
const MISSING_ORDER_NOTIFICATION_WINDOW_MS = DAY_MS;
const MISSING_ORDER_ACTION_TYPES = new Set([
  "order_note_add",
  "order_status_update",
  "update_fulfillment_status",
  "order_payment_method_update",
]);
const MISSING_ORDER_NOTIFICATION_TYPES = new Set([
  "order_missing",
  "order_missing_escalated",
]);
const MAX_EXPORT_ORDER_IDS = 10000;
const PAID_LIKE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);
const PRODUCT_LIST_SELECT = [
  "id",
  "shopify_id",
  "store_id",
  "title",
  "vendor",
  "product_type",
  "price",
  "cost_price",
  "sku",
  "image_url",
  "inventory_quantity",
  "last_synced_at",
  "local_updated_at",
  "pending_sync",
  "sync_error",
  "created_at",
  "updated_at",
  "data",
].join(",");
const PRODUCT_LIST_SELECTS = [
  PRODUCT_LIST_SELECT,
  [
    "id",
    "shopify_id",
    "store_id",
    "title",
    "vendor",
    "product_type",
    "price",
    "sku",
    "image_url",
    "inventory_quantity",
    "last_synced_at",
    "created_at",
    "updated_at",
    "data",
  ].join(","),
];
const ORDER_LIST_SELECT = [
  "id",
  "shopify_id",
  "store_id",
  "order_number",
  "customer_name",
  "customer_email",
  "total_price",
  "total_refunded",
  "financial_status",
  "fulfillment_status",
  "payment_method",
  "manual_payment_method",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");
const ORDER_LIST_SELECTS = [
  [
    "id",
    "shopify_id",
    "store_id",
    "order_number",
    "customer_name",
    "customer_email",
    "total_price",
    "status",
    "fulfillment_status",
    "created_at",
    "updated_at",
  ].join(","),
  [
    "id",
    "shopify_id",
    "store_id",
    "order_number",
    "customer_name",
    "customer_email",
    "total_price",
    "status",
    "fulfillment_status",
    "created_at",
    "updated_at",
    "data",
  ].join(","),
  ORDER_LIST_SELECT,
  [
    "id",
    "shopify_id",
    "store_id",
    "order_number",
    "customer_name",
    "customer_email",
    "total_price",
    "total_refunded",
    "financial_status",
    "fulfillment_status",
    "cancelled_at",
    "created_at",
    "updated_at",
  ].join(","),
  [
    "id",
    "shopify_id",
    "store_id",
    "order_number",
    "customer_name",
    "customer_email",
    "total_price",
    "financial_status",
    "fulfillment_status",
    "cancelled_at",
    "created_at",
    "updated_at",
  ].join(","),
  [
    "id",
    "shopify_id",
    "store_id",
    "order_number",
    "customer_name",
    "customer_email",
    "total_price",
    "total_refunded",
    "financial_status",
    "fulfillment_status",
    "payment_method",
    "manual_payment_method",
    "cancelled_at",
    "created_at",
    "updated_at",
    "data",
  ].join(","),
  "*",
];
const CUSTOMER_LIST_SELECT = [
  "id",
  "shopify_id",
  "store_id",
  "name",
  "email",
  "phone",
  "city",
  "country",
  "orders_count",
  "total_spent",
  "default_address",
  "created_at",
  "updated_at",
].join(",");
const CUSTOMER_LIST_SELECTS = [
  [
    "id",
    "shopify_id",
    "store_id",
    "name",
    "email",
    "phone",
    "city",
    "country",
    "orders_count",
    "total_spent",
    "default_address",
    "created_at",
    "updated_at",
    "data",
  ].join(","),
  CUSTOMER_LIST_SELECT,
  [
    "id",
    "shopify_id",
    "store_id",
    "name",
    "email",
    "phone",
    "city",
    "country",
    "orders_count",
    "total_spent",
    "default_address",
    "created_at",
    "updated_at",
  ].join(","),
  [
    "id",
    "shopify_id",
    "store_id",
    "name",
    "email",
    "orders_count",
    "total_spent",
    "created_at",
    "updated_at",
    "data",
  ].join(","),
];
const PRODUCT_SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "price",
  "inventory_quantity",
  "title",
]);
const ORDER_SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "total_price",
  "order_number",
]);
const CUSTOMER_SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "total_spent",
  "orders_count",
  "name",
  "email",
]);
const orderBackgroundSyncState = new Map();
const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");
const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const normalizeShopDomain = (value) => {
  let raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return "";
  }

  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");

  if (raw.startsWith("admin.shopify.com/store/")) {
    const parts = raw.split("/");
    const storeSlug = String(parts[2] || "")
      .trim()
      .toLowerCase();
    if (storeSlug) {
      return `${storeSlug}.myshopify.com`;
    }
  }

  raw = raw.split(/[/?#]/)[0];
  if (raw.endsWith(".myshopify.com")) {
    return raw;
  }

  const normalizedSlug = raw.replace(/[^a-z0-9-]/g, "");
  if (!normalizedSlug) {
    return "";
  }

  return `${normalizedSlug}.myshopify.com`;
};

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
    return `${normalizeBaseUrl(process.env.BACKEND_URL)}/api/shopify/callback`;
  }
  // Fallback for local development
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/api/shopify/callback`;
};

const verifyToken = authenticateToken;

const resolveIsAdmin = async (req) => {
  return Boolean(req.user?.isAdmin || req.user?.role === "admin");
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

const filterRowsByStoreId = (rows, requestedStoreId) => {
  if (!requestedStoreId) {
    return rows || [];
  }

  return (rows || []).filter(
    (row) => row?.store_id && String(row.store_id) === requestedStoreId,
  );
};

const toNonNegativeInteger = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getListPagination = (query = {}, defaultLimit = DEFAULT_LIST_LIMIT) => {
  const requestedLimit = parseInt(query.limit, 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIST_LIMIT)
      : defaultLimit;

  return {
    limit,
    offset: toNonNegativeInteger(query.offset, 0),
  };
};

const getListSortOptions = (
  query = {},
  allowedFields = new Set(),
  defaultField = "created_at",
  defaultDirection = "desc",
) => {
  const requestedField = String(query.sort_by || "")
    .trim()
    .toLowerCase();
  const sortBy = allowedFields.has(requestedField)
    ? requestedField
    : defaultField;
  const sortDir = String(query.sort_dir || defaultDirection)
    .trim()
    .toLowerCase();

  return {
    sortBy,
    ascending: sortDir === "asc",
  };
};

const buildPaginatedCollection = (rows, { limit, offset }) => {
  const items = Array.isArray(rows) ? rows : [];
  const count = items.length;

  return {
    data: items,
    pagination: {
      limit,
      offset,
      count,
      has_more: count === limit,
      next_offset: offset + count,
    },
  };
};

const buildSlicedPaginatedCollection = (
  rows,
  { limit, offset },
  extra = {},
) => {
  const items = Array.isArray(rows) ? rows : [];
  const total = items.length;
  const pageItems = items.slice(offset, offset + limit);
  const count = pageItems.length;

  return {
    data: pageItems,
    pagination: {
      limit,
      offset,
      count,
      total,
      has_more: offset + count < total,
      next_offset: offset + count,
    },
    ...extra,
  };
};

const QUERY_RETRYABLE_ERROR_CODES = new Set(["57014"]);

const isQueryRetryableError = (error) => {
  if (!error) {
    return false;
  }

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

const getScopedEntityPage = async ({
  req,
  tableName,
  select,
  selects,
  pagination,
  sortOptions,
}) => {
  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = await resolveIsAdmin(req);
  const accessibleStoreIds = isAdmin
    ? []
    : await getAccessibleStoreIds(req.user.id);

  if (
    requestedStoreId &&
    !isAdmin &&
    !accessibleStoreIds.includes(requestedStoreId)
  ) {
    return {
      data: [],
      error: null,
      isAdmin,
      requestedStoreId,
    };
  }

  const { limit, offset } = pagination;
  const { sortBy, ascending } = sortOptions;

  const buildQuery = (
    selectedColumns,
    orderField,
    useLegacyUserScope = false,
  ) => {
    let query = db.from(tableName).select(selectedColumns);

    if (orderField) {
      query = query.order(orderField, { ascending });
    }

    query = query.range(offset, offset + limit - 1);

    if (requestedStoreId) {
      return query.eq("store_id", requestedStoreId);
    }

    if (isAdmin) {
      return query;
    }

    if (!useLegacyUserScope && accessibleStoreIds.length > 0) {
      return query.in("store_id", accessibleStoreIds);
    }

    return query.eq("user_id", req.user.id);
  };

  const selectCandidates = [
    ...(Array.isArray(selects) ? selects : []),
    ...(select ? [select] : []),
  ].filter(Boolean);
  const orderFieldCandidates = getOrderFieldFallbacks(sortBy, {
    allowUnordered: true,
  });

  let lastError = null;

  for (const selectedColumns of selectCandidates) {
    for (const orderField of orderFieldCandidates) {
      let result = await buildQuery(selectedColumns, orderField, false);

      if (
        !isAdmin &&
        !requestedStoreId &&
        accessibleStoreIds.length > 0 &&
        offset === 0 &&
        !result.error &&
        (!Array.isArray(result.data) || result.data.length === 0)
      ) {
        result = await buildQuery(selectedColumns, orderField, true);
      }

      if (!result?.error) {
        return {
          data: result?.data || [],
          error: null,
          isAdmin,
          requestedStoreId,
        };
      }

      lastError = result.error;
      console.error("Error executing query:", result.error);
      if (isSchemaCompatibilityError(result.error)) {
        break;
      }

      if (isQueryRetryableError(result.error)) {
        continue;
      }

      return {
        data: [],
        error: result.error,
        isAdmin,
        requestedStoreId,
      };
    }
  }

  return {
    data: [],
    error: lastError,
    isAdmin,
    requestedStoreId,
  };
};

const getScopedEntityRows = async (req, entityModel) => {
  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = await resolveIsAdmin(req);
  const sourceResult = isAdmin
    ? await entityModel.findAll()
    : await entityModel.findByUser(req.user.id);

  if (sourceResult?.error) {
    return {
      data: [],
      error: sourceResult.error,
      isAdmin,
      requestedStoreId,
    };
  }

  return {
    data: filterRowsByStoreId(sourceResult?.data || [], requestedStoreId),
    error: null,
    isAdmin,
    requestedStoreId,
  };
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

const isSchemaCompatibilityError = (error) => {
  if (!error) return false;

  const code = String(error.code || "");
  if (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205"
  ) {
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

const getSchemaErrorMessage = (error) =>
  String(
    error?.message ||
    error?.details ||
    error?.hint ||
    "Database schema mismatch",
  ).trim();

const getReadableShopifyError = (error) => {
  const responseData = error?.response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData && typeof responseData === "object") {
    const candidates = [
      responseData.error_description,
      responseData.error,
      responseData.message,
      responseData.errors,
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value.length > 0) {
        return value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(", ");
      }
      if (value && typeof value === "object") {
        const flattened = Object.values(value)
          .flatMap((item) => (Array.isArray(item) ? item : [item]))
          .map((item) => String(item || "").trim())
          .filter(Boolean);
        if (flattened.length > 0) {
          return flattened.join(", ");
        }
      }
    }
  }

  return String(error?.message || "Unknown Shopify OAuth error").trim();
};

const isShopifyCredentialError = (error) => {
  const status = Number(error?.response?.status || 0);
  if (status === 401 || status === 403) {
    return true;
  }

  const text = `${getReadableShopifyError(error)} ${error?.message || ""}`
    .toLowerCase()
    .trim();

  return (
    text.includes("invalid api key") ||
    text.includes("invalid access token") ||
    text.includes("unrecognized login") ||
    text.includes("reauthoriz") ||
    text.includes("access token") ||
    text.includes("forbidden")
  );
};

const validateShopifyConnection = async ({ shop, accessToken }) => {
  if (!shop || !accessToken) {
    return {
      valid: false,
      requiresReconnect: false,
      message: "Missing Shopify connection details",
    };
  }

  try {
    await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    return { valid: true, requiresReconnect: false, message: null };
  } catch (error) {
    return {
      valid: false,
      requiresReconnect: isShopifyCredentialError(error),
      message: getReadableShopifyError(error),
    };
  }
};

const findOrCreateStoreConnection = async ({ supabase, shop, userId }) => {
  const lookup = await supabase
    .from("stores")
    .select("id,name")
    .eq("name", shop)
    .maybeSingle();

  if (lookup.error && !isSchemaCompatibilityError(lookup.error)) {
    throw lookup.error;
  }

  if (lookup.data?.id) {
    return lookup.data;
  }

  if (lookup.error && isSchemaCompatibilityError(lookup.error)) {
    return null;
  }

  const create = await supabase
    .from("stores")
    .insert({ name: shop, created_by: userId })
    .select("id,name")
    .single();

  if (create.error && !isSchemaCompatibilityError(create.error)) {
    throw create.error;
  }

  return create.data || null;
};

const grantUserStoreAccess = async ({ supabase, userId, storeId }) => {
  if (!storeId) {
    return { skipped: true };
  }

  const result = await supabase
    .from("user_stores")
    .upsert({ user_id: userId, store_id: storeId });

  if (result.error && !isSchemaCompatibilityError(result.error)) {
    throw result.error;
  }

  return { skipped: false, error: result.error || null };
};

const findExistingStoreIdByShop = async ({ supabase, shop }) => {
  if (!shop) {
    return null;
  }

  const result = await supabase
    .from("stores")
    .select("id")
    .eq("name", shop)
    .maybeSingle();

  if (result.error && !isSchemaCompatibilityError(result.error)) {
    throw result.error;
  }

  return result.data?.id || null;
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

const getProductVariantRows = (product) => {
  const parsedData = parseJsonField(product?.data);
  return Array.isArray(parsedData?.variants) ? parsedData.variants : [];
};

const getProductImageRows = (product) => {
  const parsedData = parseJsonField(product?.data);
  const images = Array.isArray(parsedData?.images) ? parsedData.images : [];

  return images.map((image) => ({
    id: image?.id || null,
    src: image?.src || "",
    alt: image?.alt || "",
    position: image?.position || null,
    variant_ids: Array.isArray(image?.variant_ids) ? image.variant_ids : [],
  }));
};

const getProductTotalInventory = (product) => {
  const variants = getProductVariantRows(product);
  if (variants.length === 0) {
    return toNumber(product?.inventory_quantity);
  }

  return variants.reduce(
    (sum, variant) => sum + toNumber(variant?.inventory_quantity),
    0,
  );
};

const getProductPrimarySku = (product) => {
  const currentSku = String(product?.sku || "").trim();
  if (currentSku) {
    return currentSku;
  }

  const variants = getProductVariantRows(product);
  const firstVariantWithSku = variants.find((variant) =>
    String(variant?.sku || "").trim(),
  );

  return String(firstVariantWithSku?.sku || "").trim();
};

const getProductPrimaryImageUrl = (product) => {
  const currentImageUrl = String(product?.image_url || "").trim();
  if (currentImageUrl) {
    return currentImageUrl;
  }

  const imageRows = getProductImageRows(product);
  const firstImageUrl = String(imageRows[0]?.src || "").trim();
  if (firstImageUrl) {
    return firstImageUrl;
  }

  const parsedData = parseJsonField(product?.data);
  return String(parsedData?.image?.src || "").trim();
};

const resolveVariantImageUrl = (variant, imageRows = [], fallbackImageUrl = "") => {
  const variantId = String(variant?.id || "").trim();
  const variantImageId = String(variant?.image_id || "").trim();

  if (variantImageId) {
    const directImage = imageRows.find(
      (image) => String(image?.id || "").trim() === variantImageId,
    );
    if (directImage?.src) {
      return directImage.src;
    }
  }

  if (variantId) {
    const linkedImage = imageRows.find((image) =>
      Array.isArray(image?.variant_ids) &&
      image.variant_ids.some((value) => String(value || "").trim() === variantId),
    );
    if (linkedImage?.src) {
      return linkedImage.src;
    }
  }

  return fallbackImageUrl;
};

const buildProductVariantSummaries = (product) => {
  const variants = getProductVariantRows(product);
  const imageRows = getProductImageRows(product);
  const primaryImageUrl = getProductPrimaryImageUrl(product);

  if (variants.length === 0) {
    return [
      {
        id: product?.shopify_id || product?.id || null,
        product_id: product?.shopify_id || product?.id || null,
        title: product?.title || "Default",
        price: product?.price ?? 0,
        cost: product?.cost_price ?? 0,
        cost_price: product?.cost_price ?? 0,
        sku: getProductPrimarySku(product),
        position: 1,
        compare_at_price: null,
        option1: null,
        option2: null,
        option3: null,
        barcode: null,
        image_id: null,
        image_url: primaryImageUrl,
        weight: null,
        weight_unit: null,
        inventory_quantity: toNumber(product?.inventory_quantity),
        requires_shipping: true,
        taxable: true,
        created_at: product?.created_at || null,
        updated_at: product?.updated_at || null,
      },
    ];
  }

  return variants.map((variant, index) => ({
    id: variant?.id || null,
    product_id: variant?.product_id || product?.shopify_id || product?.id || null,
    title: variant?.title || `Variant ${index + 1}`,
    price: variant?.price ?? product?.price ?? 0,
    cost: variant?.cost ?? variant?.cost_price ?? product?.cost_price ?? 0,
    cost_price:
      variant?.cost_price ?? variant?.cost ?? product?.cost_price ?? 0,
    sku: String(variant?.sku || "").trim(),
    position: variant?.position ?? index + 1,
    compare_at_price: variant?.compare_at_price ?? null,
    option1: variant?.option1 ?? null,
    option2: variant?.option2 ?? null,
    option3: variant?.option3 ?? null,
    barcode: variant?.barcode ?? null,
    image_id: variant?.image_id ?? null,
    image_url: resolveVariantImageUrl(variant, imageRows, primaryImageUrl),
    weight: variant?.weight ?? null,
    weight_unit: variant?.weight_unit ?? null,
    inventory_quantity: toNumber(variant?.inventory_quantity),
    requires_shipping: Boolean(variant?.requires_shipping),
    taxable: Boolean(variant?.taxable),
    created_at: variant?.created_at || null,
    updated_at: variant?.updated_at || null,
  }));
};

const buildProductSummary = (product) => {
  const variants = buildProductVariantSummaries(product);
  const images = getProductImageRows(product);
  const totalInventory = getProductTotalInventory(product);
  const primaryImageUrl = getProductPrimaryImageUrl(product);

  return {
    ...product,
    inventory_quantity: totalInventory,
    total_inventory: totalInventory,
    sku: getProductPrimarySku(product),
    image_url: primaryImageUrl,
    images,
    variants,
    variants_count: variants.length,
    has_multiple_variants: variants.length > 1,
  };
};

const buildProductListItem = (product, isAdmin) => {
  const { data, ...summary } = buildProductSummary(product);
  return sanitizeProductForRole(summary, isAdmin);
};

const TETIANO_PAYMENT_TAG_PREFIXES = ["tetiano_payment_method:", "tetiano_pm:"];
const TETIANO_PAYMENT_NOTE_ATTRIBUTE_NAMES = [
  "tetiano_payment_method",
  "tetiano_pm",
  "payment_method",
];
const TETIANO_STATUS_TAG_PREFIXES = ["tetiano_status:"];
const TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES = ["tetiano_status", "status"];

const normalizePaymentMethod = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (
    normalized === "none" ||
    normalized === "shopify" ||
    normalized === "instapay" ||
    normalized === "wallet"
  ) {
    return normalized;
  }
  return "";
};

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
      if (lowerTag.startsWith(normalizedPrefix)) {
        const rawValue = tag.slice(prefix.length).trim();
        if (rawValue) {
          return rawValue;
        }
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

const resolveManualPaymentMethodFromData = (data = {}) => {
  const fromData = normalizePaymentMethod(data?.tetiano_payment_method);
  if (fromData) {
    return fromData;
  }

  const fromAttributes = normalizePaymentMethod(
    getNoteAttributeValue(data, TETIANO_PAYMENT_NOTE_ATTRIBUTE_NAMES),
  );
  if (fromAttributes) {
    return fromAttributes;
  }

  const tags = parseTagList(data?.tags);
  return normalizePaymentMethod(
    extractTagValueByPrefixes(tags, TETIANO_PAYMENT_TAG_PREFIXES),
  );
};

const resolveOrderStatusFromData = (data = {}) => {
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

const normalizeOrderReference = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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
  return String(
    resolveOrderStatusFromData(data) ||
      data?.financial_status ||
      order?.financial_status ||
      order?.status ||
      "",
  )
    .toLowerCase()
    .trim();
};

const isShopifyPaidOrder = (order) => {
  const status = getOrderFinancialStatus(order);
  return status === "paid" || status === "partially_paid";
};

const getOrderGrossAmount = (order) => {
  const data = parseJsonField(order?.data);
  return toNumber(order?.total_price ?? data?.total_price);
};

const getOrderCurrentAmount = (order) => {
  const data = parseJsonField(order?.data);
  return toNumber(order?.current_total_price ?? data?.current_total_price);
};

const getRefundedAmountFromTransactions = (order) => {
  const data = parseJsonField(order?.data);
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
  const financialStatus = getOrderFinancialStatus(order);
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

  if (financialStatus === "refunded" && refundedAmount <= 0 && grossAmount > 0) {
    refundedAmount = grossAmount;
  }

  return Math.min(grossAmount, Math.max(0, refundedAmount));
};

const isCancelledOrder = (order) => {
  const data = parseJsonField(order?.data);
  const financialStatus = getOrderFinancialStatus(order);

  return (
    Boolean(order?.cancelled_at) ||
    Boolean(data?.cancelled_at) ||
    financialStatus === "voided" ||
    financialStatus === "cancelled"
  );
};

const getOrderNetSalesAmount = (order) => {
  const grossAmount = getOrderGrossAmount(order);
  if (grossAmount <= 0 || isCancelledOrder(order)) {
    return 0;
  }

  if (!PAID_LIKE_STATUSES.has(getOrderFinancialStatus(order))) {
    return 0;
  }

  return Math.max(0, grossAmount - getOrderRefundedAmount(order));
};

const resolveOrderPaymentMethod = (order) => {
  const explicitPaymentMethod = normalizePaymentMethod(order?.payment_method);
  if (
    explicitPaymentMethod === "shopify" ||
    explicitPaymentMethod === "instapay" ||
    explicitPaymentMethod === "wallet"
  ) {
    return explicitPaymentMethod;
  }

  if (explicitPaymentMethod === "none" && !isShopifyPaidOrder(order)) {
    return "none";
  }

  if (isShopifyPaidOrder(order)) {
    return "shopify";
  }

  const data = parseJsonField(order?.data);
  const manualMethod =
    normalizePaymentMethod(order?.manual_payment_method) ||
    resolveManualPaymentMethodFromData(data);

  if (manualMethod === "instapay" || manualMethod === "wallet") {
    return manualMethod;
  }

  return "none";
};

const getOrderCustomerShopifyId = (order) => {
  const data = parseJsonField(order?.data);
  return String(order?.customer_id || data?.customer?.id || "").trim();
};

const getOrderLineItems = (order) => {
  const parsedData = parseJsonField(order?.data);
  return Array.isArray(parsedData?.line_items) ? parsedData.line_items : [];
};

const getOrderLineItemImageUrl = (item) => {
  const propertyImageUrl = Array.isArray(item?.properties)
    ? item.properties.find((entry) => String(entry?.name || "").trim() === "_image_url")?.value
    : "";

  return String(
    propertyImageUrl ||
      item?.image_url ||
      item?.image?.src ||
      item?.image?.url ||
      item?.featured_image?.src ||
      item?.featured_image?.url ||
      "",
  ).trim();
};

const buildOrderItemPreviews = (order) =>
  getOrderLineItems(order)
    .slice(0, 4)
    .map((item) => ({
      id: item?.id || null,
      title: item?.title || item?.name || "",
      quantity: toNumber(item?.quantity),
      image_url: getOrderLineItemImageUrl(item),
    }));

const buildOrderListItem = (order) => {
  const parsedData = parseJsonField(order?.data);
  const financialStatus = getOrderFinancialStatus(order);
  const totalPrice = getOrderGrossAmount(order);
  const refundedAmount = getOrderRefundedAmount(order);
  const fulfillmentStatus = String(
    order?.fulfillment_status ||
      parsedData?.fulfillment_status ||
      "",
  )
    .toLowerCase()
    .trim();
  const itemsCount =
    order?.items_count !== undefined &&
    order?.items_count !== null &&
    String(order.items_count).trim() !== ""
      ? toNumber(order.items_count)
      : Array.isArray(parsedData?.line_items)
        ? parsedData.line_items.length
        : 0;
  const hasAnyRefund =
    refundedAmount > 0 ||
    financialStatus === "refunded" ||
    financialStatus === "partially_refunded";
  const isPartialRefund =
    financialStatus === "partially_refunded" ||
    (hasAnyRefund && refundedAmount > 0 && refundedAmount < totalPrice);
  const isFullRefund =
    financialStatus === "refunded" ||
    (hasAnyRefund && totalPrice > 0 && refundedAmount >= totalPrice);

  return {
    id: order?.id || null,
    shopify_id: order?.shopify_id || null,
    store_id: order?.store_id || null,
    order_number: order?.order_number || null,
    customer_name: order?.customer_name || "",
    customer_email: order?.customer_email || "",
    customer_phone: order?.customer_phone || "",
    status: order?.status || "",
    total_price: order?.total_price ?? 0,
    total_refunded: order?.total_refunded ?? 0,
    cancelled_at: order?.cancelled_at || null,
    created_at: order?.created_at || null,
    updated_at: order?.updated_at || null,
    last_synced_at: order?.last_synced_at || null,
    pending_sync: Boolean(order?.pending_sync),
    sync_error: order?.sync_error || "",
    items_count: itemsCount,
    customer_shopify_id: getOrderCustomerShopifyId(order),
    item_previews: buildOrderItemPreviews(order),
    financial_status: financialStatus,
    fulfillment_status: fulfillmentStatus,
    payment_method: resolveOrderPaymentMethod(order),
    refunded_amount: refundedAmount,
    has_any_refund: hasAnyRefund,
    is_partial_refund: isPartialRefund,
    is_full_refund: isFullRefund,
    is_cancelled: isCancelledOrder(order),
    is_paid: isShopifyPaidOrder(order),
    is_paid_like: PAID_LIKE_STATUSES.has(financialStatus),
    is_fulfilled: fulfillmentStatus === "fulfilled",
    net_sales_amount: getOrderNetSalesAmount(order),
  };
};

const getFallbackOrdersPage = async (req) => {
  const scopedRowsResult = await getScopedEntityRows(req, Order);
  if (scopedRowsResult?.error) {
    throw scopedRowsResult.error;
  }

  return applyOrdersQueryFilters(scopedRowsResult?.data || [], req.query).map(
    (order) => buildOrderListItem(order),
  );
};

const getFallbackProductsPage = async (req) => {
  const scopedRowsResult = await getScopedEntityRows(req, Product);
  if (scopedRowsResult?.error) {
    throw scopedRowsResult.error;
  }

  return applyProductsQueryFilters(scopedRowsResult?.data || [], req.query).map(
    (product) => buildProductListItem(product, Boolean(req.user?.isAdmin)),
  );
};

const applyCustomersQueryFilters = (rows, query = {}) => {
  const sortBy = String(query.sort_by || "created_at").toLowerCase();
  const sortDir =
    String(query.sort_dir || "desc").toLowerCase() === "asc" ? 1 : -1;
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limitValue = parseInt(query.limit, 10);
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;

  const sorted = [...(rows || [])].sort((a, b) => {
    if (sortBy === "total_spent") {
      return (toNumber(a.total_spent) - toNumber(b.total_spent)) * sortDir;
    }
    if (sortBy === "orders_count") {
      return (toNumber(a.orders_count) - toNumber(b.orders_count)) * sortDir;
    }
    if (sortBy === "name") {
      return (
        String(a.name || "").localeCompare(String(b.name || "")) * sortDir
      );
    }
    if (sortBy === "email") {
      return (
        String(a.email || "").localeCompare(String(b.email || "")) * sortDir
      );
    }

    return (
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
      sortDir
    );
  });

  if (limit === null) {
    return sorted;
  }

  return sorted.slice(offset, offset + limit);
};

const getFallbackCustomersPage = async (req) => {
  const scopedRowsResult = await getScopedEntityRows(req, Customer);
  if (scopedRowsResult?.error) {
    throw scopedRowsResult.error;
  }

  const normalizedCustomers = applyCustomersQueryFilters(
    scopedRowsResult?.data || [],
    req.query,
  ).map((customer) => buildCustomerListItem(customer));

  return await enrichCustomersWithOrderPhones(req, normalizedCustomers);
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
    filtered = filtered.filter(
      (order) => toNumber(order.total_price) >= minTotal,
    );
  }

  if (query.max_total !== undefined) {
    const maxTotal = toNumber(query.max_total);
    filtered = filtered.filter(
      (order) => toNumber(order.total_price) <= maxTotal,
    );
  }

  if (query.payment_status && query.payment_status !== "all") {
    const paymentStatus = String(query.payment_status).toLowerCase();
    filtered = filtered.filter((order) => {
      const status = getOrderFinancialStatus(order);
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
      const status = String(order.fulfillment_status || "")
        .toLowerCase()
        .trim();
      if (fulfillmentStatus === "unfulfilled") {
        return !status || status === "unfulfilled" || status === "null";
      }
      return status === fulfillmentStatus;
    });
  }

  if (query.refund_filter && query.refund_filter !== "all") {
    const refundFilter = String(query.refund_filter).toLowerCase().trim();
    filtered = filtered.filter((order) => {
      const status = getOrderFinancialStatus(order);
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
      const status = String(
        getOrderFinancialStatus(order) || order.status || "",
      )
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
  const sortDir =
    String(query.sort_dir || "desc").toLowerCase() === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortBy === "total_price") {
      return (toNumber(a.total_price) - toNumber(b.total_price)) * sortDir;
    }
    if (sortBy === "order_number") {
      return (toNumber(a.order_number) - toNumber(b.order_number)) * sortDir;
    }
    return (
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
      sortDir
    );
  });

  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limitValue = parseInt(query.limit, 10);
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;
  if (limit === null) return filtered;
  return filtered.slice(offset, offset + limit);
};

const parseTimestampValue = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const chunkValues = (values, size = 100) => {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (items.length === 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getLatestLegacyNoteTimestamp = (order) => {
  const notes = parseJsonField(order?.notes);
  if (!Array.isArray(notes)) {
    return 0;
  }

  return notes.reduce((maxValue, note) => {
    const candidate = parseTimestampValue(note?.created_at);
    return candidate > maxValue ? candidate : maxValue;
  }, 0);
};

const getLatestOrderActionMap = async (orderIds = []) => {
  const latestActionMap = new Map();
  const uniqueOrderIds = Array.from(
    new Set(
      (orderIds || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  for (const chunk of chunkValues(uniqueOrderIds, 100)) {
    const { data, error } = await db
      .from("sync_operations")
      .select("entity_id, created_at, operation_type")
      .eq("entity_type", "order")
      .in("entity_id", chunk)
      .in("operation_type", Array.from(MISSING_ORDER_ACTION_TYPES))
      .order("created_at", { ascending: false });

    if (error) {
      if (isSchemaCompatibilityError(error)) {
        return latestActionMap;
      }
      throw error;
    }

    for (const operation of data || []) {
      const entityId = String(operation?.entity_id || "").trim();
      if (!entityId || latestActionMap.has(entityId)) {
        continue;
      }
      latestActionMap.set(entityId, operation.created_at || null);
    }
  }

  return latestActionMap;
};

const isOrderOperationallyHandled = (order) => {
  const financialStatus = getOrderFinancialStatus(order);
  const fulfillmentStatus = String(
    order?.fulfillment_status || parseJsonField(order?.data)?.fulfillment_status || "",
  )
    .toLowerCase()
    .trim();

  return (
    isCancelledOrder(order) ||
    fulfillmentStatus === "fulfilled" ||
    financialStatus === "refunded" ||
    financialStatus === "voided" ||
    financialStatus === "cancelled"
  );
};

const buildMissingOrderRecord = (order, latestActionMap, nowTimestamp = Date.now()) => {
  if (!order || isOrderOperationallyHandled(order)) {
    return null;
  }

  const orderId = String(order.id || "").trim();
  if (!orderId) {
    return null;
  }

  const lastActionTimestamp = Math.max(
    parseTimestampValue(order.created_at),
    parseTimestampValue(order.local_updated_at),
    getLatestLegacyNoteTimestamp(order),
    parseTimestampValue(latestActionMap.get(orderId)),
  );

  if (!lastActionTimestamp) {
    return null;
  }

  const elapsedMs = nowTimestamp - lastActionTimestamp;
  if (elapsedMs < MISSING_ORDER_GRACE_MS) {
    return null;
  }

  const isEscalated = elapsedMs >= MISSING_ORDER_ESCALATION_MS;
  const missingSince = new Date(lastActionTimestamp + MISSING_ORDER_GRACE_MS).toISOString();
  const escalatedSince = isEscalated
    ? new Date(lastActionTimestamp + MISSING_ORDER_ESCALATION_MS).toISOString()
    : null;

  return {
    ...buildOrderListItem(order),
    last_action_at: new Date(lastActionTimestamp).toISOString(),
    missing_since: missingSince,
    escalated_since: escalatedSince,
    missing_state: isEscalated ? "escalated" : "missing",
    days_without_action: Math.max(
      3,
      Math.floor(elapsedMs / DAY_MS),
    ),
    requires_attention: true,
  };
};

const buildCustomerListItem = (customer) => {
  const parsedData = parseJsonField(customer?.data);

  return {
    ...customer,
    phone: extractCustomerPhone(customer),
    default_address:
      customer?.default_address ||
      parsedData?.default_address?.address1 ||
      "",
    city: customer?.city || parsedData?.default_address?.city || "",
    country: customer?.country || parsedData?.default_address?.country || "",
  };
};

const getOrderCustomerPhone = (order) => {
  const parsedData = parseJsonField(order?.data);

  return String(
    order?.customer_phone ||
      parsedData?.customer?.phone ||
      parsedData?.shipping_address?.phone ||
      parsedData?.billing_address?.phone ||
      "",
  ).trim();
};

const enrichCustomersWithOrderPhones = async (req, customers = []) => {
  const baseCustomers = Array.isArray(customers) ? customers : [];
  const unresolvedEmails = Array.from(
    new Set(
      baseCustomers
        .filter((customer) => !String(customer?.phone || "").trim())
        .map((customer) => String(customer?.email || "").trim())
        .filter(Boolean),
    ),
  );

  if (unresolvedEmails.length === 0) {
    return baseCustomers;
  }

  try {
    let query = db
      .from("orders")
      .select("customer_email,data,customer_phone,store_id,user_id,updated_at")
      .in("customer_email", unresolvedEmails)
      .order("updated_at", { ascending: false });

    const requestedStoreId = getRequestedStoreId(req);
    const isAdmin = await resolveIsAdmin(req);

    if (requestedStoreId) {
      query = query.eq("store_id", requestedStoreId);
    } else if (!isAdmin) {
      const accessibleStoreIds = await getAccessibleStoreIds(req.user.id);
      if (accessibleStoreIds.length > 0) {
        query = query.in("store_id", accessibleStoreIds);
      } else {
        query = query.eq("user_id", req.user.id);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const phoneByEmail = new Map();
    for (const order of data || []) {
      const email = String(order?.customer_email || "").trim();
      if (!email || phoneByEmail.has(email)) {
        continue;
      }

      const phone = getOrderCustomerPhone(order);
      if (phone) {
        phoneByEmail.set(email, phone);
      }
    }

    return baseCustomers.map((customer) => ({
      ...customer,
      phone:
        String(customer?.phone || "").trim() ||
        phoneByEmail.get(String(customer?.email || "").trim()) ||
        "",
    }));
  } catch (error) {
    console.warn("Customer phone order fallback failed:", error.message);
    return baseCustomers;
  }
};

const sortMissingOrders = (orders = []) =>
  [...(orders || [])].sort((left, right) => {
    const leftRank = left?.missing_state === "escalated" ? 0 : 1;
    const rightRank = right?.missing_state === "escalated" ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const dayGap =
      toNumber(right?.days_without_action) - toNumber(left?.days_without_action);
    if (dayGap !== 0) {
      return dayGap;
    }

    return (
      parseTimestampValue(left?.created_at) - parseTimestampValue(right?.created_at)
    );
  });

const getMissingOrdersForRows = async (rows = []) => {
  const rawRows = Array.isArray(rows) ? rows : [];
  const latestActionMap = await getLatestOrderActionMap(
    rawRows.map((order) => order?.id),
  );
  return sortMissingOrders(
    rawRows
      .map((order) => buildMissingOrderRecord(order, latestActionMap))
      .filter(Boolean),
  );
};

const getMissingOrdersForRequest = async (req) => {
  const scopedRowsResult = await getScopedEntityRows(req, Order);
  if (scopedRowsResult?.error) {
    throw scopedRowsResult.error;
  }

  return await getMissingOrdersForRows(scopedRowsResult?.data || []);
};

const getMissingOrderRecipients = async () => {
  const { data: users, error } = await db
    .from("users")
    .select("id, role, is_active");

  if (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }
    throw error;
  }

  const activeUsers = (users || []).filter(
    (user) => user?.id && user?.is_active !== false,
  );
  const nonAdminIds = activeUsers
    .filter((user) => !Boolean(user?.role === "admin"))
    .map((user) => user.id);

  let permissionByUserId = new Map();
  if (nonAdminIds.length > 0) {
    const { data: permissionRows, error: permissionError } = await db
      .from("permissions")
      .select("user_id, can_view_orders")
      .in("user_id", nonAdminIds);

    if (permissionError && !isSchemaCompatibilityError(permissionError)) {
      throw permissionError;
    }

    permissionByUserId = new Map(
      (permissionRows || []).map((row) => [
        String(row?.user_id || "").trim(),
        Boolean(row?.can_view_orders),
      ]),
    );
  }

  return activeUsers
    .filter((user) => {
      if (String(user?.role || "").trim().toLowerCase() === "admin") {
        return true;
      }

      const explicitPermission = permissionByUserId.get(
        String(user?.id || "").trim(),
      );
      return explicitPermission !== false;
    })
    .map((user) => String(user.id || "").trim())
    .filter(Boolean);
};

const shouldNotifyForMissingStage = (order, nowTimestamp = Date.now()) => {
  const transitionTimestamp = parseTimestampValue(
    order?.missing_state === "escalated"
      ? order?.escalated_since
      : order?.missing_since,
  );

  return (
    transitionTimestamp > 0 &&
    nowTimestamp - transitionTimestamp <= MISSING_ORDER_NOTIFICATION_WINDOW_MS
  );
};

const buildMissingOrderNotificationDraft = (order, userId) => {
  const isEscalated = order?.missing_state === "escalated";
  const notificationType = isEscalated
    ? "order_missing_escalated"
    : "order_missing";
  const orderLabel = order?.order_number || order?.shopify_id || order?.id || "Unknown";
  const title = isEscalated
    ? `طلب #${orderLabel} متأخر بشكل خطير`
    : `طلب #${orderLabel} دخل الطلبات المفقودة`;
  const message = isEscalated
    ? `لا يوجد أي أكشن على الطلب منذ ${order?.days_without_action || 6} أيام.`
    : `لم يتم اتخاذ أي أكشن على الطلب منذ ${order?.days_without_action || 3} أيام وتم نقله إلى صفحة الطلبات المفقودة.`;

  return {
    user_id: userId,
    type: notificationType,
    title,
    message,
    entity_type: "order",
    entity_id: order?.id || null,
    metadata: {
      route: "/orders/missing",
      order_id: order?.id || null,
      order_number: order?.order_number || null,
      missing_state: order?.missing_state || "missing",
      days_without_action: order?.days_without_action || 0,
    },
  };
};

const ensureMissingOrderNotifications = async (missingOrders = []) => {
  const recentOrders = (missingOrders || []).filter((order) =>
    shouldNotifyForMissingStage(order),
  );
  if (recentOrders.length === 0) {
    return 0;
  }

  const recipientIds = await getMissingOrderRecipients();
  if (recipientIds.length === 0) {
    return 0;
  }

  const notificationTypes = Array.from(MISSING_ORDER_NOTIFICATION_TYPES);
  const entityIds = recentOrders
    .map((order) => String(order?.id || "").trim())
    .filter(Boolean);

  const { data: existingNotifications, error: existingError } = await db
    .from("notifications")
    .select("user_id, entity_id, type")
    .in("user_id", recipientIds)
    .in("entity_id", entityIds)
    .in("type", notificationTypes);

  if (existingError) {
    if (isSchemaCompatibilityError(existingError)) {
      return 0;
    }
    throw existingError;
  }

  const existingKeys = new Set(
    (existingNotifications || []).map(
      (row) =>
        `${String(row?.user_id || "").trim()}::${String(row?.entity_id || "").trim()}::${String(row?.type || "").trim()}`,
    ),
  );

  const drafts = [];
  for (const order of recentOrders) {
    for (const userId of recipientIds) {
      const draft = buildMissingOrderNotificationDraft(order, userId);
      const key = `${draft.user_id}::${draft.entity_id}::${draft.type}`;
      if (existingKeys.has(key)) {
        continue;
      }
      drafts.push(draft);
      existingKeys.add(key);
    }
  }

  if (drafts.length === 0) {
    return 0;
  }

  const { error: insertError } = await db.from("notifications").insert(drafts);
  if (insertError) {
    if (isSchemaCompatibilityError(insertError)) {
      return 0;
    }
    throw insertError;
  }

  emitRealtimeEvent({
    userIds: recipientIds,
    payload: {
      resource: "notifications",
      context: "missing_orders",
    },
  });

  return drafts.length;
};

const getLatestOrderTimestamp = (orders = []) => {
  const latest = (orders || []).reduce((maxValue, order) => {
    const candidate = Math.max(
      parseTimestampValue(order?.shopify_updated_at),
      parseTimestampValue(order?.updated_at),
      parseTimestampValue(order?.created_at),
    );
    return candidate > maxValue ? candidate : maxValue;
  }, 0);

  return latest > 0 ? new Date(latest) : null;
};

const buildBackgroundSyncKey = ({ userId, storeId, shop }) =>
  `${String(userId || "").trim()}::${String(storeId || "all").trim()}::${String(
    shop || "",
  ).trim()}`;

const syncRecentOrdersWithCooldown = async ({
  userId,
  requestedStoreId,
  isAdmin,
  latestKnownOrderAt,
  waitForCompletion = false,
  forceRun = false,
}) => {
  try {
    const tokenData = await resolveSyncToken({
      userId,
      requestedStoreId,
      isAdmin,
    });

    if (!tokenData?.access_token || !tokenData?.shop) {
      return { triggered: false, reason: "not_connected" };
    }

    const syncOwnerUserId = tokenData.user_id || userId;
    const { supabase } = await import("../supabaseClient.js");
    let syncStoreId =
      requestedStoreId ||
      tokenData.store_id ||
      (await findExistingStoreIdByShop({
        supabase,
        shop: tokenData.shop,
      }));

    if (!syncStoreId) {
      const storeConnection = await findOrCreateStoreConnection({
        supabase,
        shop: tokenData.shop,
        userId: syncOwnerUserId,
      });
      syncStoreId = storeConnection?.id || null;
    }

    if (syncStoreId) {
      await grantUserStoreAccess({
        supabase,
        userId: syncOwnerUserId,
        storeId: syncStoreId,
      });
    }
    const key = buildBackgroundSyncKey({
      userId: syncOwnerUserId,
      storeId: syncStoreId,
      shop: tokenData.shop,
    });
    const nowMs = Date.now();
    const state = orderBackgroundSyncState.get(key);
    if (state?.inFlight) {
      return { triggered: false, reason: "in_flight" };
    }
    if (
      !forceRun &&
      state?.lastRunMs &&
      nowMs - state.lastRunMs < ORDER_BACKGROUND_SYNC_COOLDOWN_MS
    ) {
      return { triggered: false, reason: "cooldown" };
    }

    const latestKnownMs = parseTimestampValue(latestKnownOrderAt);
    const fallbackStart = nowMs - ORDER_BACKGROUND_SYNC_LOOKBACK_MS;
    const updatedAtMin = new Date(
      latestKnownMs > 0
        ? Math.max(fallbackStart, latestKnownMs - 60 * 60 * 1000)
        : fallbackStart,
    ).toISOString();

    const runSync = async () => {
      orderBackgroundSyncState.set(key, {
        inFlight: true,
        lastRunMs: state?.lastRunMs || 0,
      });

      try {
        const result = await ShopifyService.syncRecentOrders(
          syncOwnerUserId,
          tokenData.shop,
          tokenData.access_token,
          syncStoreId,
          { updatedAtMin },
        );

        orderBackgroundSyncState.set(key, {
          inFlight: false,
          lastRunMs: Date.now(),
        });

        return result;
      } catch (syncError) {
        orderBackgroundSyncState.set(key, {
          inFlight: false,
          lastRunMs: Date.now(),
        });
        throw syncError;
      }
    };

    if (waitForCompletion) {
      await runSync();
      return { triggered: true, reason: "performed" };
    }

    runSync().catch((syncError) => {
      console.error("Background recent orders sync failed:", syncError);
    });
    return { triggered: true, reason: "started_background" };
  } catch (error) {
    console.error("Recent orders sync failed:", error);
    return {
      triggered: false,
      reason: "failed",
      error: error?.message || String(error),
    };
  }
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
        return (
          !product.pending_sync &&
          !product.sync_error &&
          !product.last_synced_at
        );
      return true;
    });
  }

  if (query.min_price !== undefined) {
    const minPrice = toNumber(query.min_price);
    filtered = filtered.filter(
      (product) => toNumber(product.price) >= minPrice,
    );
  }

  if (query.max_price !== undefined) {
    const maxPrice = toNumber(query.max_price);
    filtered = filtered.filter(
      (product) => toNumber(product.price) <= maxPrice,
    );
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
    filtered = filtered.filter(
      (product) => new Date(product.updated_at) >= from,
    );
  }

  if (query.updated_to) {
    const to = new Date(String(query.updated_to));
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter((product) => new Date(product.updated_at) <= to);
  }

  const sortBy = String(query.sort_by || "updated_at").toLowerCase();
  const sortDir =
    String(query.sort_dir || "desc").toLowerCase() === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortBy === "price")
      return (toNumber(a.price) - toNumber(b.price)) * sortDir;
    if (sortBy === "inventory_quantity") {
      return (
        (toNumber(a.inventory_quantity) - toNumber(b.inventory_quantity)) *
        sortDir
      );
    }
    if (sortBy === "title") {
      return (
        String(a.title || "").localeCompare(String(b.title || "")) * sortDir
      );
    }
    return (
      (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) *
      sortDir
    );
  });

  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limitValue = parseInt(query.limit, 10);
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;
  if (limit === null) return filtered;
  return filtered.slice(offset, offset + limit);
};

// 1. Get Shopify Authorization URL
router.post(
  "/auth-url",
  authenticateToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
  try {
    const inputShop = normalizeShopDomain(req.body?.shop);
    const userId = req.user.id; // Changed from req.user.userId

    if (!inputShop || !SHOP_DOMAIN_REGEX.test(inputShop)) {
      return res.status(400).json({
        error: "Invalid shop domain. Use format: your-store.myshopify.com",
      });
    }

    const { apiKey } = await getShopifyCredentials(userId);
    const scopes =
      "read_products,write_products,read_orders,read_customers,write_orders";
    const redirectUri = getRedirectUri(req);

    const authParams = new URLSearchParams({
      client_id: apiKey,
      scope: scopes,
      redirect_uri: redirectUri,
      state: String(userId || ""),
    });
    const authUrl = `https://${inputShop}/admin/oauth/authorize?${authParams.toString()}`;

    res.json({ authUrl });
  } catch (error) {
    console.error("Error getting auth URL:", error);
    res
      .status(500)
      .json({ error: "Failed to create Shopify authorization URL." });
  }
  },
);

// 2. OAuth Callback
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const shop = String(req.query?.shop || "")
    .trim()
    .toLowerCase();
  const userId = state;
  const frontendUrl = normalizeBaseUrl(
    process.env.FRONTEND_URL || "http://localhost:3000",
  );

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
    const { supabase } = await import("../supabaseClient.js");

    const store = await findOrCreateStoreConnection({
      supabase,
      shop,
      userId,
    });
    const storeId = store?.id || null;

    await grantUserStoreAccess({
      supabase,
      userId,
      storeId,
    });

    const saveTokenResult = await ShopifyToken.save(
      userId,
      shop,
      accessToken,
      storeId,
    );
    if (saveTokenResult?.error) {
      throw new Error(
        `Failed to save Shopify connection: ${getSchemaErrorMessage(saveTokenResult.error)}`,
      );
    }

    queueShopifyBackgroundSync(
      {
        user_id: userId,
        store_id: storeId,
        shop,
        access_token: accessToken,
      },
      ["orders", "products", "customers"],
    );
    const initialSyncStatus = "queued";
    const initialSyncCounts = null;

    ensureWebhooksRegistered({
      shop,
      accessToken,
      webhookAddress: getWebhookAddress(req),
    }).catch((webhookError) => {
      console.error("Webhook registration error after callback:", webhookError);
    });

    const callbackParams = new URLSearchParams({
      connected: "true",
      shop,
      sync_status: initialSyncStatus,
    });
    if (storeId) {
      callbackParams.set("store_id", storeId);
    }
    if (initialSyncCounts) {
      callbackParams.set("sync_counts", JSON.stringify(initialSyncCounts));
    }

    res.redirect(`${frontendUrl}/settings?${callbackParams.toString()}`);
  } catch (error) {
    const readableError = getReadableShopifyError(error);
    console.error(
      "Shopify OAuth Callback Error:",
      error.response?.data || error.message,
    );
    const callbackErrorParams = new URLSearchParams({
      error: "callback_failed",
      error_message: readableError,
    });
    res.redirect(`${frontendUrl}/settings?${callbackErrorParams.toString()}`);
  }
});

// 3. Sync data from Shopify
router.post(
  "/sync",
  authenticateToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
    try {
      console.log("🔄 Starting Shopify sync process...");

      const userId = req.user.id;
      const requestedStoreId = getRequestedStoreId(req);
      const isAdmin = await resolveIsAdmin(req);

      console.log(
        `👤 User ID: ${userId}, Store ID: ${requestedStoreId}, Admin: ${isAdmin}`,
      );

      // Try to get token data with better error handling
      let tokenData;
      try {
        tokenData = await resolveSyncToken({
          userId,
          requestedStoreId,
          isAdmin,
        });
      } catch (tokenError) {
        console.error("❌ Error resolving sync token:", tokenError);
        return res.status(500).json({
          error: "Failed to resolve Shopify connection",
          details: tokenError.message,
        });
      }

      if (!tokenData) {
        console.log("❌ No Shopify token found");
        return res.status(400).json({
          error: "Shopify is not connected for this account/store.",
          code: "SHOPIFY_NOT_CONNECTED",
        });
      }

      console.log(`🏪 Found Shopify connection: ${tokenData.shop}`);

      const syncOwnerUserId = tokenData.user_id || userId;

      // Force store ID to ensure data linking
      const { supabase } = await import("../supabaseClient.js");
      let syncStoreId =
        requestedStoreId ||
        tokenData.store_id ||
        (await findExistingStoreIdByShop({
          supabase,
          shop: tokenData.shop,
        }));

      if (!syncStoreId) {
        const storeConnection = await findOrCreateStoreConnection({
          supabase,
          shop: tokenData.shop,
          userId: syncOwnerUserId,
        });
        syncStoreId = storeConnection?.id || null;
      }

      // Legacy fallback if store mapping could not be resolved dynamically
      if (!syncStoreId) {
        syncStoreId = null;
        console.warn(
          "Sync continuing without resolved store_id; rows stay user-scoped until store mapping exists.",
        );
        console.log("🏪 Using default store ID for sync:", syncStoreId);
      }

      console.log(
        `🔄 Starting sync for user: ${syncOwnerUserId}, store: ${syncStoreId}`,
      );

      if (syncStoreId) {
        await grantUserStoreAccess({
          supabase,
          userId: syncOwnerUserId,
          storeId: syncStoreId,
        });

        if (userId !== syncOwnerUserId) {
          await grantUserStoreAccess({
            supabase,
            userId,
            storeId: syncStoreId,
          });
        }

        if (tokenData.id && tokenData.store_id !== syncStoreId) {
          const { error: tokenStoreUpdateError } = await supabase
            .from("shopify_tokens")
            .update({
              store_id: syncStoreId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", tokenData.id);

          if (tokenStoreUpdateError) {
            console.warn(
              "Failed to persist resolved store_id on Shopify token:",
              tokenStoreUpdateError.message,
            );
          } else {
            tokenData.store_id = syncStoreId;
          }
        }
      }

      queueShopifyBackgroundSync(
        {
          user_id: syncOwnerUserId,
          store_id: syncStoreId,
          shop: tokenData.shop,
          access_token: tokenData.access_token,
        },
        ["orders", "products", "customers"],
      );

      // Try webhook registration (optional, don't fail if it doesn't work)
      let webhookSync = null;
      try {
        webhookSync = await ensureWebhooksRegistered({
          shop: tokenData.shop,
          accessToken: tokenData.access_token,
          webhookAddress: getWebhookAddress(req),
        });
      } catch (webhookError) {
        console.error(
          "⚠️ Webhook registration failed (non-critical):",
          webhookError,
        );
        webhookSync = {
          error: "Webhook registration failed",
        };
      }

      const response = {
        success: true,
        mode: "background",
        message: "Background Shopify sync started",
        store_id: syncStoreId,
        webhook_sync: webhookSync,
        counts: null,
        persisted_counts: null,
        latest_order: null,
      };

      console.log("Queued Shopify background sync:", {
        store_id: syncStoreId,
        shop: tokenData.shop,
      });
      res.json(response);
    } catch (error) {
      console.error("💥 Critical error in sync endpoint:", error);
      res.status(500).json({
        error: "Internal server error during sync",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  },
);

// 4. Check Shopify connection status
router.get(
  "/status",
  authenticateToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
  try {
    const requestedStoreId = getRequestedStoreId(req);
    const isAdmin = await resolveIsAdmin(req);
    const { supabase } = await import("../supabaseClient.js");
    const tokenData = await resolveSyncToken({
      userId: req.user.id,
      requestedStoreId,
      isAdmin,
    });

    const redirectUri = getRedirectUri(req);
    const resolvedStoreId =
      tokenData?.store_id ||
      requestedStoreId ||
      (await findExistingStoreIdByShop({
        supabase,
        shop: tokenData?.shop || "",
      }));

    const validation = tokenData?.access_token
      ? await validateShopifyConnection({
        shop: tokenData.shop,
        accessToken: tokenData.access_token,
      })
      : {
        valid: false,
        requiresReconnect: false,
        message: null,
      };

    res.json({
      connected: Boolean(tokenData?.access_token && validation.valid),
      shop: tokenData?.shop || null,
      store_id: resolvedStoreId || null,
      redirectUri: redirectUri,
      webhookAddress: getWebhookAddress(req),
      requires_reconnect: validation.requiresReconnect,
      connection_error: validation.valid ? null : validation.message,
    });
  } catch (error) {
    res.json({
      connected: false,
      shop: null,
      redirectUri: getRedirectUri(req),
      webhookAddress: getWebhookAddress(req),
    });
  }
  },
);

router.post(
  "/disconnect",
  authenticateToken,
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

      const isConnectionOwner =
        String(tokenData.user_id || "") === String(userId || "");
      const webhookAddress = getWebhookAddress(req);
      if (isConnectionOwner && webhookAddress) {
        try {
          await removeManagedWebhooks({
            shop: tokenData.shop,
            accessToken: tokenData.access_token,
            webhookAddress,
          });
        } catch (webhookError) {
          console.error(
            "Failed to remove Shopify webhooks during disconnect:",
            webhookError,
          );
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
        disconnected_scope: isConnectionOwner
          ? "store_connection"
          : "user_access",
      });
    } catch (error) {
      console.error("Disconnect Shopify error:", error);
      res.status(500).json({ error: "Failed to disconnect Shopify." });
    }
  },
);

// 5. Save Shopify API credentials
router.post(
  "/save-credentials",
  verifyToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
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
  },
);

// 6. Get Shopify credentials for current user
router.get(
  "/get-credentials",
  verifyToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
  try {
    const { apiKey } = await getShopifyCredentials(req.user.id); // Changed from req.user.userId
    res.json({ hasCredentials: true, apiKey });
  } catch (error) {
    res.json({ hasCredentials: false });
  }
  },
);

// Other data-fetching routes remain unchanged...
router.get(
  "/products",
  verifyToken,
  requirePermission("can_view_products"),
  async (req, res) => {
    try {
      const pagination = getListPagination(req.query);
      const sortOptions = getListSortOptions(
        req.query,
        PRODUCT_SORT_FIELDS,
        "updated_at",
        "desc",
      );
      const { data, error, isAdmin } = await getScopedEntityPage({
        req,
        tableName: "products",
        selects: PRODUCT_LIST_SELECTS,
        pagination,
        sortOptions,
      });
      if (error) {
        console.error("Error fetching products:", error);
        try {
          const fallbackProducts = await getFallbackProductsPage(req);
          res.setHeader("X-Products-Fallback", "scoped_rows");
          return res.json(buildPaginatedCollection(fallbackProducts, pagination));
        } catch (fallbackError) {
          console.error("Fallback products query failed:", fallbackError);
        }

        return res.status(500).json({ error: error.message });
      }
      console.log(
        `Returning ${data?.length || 0} products for user ${req.user.id}`,
      );
      const sanitizedProducts = (data || []).map((product) =>
        buildProductListItem(product, isAdmin),
      );
      res.json(buildPaginatedCollection(sanitizedProducts, pagination));
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
      const pagination = getListPagination(req.query);
      pagination.limit = Math.min(pagination.limit, ORDER_LIST_PAGE_LIMIT);
      const sortOptions = getListSortOptions(
        req.query,
        ORDER_SORT_FIELDS,
        "created_at",
        "desc",
      );
      const requestedStoreId = getRequestedStoreId(req);
      const isAdmin = await resolveIsAdmin(req);

      const syncRecentParam = String(req.query.sync_recent || "")
        .toLowerCase()
        .trim();
      const forceSyncRecent = syncRecentParam === "force";
      let liveSyncResult = null;

      if (forceSyncRecent && pagination.offset === 0) {
        const tokenData = await resolveSyncToken({
          userId: req.user.id,
          requestedStoreId,
          isAdmin,
        });

        if (tokenData?.access_token && tokenData?.shop) {
          queueShopifyBackgroundSync(
            {
              user_id: tokenData.user_id || req.user.id,
              store_id: requestedStoreId || tokenData.store_id || null,
              shop: tokenData.shop,
              access_token: tokenData.access_token,
            },
            ["orders"],
          );
          liveSyncResult = { triggered: true, reason: "queued_background" };
        }
      }

      let data = [];
      let error = null;

      try {
        const scopedPageResult = await getScopedEntityPage({
          req,
          tableName: "orders",
          selects: ORDER_LIST_SELECTS,
          pagination,
          sortOptions,
        });
        data = scopedPageResult?.data || [];
        error = scopedPageResult?.error || null;
      } catch (queryError) {
        error = queryError;
      }

      if (error) {
        console.error("Error fetching orders:", error);
        try {
          const fallbackOrders = await getFallbackOrdersPage(req);
          if (liveSyncResult) {
            res.setHeader(
              "X-Orders-Live-Sync",
              liveSyncResult.reason || "attempted",
            );
          }
          res.setHeader("X-Orders-Fallback", "scoped_rows");
          return res.json(buildPaginatedCollection(fallbackOrders, pagination));
        } catch (fallbackError) {
          console.error("Fallback orders query failed:", fallbackError);
        }

        return res.status(500).json({ error: error.message });
      }

      console.log(
        `Returning ${data?.length || 0} orders for user ${req.user.id}`,
      );
      const normalizedOrders = (data || []).map((order) =>
        buildOrderListItem(order),
      );
      if (liveSyncResult) {
        res.setHeader(
          "X-Orders-Live-Sync",
          liveSyncResult.reason || "attempted",
        );
      }
      res.json(buildPaginatedCollection(normalizedOrders, pagination));
    } catch (e) {
      console.error("Exception fetching orders:", e);
      res.status(500).json({ error: e.message });
    }
  },
);
router.get(
  "/orders/missing",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
    try {
      const pagination = getListPagination(req.query);
      pagination.limit = Math.min(pagination.limit, ORDER_LIST_PAGE_LIMIT);

      const missingOrders = await getMissingOrdersForRequest(req);

      try {
        await ensureMissingOrderNotifications(missingOrders);
      } catch (notificationError) {
        console.error(
          "Missing orders notification error (non-blocking):",
          notificationError,
        );
      }

      const summary = {
        total_missing: missingOrders.length,
        escalated_count: missingOrders.filter(
          (order) => order?.missing_state === "escalated",
        ).length,
        warning_count: missingOrders.filter(
          (order) => order?.missing_state !== "escalated",
        ).length,
      };

      res.json(buildSlicedPaginatedCollection(missingOrders, pagination, { summary }));
    } catch (error) {
      console.error("Error fetching missing orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch missing orders" });
    }
  },
);
router.get(
  "/customers",
  verifyToken,
  requirePermission("can_view_customers"),
  async (req, res) => {
    try {
      const pagination = getListPagination(req.query);
      const sortOptions = getListSortOptions(
        req.query,
        CUSTOMER_SORT_FIELDS,
        "created_at",
        "desc",
      );
      const { data, error } = await getScopedEntityPage({
        req,
        tableName: "customers",
        selects: CUSTOMER_LIST_SELECTS,
        pagination,
        sortOptions,
      });
      if (error) {
        console.error("Error fetching customers:", error);
        try {
          const fallbackCustomers = await getFallbackCustomersPage(req);
          res.setHeader("X-Customers-Fallback", "scoped_rows");
          return res.json(buildPaginatedCollection(fallbackCustomers, pagination));
        } catch (fallbackError) {
          console.error("Fallback customers query failed:", fallbackError);
        }

        return res.status(500).json({ error: error.message });
      }
      console.log(
        `Returning ${data?.length || 0} customers for user ${req.user.id}`,
      );
      const normalizedCustomers = (data || []).map((customer) =>
        buildCustomerListItem(customer),
      );
      const enrichedCustomers = await enrichCustomersWithOrderPhones(
        req,
        normalizedCustomers,
      );
      res.json(buildPaginatedCollection(enrichedCustomers, pagination));
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
      res.json(sanitizeProductForRole(buildProductSummary(data), isAdmin));
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

router.post(
  "/orders/products-summary",
  verifyToken,
  requirePermission("can_view_orders"),
  async (req, res) => {
    try {
      const requestedOrderIds = Array.isArray(req.body?.order_ids)
        ? req.body.order_ids
        : [];
      const orderIds = Array.from(
        new Set(
          requestedOrderIds
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      );

      if (orderIds.length === 0) {
        return res.status(400).json({ error: "order_ids is required" });
      }

      if (orderIds.length > MAX_EXPORT_ORDER_IDS) {
        return res.status(400).json({
          error: `A maximum of ${MAX_EXPORT_ORDER_IDS} order IDs can be exported at once`,
        });
      }

      const scopedRowsResult = await getScopedEntityRows(req, Order);
      if (scopedRowsResult?.error) {
        return res.status(500).json({
          error: scopedRowsResult.error.message || "Failed to load orders",
        });
      }

      const orderMap = new Map(
        (scopedRowsResult?.data || []).map((order) => [
          String(order?.id || "").trim(),
          order,
        ]),
      );
      const matchedOrders = orderIds
        .map((orderId) => orderMap.get(orderId))
        .filter(Boolean);
      const missingOrderIds = orderIds.filter((orderId) => !orderMap.has(orderId));

      if (matchedOrders.length === 0) {
        return res.status(404).json({
          error: "No matching orders found for export",
        });
      }

      const payload = buildProductsSummaryExportPayload(matchedOrders);
      res.json({
        ...payload,
        meta: {
          requested_order_count: orderIds.length,
          matched_order_count: matchedOrders.length,
          missing_order_ids: missingOrderIds,
        },
      });
    } catch (error) {
      console.error("Orders products summary export error:", error);
      res.status(500).json({ error: error.message || "Failed to export orders" });
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
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
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
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
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
      const { price, cost_price, inventory, sku, variant_updates } = req.body;
      const productId = req.params.id;
      const userId = req.user.id;

      if (cost_price !== undefined && cost_price !== null && !isAdmin) {
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
      if (Object.prototype.hasOwnProperty.call(req.body, "sku")) {
        updates.sku = String(sku ?? "").trim();
      }
      if (Array.isArray(variant_updates) && variant_updates.length > 0) {
        updates.variant_updates = variant_updates.map((variantUpdate) => {
          const nextVariantUpdate = {
            id: variantUpdate?.id,
          };

          if (
            Object.prototype.hasOwnProperty.call(
              variantUpdate || {},
              "inventory_quantity",
            )
          ) {
            nextVariantUpdate.inventory_quantity = parseInt(
              variantUpdate?.inventory_quantity,
              10,
            );
          }

          if (
            Object.prototype.hasOwnProperty.call(variantUpdate || {}, "price")
          ) {
            nextVariantUpdate.price = parseFloat(variantUpdate?.price);
          }

          if (
            Object.prototype.hasOwnProperty.call(variantUpdate || {}, "sku")
          ) {
            nextVariantUpdate.sku = String(variantUpdate?.sku ?? "").trim();
          }

          return nextVariantUpdate;
        });
      }

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
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
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

      const order = await OrderManagementService.getOrderDetails(
        userId,
        orderId,
      );

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
          error:
            "payment_method must be one of: none, shopify, instapay, wallet",
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
          error:
            "This order is already paid on Shopify and must stay on Shopify payment method",
        });
      }
      if (!isShopifyPaid && requestedMethod === "shopify") {
        return res.status(400).json({
          error:
            "Shopify payment method can only be selected for paid Shopify orders",
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
      const previousPaymentMethod = resolveOrderPaymentMethod(order);
      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({
          data: updatedData,
          pending_sync: true,
          sync_error: null,
          local_updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      await OrderManagementService.logSyncOperation(
        userId,
        order.id,
        "order_payment_method_update",
        {
          old_payment_method: previousPaymentMethod,
          new_payment_method: requestedMethod,
        },
      );

      try {
        await OrderManagementService.syncPaymentMethodToShopify(
          userId,
          order.id,
          requestedMethod,
          {
            previousMethod: previousPaymentMethod,
          },
        );
      } catch (syncError) {
        await supabase
          .from("orders")
          .update({
            data: currentData,
            pending_sync: false,
            sync_error: syncError.message,
            local_updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        return res.status(502).json({
          error: `Shopify sync failed. Payment method rolled back: ${syncError.message}`,
        });
      }

      const { data: refreshedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order.id)
        .maybeSingle();

      const finalOrder = refreshedOrder || updatedOrder;
      const paymentMethod = resolveOrderPaymentMethod(finalOrder);
      res.json({
        success: true,
        payment_method: paymentMethod,
        order: {
          ...finalOrder,
          payment_method: paymentMethod,
        },
      });
    } catch (error) {
      console.error("Update order payment method error:", error);
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
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
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
    }
  },
);

router.post(
  "/orders/:id/update-fulfillment",
  verifyToken,
  requirePermission("can_edit_orders"),
  async (req, res) => {
    try {
      const { fulfillment_status, line_items } = req.body;
      const orderId = req.params.id;
      const userId = req.user.id;

      if (!fulfillment_status) {
        return res.status(400).json({ error: "Fulfillment status is required" });
      }

      const result = await OrderManagementService.updateOrderFulfillment(
        userId,
        orderId,
        fulfillment_status,
        {
          lineItems: Array.isArray(line_items)
            ? line_items.map((item) => ({
                id: item?.id ?? item?.line_item_id,
                quantity: item?.quantity,
              }))
            : [],
        },
      );
      res.json(result);
    } catch (error) {
      console.error("Update order fulfillment error:", error);
      res
        .status(resolveUpdateErrorStatusCode(error.message))
        .json({ error: error.message });
    }
  },
);

router.get(
  "/orders/:id/profit",
  verifyToken,
  requireAdminRole,
  async (req, res) => {
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
  },
);

export default router;
