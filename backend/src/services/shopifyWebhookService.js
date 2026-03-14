import axios from "axios";
import crypto from "crypto";
import { Product, Order } from "../models/index.js";
import { supabase } from "../supabaseClient.js";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const TETIANO_PAYMENT_TAG_PREFIXES = [
  "tetiano_payment_method:",
  "tetiano_pm:",
];
const TETIANO_STATUS_TAG_PREFIX = "tetiano_status:";
const TETIANO_PAYMENT_NOTE_ATTRIBUTE_NAMES = [
  "tetiano_payment_method",
  "tetiano_pm",
];
const TETIANO_PAYMENT_NOTE_ATTRIBUTE_PARSE_NAMES = [
  "tetiano_payment_method",
  "tetiano_pm",
  "payment_method",
];
const TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES = ["tetiano_status"];
const TETIANO_STATUS_NOTE_ATTRIBUTE_PARSE_NAMES = ["tetiano_status", "status"];
const VALID_PAYMENT_METHODS = new Set(["none", "shopify", "instapay", "wallet"]);
const VALID_ORDER_STATUSES = new Set([
  "pending",
  "authorized",
  "paid",
  "partially_paid",
  "refunded",
  "voided",
  "partially_refunded",
]);

export const MANAGED_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "products/create",
  "products/update",
  "products/delete",
];

const normalizeShopDomain = (value) =>
  String(value || "").trim().toLowerCase();

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const toStringNumber = (value) => {
  if (value === undefined || value === null) return "";
  return String(value);
};

const parseNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAttributeName = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();

const normalizePaymentMethod = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (!VALID_PAYMENT_METHODS.has(normalized)) {
    return "";
  }
  return normalized;
};

const normalizeOrderStatus = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (!VALID_ORDER_STATUSES.has(normalized)) {
    return "";
  }
  return normalized;
};

const parseTagList = (tagsValue) => {
  if (Array.isArray(tagsValue)) {
    return tagsValue
      .map((tag) => String(tag || "").trim())
      .filter(Boolean);
  }

  return String(tagsValue || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const serializeTagList = (tags) =>
  Array.from(new Set((tags || []).map((tag) => String(tag || "").trim()).filter(Boolean))).join(", ");

const stripTetianoControlTags = (orderPayload) => {
  const existingTags = parseTagList(orderPayload?.tags);
  const filtered = existingTags.filter((tag) => {
    const normalized = String(tag || "")
      .toLowerCase()
      .trim();
    if (normalized.startsWith(TETIANO_STATUS_TAG_PREFIX)) {
      return false;
    }
    return !TETIANO_PAYMENT_TAG_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    );
  });

  return serializeTagList(filtered);
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

const getNoteAttributeValue = (orderPayload, keys = []) => {
  const normalizedKeys = new Set(
    (keys || []).map((key) => normalizeAttributeName(key)),
  );
  const attrs = Array.isArray(orderPayload?.note_attributes)
    ? orderPayload.note_attributes
    : [];

  for (const attr of attrs) {
    const name = normalizeAttributeName(attr?.name);
    if (!normalizedKeys.has(name)) {
      continue;
    }
    const value = String(attr?.value || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
};

const extractPaymentMethodFromOrderPayload = (orderPayload = {}) => {
  const fromData = normalizePaymentMethod(orderPayload?.tetiano_payment_method);
  if (fromData) {
    return fromData;
  }

  const fromAttributes = normalizePaymentMethod(
    getNoteAttributeValue(orderPayload, [
      ...TETIANO_PAYMENT_NOTE_ATTRIBUTE_PARSE_NAMES,
    ]),
  );
  if (fromAttributes) {
    return fromAttributes;
  }

  const tags = parseTagList(orderPayload?.tags);
  return normalizePaymentMethod(
    extractTagValueByPrefixes(tags, TETIANO_PAYMENT_TAG_PREFIXES),
  );
};

const extractStatusFromOrderPayload = (orderPayload = {}) => {
  const fromData = normalizeOrderStatus(orderPayload?.tetiano_status);
  if (fromData) {
    return fromData;
  }

  const fromAttributes = normalizeOrderStatus(
    getNoteAttributeValue(orderPayload, TETIANO_STATUS_NOTE_ATTRIBUTE_PARSE_NAMES),
  );
  if (fromAttributes) {
    return fromAttributes;
  }

  const tags = parseTagList(orderPayload?.tags);
  return normalizeOrderStatus(
    extractTagValueByPrefixes(tags, [TETIANO_STATUS_TAG_PREFIX]),
  );
};

const mergeTetianoControlTags = (orderPayload, { status = "", paymentMethod = "" } = {}) => {
  return stripTetianoControlTags(orderPayload);
};

const mergeTetianoControlNoteAttributes = (
  orderPayload,
  { status = "", paymentMethod = "" } = {},
) => {
  const existingAttributes = Array.isArray(orderPayload?.note_attributes)
    ? orderPayload.note_attributes
    : [];

  const filtered = existingAttributes.filter((attribute) => {
    const name = normalizeAttributeName(attribute?.name);
    if (!name) {
      return true;
    }
    if (TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES.includes(name)) {
      return false;
    }
    return !TETIANO_PAYMENT_NOTE_ATTRIBUTE_NAMES.includes(name);
  });

  const normalizedStatus = normalizeOrderStatus(status);
  if (normalizedStatus) {
    filtered.push({
      name: "tetiano_status",
      value: normalizedStatus,
    });
  }

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  if (normalizedPaymentMethod && normalizedPaymentMethod !== "none") {
    filtered.push({
      name: "tetiano_payment_method",
      value: normalizedPaymentMethod,
    });
  }

  return filtered;
};

const getWebhookBaseUrlFromReq = (req) => {
  if (process.env.BACKEND_URL) {
    return normalizeBaseUrl(process.env.BACKEND_URL);
  }
  if (!req) return "";
  return normalizeBaseUrl(`${req.protocol}://${req.get("host")}`);
};

export const getWebhookAddress = (req) => {
  const baseUrl = getWebhookBaseUrlFromReq(req);
  if (!baseUrl) return null;
  return `${baseUrl}/api/shopify/webhooks`;
};

const getShopifyHeaders = (accessToken) => ({
  "X-Shopify-Access-Token": accessToken,
  "Content-Type": "application/json",
});

const getWebhooksUrl = (shop) =>
  `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;

const buildWebhookBody = (topic, address) => ({
  webhook: {
    topic,
    address,
    format: "json",
  },
});

const selectTokenRowsByShop = async (shopDomain) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) return [];

  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("user_id, store_id, shop, access_token, updated_at")
    .eq("shop", normalizedShop)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const deduped = [];
  const seen = new Set();
  for (const row of data || []) {
    const key = `${row.user_id || ""}:${row.store_id || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  return deduped;
};

const mapProductFromShopify = (product = {}) => {
  const firstVariant = Array.isArray(product.variants)
    ? product.variants[0] || {}
    : {};
  const costPrice = firstVariant.cost || firstVariant.cost_price || 0;

  return {
    shopify_id: toStringNumber(product.id),
    title: product.title || "",
    description: product.body_html || "",
    vendor: product.vendor || "",
    product_type: product.product_type || "",
    image_url: product.image?.src || "",
    price: parseNumeric(firstVariant.price),
    cost_price: parseNumeric(costPrice),
    currency: "USD",
    sku: firstVariant.sku || "",
    inventory_quantity: parseNumeric(firstVariant.inventory_quantity),
    created_at: product.created_at || new Date().toISOString(),
    updated_at: product.updated_at || new Date().toISOString(),
    shopify_updated_at: product.updated_at || new Date().toISOString(),
    pending_sync: false,
    sync_error: null,
    last_synced_at: new Date().toISOString(),
    data: product,
  };
};

const mapOrderFromShopify = (order = {}) => {
  const customerName =
    `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const normalizedFinancialStatus = normalizeOrderStatus(order.financial_status);
  const mirroredStatus = extractStatusFromOrderPayload(order);
  const resolvedStatus = mirroredStatus || normalizedFinancialStatus || "pending";
  const isShopifyPaidOrder =
    normalizedFinancialStatus === "paid" ||
    normalizedFinancialStatus === "partially_paid";
  const mirroredPaymentMethod = extractPaymentMethodFromOrderPayload(order);
  const resolvedManualPaymentMethod = isShopifyPaidOrder
    ? "none"
    : mirroredPaymentMethod || "none";

  const normalizedOrderPayload = {
    ...order,
    tetiano_status: resolvedStatus,
    tags: mergeTetianoControlTags(order, {
      status: resolvedStatus,
      paymentMethod: resolvedManualPaymentMethod,
    }),
    note_attributes: mergeTetianoControlNoteAttributes(order, {
      status: resolvedStatus,
      paymentMethod: resolvedManualPaymentMethod,
    }),
  };

  if (resolvedManualPaymentMethod !== "none") {
    normalizedOrderPayload.tetiano_payment_method = resolvedManualPaymentMethod;
  } else {
    delete normalizedOrderPayload.tetiano_payment_method;
  }

  return {
    shopify_id: toStringNumber(order.id),
    order_number: order.order_number || "",
    customer_name: customerName,
    customer_email: order.customer?.email || "",
    total_price: parseNumeric(order.total_price),
    subtotal_price: parseNumeric(order.subtotal_price),
    total_tax: parseNumeric(order.total_tax),
    total_discounts: parseNumeric(order.total_discounts),
    currency: order.currency || "USD",
    status: resolvedStatus,
    fulfillment_status: order.fulfillment_status || null,
    items_count: lineItems.length,
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at || new Date().toISOString(),
    shopify_updated_at: order.updated_at || new Date().toISOString(),
    pending_sync: false,
    sync_error: null,
    last_synced_at: new Date().toISOString(),
    data: normalizedOrderPayload,
  };
};

const extractRealtimeScopesFromTokens = (tokenRows = []) => {
  const userIds = Array.from(
    new Set(
      (tokenRows || [])
        .map((token) => String(token?.user_id || "").trim())
        .filter(Boolean),
    ),
  );
  const storeIds = Array.from(
    new Set(
      (tokenRows || [])
        .map((token) => String(token?.store_id || "").trim())
        .filter(Boolean),
    ),
  );

  return {
    affectedUserIds: userIds,
    affectedStoreIds: storeIds,
  };
};

const upsertProductForTokens = async (shopDomain, productPayload) => {
  const tokenRows = await selectTokenRowsByShop(shopDomain);
  if (tokenRows.length === 0) {
    return {
      affectedRows: 0,
      affectedUserIds: [],
      affectedStoreIds: [],
    };
  }

  const mapped = mapProductFromShopify(productPayload);
  const upserts = tokenRows.map((token) => ({
    ...mapped,
    user_id: token.user_id,
    store_id: token.store_id || null,
  }));

  await Product.updateMultiple(upserts);
  return {
    affectedRows: upserts.length,
    ...extractRealtimeScopesFromTokens(tokenRows),
  };
};

const upsertOrderForTokens = async (shopDomain, orderPayload) => {
  const tokenRows = await selectTokenRowsByShop(shopDomain);
  if (tokenRows.length === 0) {
    return {
      affectedRows: 0,
      affectedUserIds: [],
      affectedStoreIds: [],
    };
  }

  const mapped = mapOrderFromShopify(orderPayload);
  const upserts = tokenRows.map((token) => ({
    ...mapped,
    user_id: token.user_id,
    store_id: token.store_id || null,
  }));

  await Order.updateMultiple(upserts);
  return {
    affectedRows: upserts.length,
    ...extractRealtimeScopesFromTokens(tokenRows),
  };
};

const safeDeleteEntity = async (tableName, shopifyId, tokenRows) => {
  if (!shopifyId || tokenRows.length === 0) {
    return { affectedRows: 0 };
  }

  let affectedRows = 0;
  for (const token of tokenRows) {
    const attempts = [];
    if (token.store_id) {
      attempts.push(async () =>
        supabase
          .from(tableName)
          .delete()
          .eq("shopify_id", shopifyId)
          .eq("user_id", token.user_id)
          .eq("store_id", token.store_id),
      );
    }
    attempts.push(async () =>
      supabase
        .from(tableName)
        .delete()
        .eq("shopify_id", shopifyId)
        .eq("user_id", token.user_id),
    );
    attempts.push(async () =>
      supabase.from(tableName).delete().eq("shopify_id", shopifyId),
    );

    let lastError = null;
    for (const attempt of attempts) {
      const { error, count } = await attempt();
      if (!error) {
        affectedRows += count || 0;
        lastError = null;
        break;
      }
      const text =
        `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
      const schemaCompatibilityIssue =
        text.includes("does not exist") ||
        text.includes("could not find the") ||
        text.includes("relation") ||
        text.includes("column");
      if (!schemaCompatibilityIssue) {
        lastError = error;
        break;
      }
      lastError = error;
    }
    if (lastError) {
      throw lastError;
    }
  }

  return { affectedRows };
};

const listWebhooks = async ({ shop, accessToken }) => {
  const response = await axios.get(getWebhooksUrl(shop), {
    headers: getShopifyHeaders(accessToken),
  });
  return Array.isArray(response.data?.webhooks) ? response.data.webhooks : [];
};

export const ensureWebhooksRegistered = async ({
  shop,
  accessToken,
  webhookAddress,
}) => {
  if (!shop || !accessToken || !webhookAddress) {
    return { created: 0, alreadyExists: 0, skipped: true };
  }

  const existing = await listWebhooks({ shop, accessToken });
  const existingKeys = new Set(
    existing.map(
      (webhook) =>
        `${String(webhook.topic || "").toLowerCase()}::${String(webhook.address || "")}`,
    ),
  );

  let created = 0;
  let alreadyExists = 0;
  for (const topic of MANAGED_WEBHOOK_TOPICS) {
    const key = `${topic.toLowerCase()}::${webhookAddress}`;
    if (existingKeys.has(key)) {
      alreadyExists += 1;
      continue;
    }

    await axios.post(getWebhooksUrl(shop), buildWebhookBody(topic, webhookAddress), {
      headers: getShopifyHeaders(accessToken),
    });
    created += 1;
  }

  return { created, alreadyExists, skipped: false };
};

export const removeManagedWebhooks = async ({
  shop,
  accessToken,
  webhookAddress,
}) => {
  if (!shop || !accessToken || !webhookAddress) {
    return { deleted: 0, skipped: true };
  }

  const existing = await listWebhooks({ shop, accessToken });
  const managedTopics = new Set(MANAGED_WEBHOOK_TOPICS.map((topic) => topic.toLowerCase()));

  const toDelete = existing.filter((webhook) => {
    const topic = String(webhook.topic || "").toLowerCase();
    const address = String(webhook.address || "");
    return managedTopics.has(topic) && address === webhookAddress;
  });

  for (const webhook of toDelete) {
    await axios.delete(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${webhook.id}.json`,
      {
        headers: getShopifyHeaders(accessToken),
      },
    );
  }

  return { deleted: toDelete.length, skipped: false };
};

export const getWebhookSecretForShop = async (shopDomain) => {
  const fromEnv =
    process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;
  if (fromEnv) return fromEnv;

  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) return null;

  const { data: tokenRow, error: tokenError } = await supabase
    .from("shopify_tokens")
    .select("user_id")
    .eq("shop", normalizedShop)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenError || !tokenRow?.user_id) {
    return null;
  }

  const { data: credentials, error: credentialsError } = await supabase
    .from("shopify_credentials")
    .select("api_secret")
    .eq("user_id", tokenRow.user_id)
    .limit(1)
    .maybeSingle();

  if (credentialsError) {
    return null;
  }

  return credentials?.api_secret || null;
};

export const verifyWebhookHmac = (rawBody, receivedHmac, secret) => {
  if (!secret || !receivedHmac) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const expectedBuffer = Buffer.from(digest);
  const receivedBuffer = Buffer.from(String(receivedHmac || ""));
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const handleShopifyWebhook = async ({ topic, shopDomain, payload }) => {
  const normalizedTopic = String(topic || "").trim().toLowerCase();
  const normalizedShop = normalizeShopDomain(shopDomain);

  if (!normalizedTopic || !normalizedShop || !payload) {
    return { handled: false, reason: "missing_topic_or_payload" };
  }

  if (normalizedTopic === "products/delete") {
    const shopifyId = toStringNumber(payload.id);
    const tokenRows = await selectTokenRowsByShop(normalizedShop);
    const result = await safeDeleteEntity("products", shopifyId, tokenRows);
    return {
      handled: true,
      topic: normalizedTopic,
      ...result,
      ...extractRealtimeScopesFromTokens(tokenRows),
    };
  }

  if (
    normalizedTopic === "products/create" ||
    normalizedTopic === "products/update"
  ) {
    const result = await upsertProductForTokens(normalizedShop, payload);
    return { handled: true, topic: normalizedTopic, ...result };
  }

  if (
    normalizedTopic === "orders/create" ||
    normalizedTopic === "orders/updated" ||
    normalizedTopic === "orders/paid" ||
    normalizedTopic === "orders/cancelled"
  ) {
    const result = await upsertOrderForTokens(normalizedShop, payload);
    return { handled: true, topic: normalizedTopic, ...result };
  }

  return { handled: false, reason: "unsupported_topic", topic: normalizedTopic };
};
