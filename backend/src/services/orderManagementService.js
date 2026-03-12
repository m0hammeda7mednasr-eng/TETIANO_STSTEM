import { Order } from "../models/index.js";
import axios from "axios";

const getShopifyTokenForStore = async (storeId, fallbackUserId) => {
  const { supabase } = await import("../supabaseClient.js");

  if (storeId) {
    const { data: tokenByStore } = await supabase
      .from("shopify_tokens")
      .select("*")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenByStore) {
      return tokenByStore;
    }
  }

  const { data: tokenByUser } = await supabase
    .from("shopify_tokens")
    .select("*")
    .eq("user_id", fallbackUserId)
    .single();

  return tokenByUser || null;
};

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
const TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES = ["tetiano_status"];
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

const parseOrderData = (order) => {
  const value = order?.data;
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
};

const normalizeAttributeName = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();

const normalizePaymentMethod = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (VALID_PAYMENT_METHODS.has(normalized)) {
    return normalized;
  }
  return "";
};

const normalizeOrderStatus = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (VALID_ORDER_STATUSES.has(normalized)) {
    return normalized;
  }
  return "";
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

const getNoteAttributeValue = (orderData, keys = []) => {
  const normalizedKeys = new Set(
    (keys || []).map((key) => normalizeAttributeName(key)),
  );
  const attrs = Array.isArray(orderData?.note_attributes)
    ? orderData.note_attributes
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

const extractPaymentMethodFromOrderData = (orderData) => {
  const fromData = normalizePaymentMethod(orderData?.tetiano_payment_method);
  if (fromData) {
    return fromData;
  }

  const fromAttributes = normalizePaymentMethod(
    getNoteAttributeValue(orderData, [
      "tetiano_payment_method",
      "tetiano_pm",
      "payment_method",
    ]),
  );
  if (fromAttributes) {
    return fromAttributes;
  }

  const tags = parseTagList(orderData?.tags);
  return normalizePaymentMethod(
    extractTagValueByPrefixes(tags, TETIANO_PAYMENT_TAG_PREFIXES),
  );
};

const extractStatusFromOrderData = (orderData) => {
  const fromData = normalizeOrderStatus(orderData?.tetiano_status);
  if (fromData) {
    return fromData;
  }

  const fromAttributes = normalizeOrderStatus(
    getNoteAttributeValue(orderData, ["tetiano_status", "status"]),
  );
  if (fromAttributes) {
    return fromAttributes;
  }

  const tags = parseTagList(orderData?.tags);
  return normalizeOrderStatus(extractTagValueByPrefixes(tags, [TETIANO_STATUS_TAG_PREFIX]));
};

const mergeTetianoControlTags = (orderData, { status = "", paymentMethod = "" } = {}) => {
  const existingTags = parseTagList(orderData?.tags);
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

  const normalizedStatus = normalizeOrderStatus(status);
  if (normalizedStatus) {
    filtered.push(`${TETIANO_STATUS_TAG_PREFIX}${normalizedStatus}`);
  }

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  if (normalizedPaymentMethod && normalizedPaymentMethod !== "none") {
    filtered.push(`tetiano_pm:${normalizedPaymentMethod}`);
  }

  return serializeTagList(filtered);
};

const mergeTetianoControlNoteAttributes = (
  orderData,
  { status = "", paymentMethod = "" } = {},
) => {
  const existingAttributes = Array.isArray(orderData?.note_attributes)
    ? orderData.note_attributes
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

const applyTetianoControlValuesToOrderData = (
  orderData,
  { status = "", paymentMethod = "" } = {},
) => {
  const next = {
    ...(orderData && typeof orderData === "object" ? orderData : {}),
  };

  const normalizedStatus = normalizeOrderStatus(status);
  if (normalizedStatus) {
    next.tetiano_status = normalizedStatus;
  } else {
    delete next.tetiano_status;
  }

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  if (normalizedPaymentMethod && normalizedPaymentMethod !== "none") {
    next.tetiano_payment_method = normalizedPaymentMethod;
  } else {
    delete next.tetiano_payment_method;
  }

  next.tags = mergeTetianoControlTags(next, {
    status: normalizedStatus,
    paymentMethod: normalizedPaymentMethod,
  });
  next.note_attributes = mergeTetianoControlNoteAttributes(next, {
    status: normalizedStatus,
    paymentMethod: normalizedPaymentMethod,
  });

  return next;
};

const getShopifyOrderPayload = (responseData) => {
  const payload = responseData?.order || responseData;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload;
};

const appendLogLineToNote = (existingNote, line) => {
  const base = String(existingNote || "").trim();
  const nextLine = String(line || "").trim();
  if (!nextLine) {
    return base;
  }
  return base ? `${base}\n${nextLine}` : nextLine;
};

const buildShopifyHeaders = (accessToken) => ({
  "X-Shopify-Access-Token": accessToken,
  "Content-Type": "application/json",
});

const updateShopifyOrderNote = async ({
  tokenData,
  order,
  logLine,
  extraOrderFields = {},
}) => {
  if (!tokenData?.shop || !tokenData?.access_token) {
    throw new Error("Shopify token is missing");
  }
  if (!order?.shopify_id) {
    throw new Error("Order not found or missing Shopify ID");
  }

  const parsedOrderData = parseOrderData(order);
  const existingNote = String(parsedOrderData?.note || order?.note || "").trim();
  const nextNote = appendLogLineToNote(existingNote, logLine);
  const numericShopifyId = Number.parseInt(String(order.shopify_id), 10);
  if (!Number.isFinite(numericShopifyId)) {
    throw new Error("Invalid Shopify order id");
  }

  const response = await axios.put(
    `https://${tokenData.shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${order.shopify_id}.json`,
    {
      order: {
        id: numericShopifyId,
        note: nextNote,
        ...extraOrderFields,
      },
    },
    {
      headers: buildShopifyHeaders(tokenData.access_token),
    },
  );

  return response?.data || null;
};

export class OrderManagementService {
  /**
   * Get complete order details with all related data
   */
  static async getOrderDetails(userId, orderId) {
    try {
      console.log("OrderManagementService.getOrderDetails called:", {
        userId,
        orderId,
      });

      const { data: order, error } = await Order.findByIdForUser(
        userId,
        orderId,
      );

      console.log("Order query result:", { found: !!order, error: error });

      if (error || !order) {
        console.error("Order not found or error:", error);
        throw new Error("Order not found");
      }

      // Access already validated through store scope (findByIdForUser)

      // Parse the data field if it's a string
      let orderData = order.data;
      if (typeof orderData === "string") {
        try {
          orderData = JSON.parse(orderData);
        } catch (e) {
          orderData = {};
        }
      }

      // Extract ALL line items details from data
      const lineItems = orderData?.line_items || [];
      order.line_items = lineItems.map((item) => ({
        id: item.id,
        title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        product_id: item.product_id,
        variant_id: item.variant_id,
        vendor: item.vendor,
        fulfillment_status: item.fulfillment_status,
        fulfillable_quantity: item.fulfillable_quantity,
        grams: item.grams,
        requires_shipping: item.requires_shipping,
        taxable: item.taxable,
        gift_card: item.gift_card,
        name: item.name,
        properties: item.properties || [],
        product_exists: item.product_exists,
        total_discount: item.total_discount,
        image_url:
          item.properties?.find((p) => p.name === "_image_url")?.value || null,
      }));

      // Extract COMPLETE shipping address from data
      order.shipping_address = orderData?.shipping_address
        ? {
            first_name: orderData.shipping_address.first_name,
            last_name: orderData.shipping_address.last_name,
            address1: orderData.shipping_address.address1,
            address2: orderData.shipping_address.address2,
            city: orderData.shipping_address.city,
            province: orderData.shipping_address.province,
            province_code: orderData.shipping_address.province_code,
            country: orderData.shipping_address.country,
            country_code: orderData.shipping_address.country_code,
            zip: orderData.shipping_address.zip,
            phone: orderData.shipping_address.phone,
            name: orderData.shipping_address.name,
            company: orderData.shipping_address.company,
            latitude: orderData.shipping_address.latitude,
            longitude: orderData.shipping_address.longitude,
          }
        : null;

      // Extract COMPLETE billing address from data
      order.billing_address = orderData?.billing_address
        ? {
            first_name: orderData.billing_address.first_name,
            last_name: orderData.billing_address.last_name,
            address1: orderData.billing_address.address1,
            address2: orderData.billing_address.address2,
            city: orderData.billing_address.city,
            province: orderData.billing_address.province,
            province_code: orderData.billing_address.province_code,
            country: orderData.billing_address.country,
            country_code: orderData.billing_address.country_code,
            zip: orderData.billing_address.zip,
            phone: orderData.billing_address.phone,
            name: orderData.billing_address.name,
            company: orderData.billing_address.company,
          }
        : null;

      // Extract COMPLETE customer info from data
      if (orderData?.customer) {
        order.customer_info = {
          id: orderData.customer.id,
          email: orderData.customer.email,
          first_name: orderData.customer.first_name,
          last_name: orderData.customer.last_name,
          phone: orderData.customer.phone,
          orders_count: orderData.customer.orders_count,
          total_spent: orderData.customer.total_spent,
          verified_email: orderData.customer.verified_email,
          accepts_marketing: orderData.customer.accepts_marketing,
          tags: orderData.customer.tags,
          note: orderData.customer.note,
          state: orderData.customer.state,
        };
        order.customer_phone = orderData.customer.phone || order.customer_phone;
      }

      // Extract shipping lines (shipping methods)
      order.shipping_lines = orderData?.shipping_lines || [];

      // Extract discount codes
      order.discount_codes = orderData?.discount_codes || [];

      // Extract discount applications
      order.discount_applications = orderData?.discount_applications || [];

      // Extract tax lines
      order.tax_lines = orderData?.tax_lines || [];

      // Extract refunds (المرتجعات)
      order.refunds = orderData?.refunds || [];

      // Calculate total refunded amount
      order.total_refunded = order.refunds.reduce((sum, refund) => {
        const refundTransactions = refund.transactions || [];
        return (
          sum +
          refundTransactions.reduce(
            (tSum, t) => tSum + parseFloat(t.amount || 0),
            0,
          )
        );
      }, 0);

      // Extract fulfillments
      order.fulfillments = orderData?.fulfillments || [];

      // Extract payment details
      order.payment_details = orderData?.payment_details || null;
      order.payment_gateway_names = orderData?.payment_gateway_names || [];
      order.processing_method = orderData?.processing_method || null;

      // Extract financial status
      order.financial_status = orderData?.financial_status || null;
      const mirroredStatus = extractStatusFromOrderData(orderData);
      if (mirroredStatus) {
        order.status = mirroredStatus;
      }
      const normalizedFinancialStatus = String(order.financial_status || "")
        .toLowerCase()
        .trim();
      const manualPaymentMethod = extractPaymentMethodFromOrderData(orderData);
      order.payment_method =
        normalizedFinancialStatus === "paid" ||
        normalizedFinancialStatus === "partially_paid"
          ? "shopify"
          : manualPaymentMethod === "instapay" || manualPaymentMethod === "wallet"
            ? manualPaymentMethod
            : "none";

      // Extract tags
      order.tags = orderData?.tags || "";

      // Extract note (customer note)
      order.customer_note = orderData?.note || "";

      // Extract note attributes
      order.note_attributes = orderData?.note_attributes || [];

      // Extract source information
      order.source_name = orderData?.source_name || "";
      order.source_identifier = orderData?.source_identifier || "";
      order.source_url = orderData?.source_url || "";

      // Extract browser and device info
      order.browser_ip = orderData?.browser_ip || null;
      order.client_details = orderData?.client_details || null;

      // Extract totals from data
      order.total_shipping =
        orderData?.total_shipping_price_set?.shop_money?.amount ||
        orderData?.shipping_lines?.reduce(
          (sum, line) => sum + parseFloat(line.price || 0),
          0,
        ) ||
        0;

      // Extract all price breakdowns
      order.subtotal_price = orderData?.subtotal_price || order.subtotal_price;
      order.total_line_items_price =
        orderData?.total_line_items_price || order.total_price;
      order.total_discounts = orderData?.total_discounts || 0;
      order.total_tax = orderData?.total_tax || 0;
      order.total_tip_received = orderData?.total_tip_received || 0;
      order.total_weight = orderData?.total_weight || 0;

      // Extract presentment currency (for multi-currency)
      order.presentment_currency = orderData?.presentment_currency || null;
      order.total_price_set = orderData?.total_price_set || null;

      // Extract order status URL
      order.order_status_url = orderData?.order_status_url || null;

      // Extract cancel information
      order.cancelled_at = orderData?.cancelled_at || null;
      order.cancel_reason = orderData?.cancel_reason || null;

      // Extract closed information
      order.closed_at = orderData?.closed_at || null;

      // Extract test order flag
      order.test = orderData?.test || false;

      // Extract buyer accepts marketing
      order.buyer_accepts_marketing =
        orderData?.buyer_accepts_marketing || false;

      // Extract referring site
      order.referring_site = orderData?.referring_site || null;

      // Extract landing site
      order.landing_site = orderData?.landing_site || null;

      // Extract checkout information
      order.checkout_id = orderData?.checkout_id || null;
      order.checkout_token = orderData?.checkout_token || null;

      // Extract cart token
      order.cart_token = orderData?.cart_token || null;

      // Extract location information
      order.location_id = orderData?.location_id || null;

      // Extract user information
      order.user_id_shopify = orderData?.user_id || null;

      // Extract app information
      order.app_id = orderData?.app_id || null;

      // Parse notes if it's a string
      if (typeof order.notes === "string") {
        try {
          order.notes = JSON.parse(order.notes);
        } catch (e) {
          order.notes = [];
        }
      }

      // Ensure notes is an array
      if (!Array.isArray(order.notes)) {
        order.notes = [];
      }

      // Sort notes by created_at (newest first)
      order.notes.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );

      return order;
    } catch (error) {
      console.error("Get order details error:", error);
      throw error;
    }
  }

  /**
   * Add a note/comment to an order
   */
  static async addOrderNote(userId, orderId, content, author) {
    try {
      // Get current order
      const { data: order, error } = await Order.findByIdForUser(
        userId,
        orderId,
      );

      if (error || !order) {
        throw new Error("Order not found");
      }

      // Sanitize content (remove HTML tags)
      const sanitizedContent = content.replace(/<[^>]*>/g, "");

      if (!sanitizedContent.trim()) {
        throw new Error("Note content cannot be empty");
      }

      // Parse existing notes
      let notes = [];
      if (order.notes) {
        if (typeof order.notes === "string") {
          try {
            notes = JSON.parse(order.notes);
          } catch (e) {
            notes = [];
          }
        } else if (Array.isArray(order.notes)) {
          notes = order.notes;
        }
      }

      // Create new note
      const newNote = {
        content: sanitizedContent,
        author: author || "مستخدم",
        created_at: new Date().toISOString(),
        synced_to_shopify: false,
      };

      // Add to notes array
      notes.unshift(newNote); // Add to beginning

      // Update order
      const { supabase } = await import("../supabaseClient.js");
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          notes: JSON.stringify(notes),
          pending_sync: true,
          local_updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        throw updateError;
      }

      // Log operation
      await this.logSyncOperation(userId, orderId, "order_note_add", {
        note: newNote,
      });

      try {
        await this.syncNoteToShopify(userId, orderId, newNote);
      } catch (syncError) {
        const rollbackNotes = notes.filter(
          (item) =>
            !(
              item?.created_at === newNote.created_at &&
              String(item?.content || "") === String(newNote.content || "")
            ),
        );

        await supabase
          .from("orders")
          .update({
            notes: JSON.stringify(rollbackNotes),
            pending_sync: false,
            sync_error: syncError.message,
            local_updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        throw new Error(
          `Shopify sync failed. Note was rolled back: ${syncError.message}`,
        );
      }

      return {
        success: true,
        note: newNote,
      };
    } catch (error) {
      console.error("Add order note error:", error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  static async updateOrderStatus(userId, orderId, newStatus, options = {}) {
    // Validate status
    const validStatuses = [
      "pending",
      "authorized",
      "paid",
      "partially_paid",
      "refunded",
      "voided",
      "partially_refunded",
    ];

    if (!validStatuses.includes(newStatus)) {
      throw new Error("Invalid status");
    }

    const voidReason = String(options?.voidReason || "").trim();
    if (newStatus === "voided") {
      if (!voidReason) {
        throw new Error("Void reason is required");
      }
      if (voidReason.length < 3) {
        throw new Error("Void reason must be at least 3 characters long");
      }
    }

    try {
      // Get current order
      const { data: order, error } = await Order.findByIdForUser(
        userId,
        orderId,
      );

      if (error || !order) {
        throw new Error("Order not found");
      }

      // Access already validated through store scope (findByIdForUser)

      // Save old status
      const oldStatus = order.status;
      if (String(oldStatus || "") === String(newStatus || "")) {
        return {
          success: true,
          localUpdate: false,
          shopifySync: "not_needed",
        };
      }

      // Update order
      const { supabase } = await import("../supabaseClient.js");
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: newStatus,
          pending_sync: true,
          local_updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        throw updateError;
      }

      // Log operation
      await this.logSyncOperation(userId, orderId, "order_status_update", {
        old_status: oldStatus,
        new_status: newStatus,
        void_reason: newStatus === "voided" ? voidReason : null,
      });

      try {
        await this.syncStatusToShopify(userId, orderId, newStatus, {
          voidReason,
        });
      } catch (syncError) {
        await supabase
          .from("orders")
          .update({
            status: oldStatus,
            pending_sync: false,
            sync_error: syncError.message,
            local_updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        throw new Error(
          `Shopify sync failed. Status rolled back: ${syncError.message}`,
        );
      }

      return {
        success: true,
        localUpdate: true,
        shopifySync: "synced",
      };
    } catch (error) {
      console.error("Update order status error:", error);
      throw error;
    }
  }

  /**
   * Sync note to Shopify
   */
  static async syncNoteToShopify(userId, orderId, note) {
    try {
      const { data: order } = await Order.findByIdForUser(userId, orderId);
      if (!order || !order.shopify_id) {
        throw new Error("Order not found or missing Shopify ID");
      }

      const tokenData = await getShopifyTokenForStore(order.store_id, userId);

      if (!tokenData) {
        throw new Error("Shopify not connected");
      }

      const noteContent = String(note?.content || "").replace(/\s+/g, " ").trim();
      const noteAuthor = String(note?.author || "User").replace(/\s+/g, " ").trim();
      const noteLine = `[Tetiano] Note by "${noteAuthor}" at ${new Date().toISOString()}: ${noteContent}`;

      const responseData = await updateShopifyOrderNote({
        tokenData,
        order,
        logLine: noteLine,
      });

      // Update note sync status
      let notes = [];
      if (order.notes) {
        if (typeof order.notes === "string") {
          notes = JSON.parse(order.notes);
        } else if (Array.isArray(order.notes)) {
          notes = order.notes;
        }
      }

      // Find and update the note
      const noteIndex = notes.findIndex(
        (n) => n.created_at === note.created_at && n.content === note.content,
      );
      if (noteIndex !== -1) {
        notes[noteIndex].synced_to_shopify = true;
      }

      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          notes: JSON.stringify(notes),
          pending_sync: false,
          last_synced_at: new Date().toISOString(),
          shopify_updated_at:
            responseData?.order?.updated_at ||
            responseData?.updated_at ||
            new Date().toISOString(),
          sync_error: null,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(userId, orderId, "success", responseData);

      return { success: true };
    } catch (error) {
      console.error("Shopify note sync error:", error);
      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          pending_sync: false,
          sync_error: error.message,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(
        userId,
        orderId,
        "failed",
        null,
        error.message,
      );
      throw error;
    }
  }

  static async syncPaymentMethodToShopify(
    userId,
    orderId,
    nextMethod,
    options = {},
  ) {
    try {
      const { data: order } = await Order.findByIdForUser(userId, orderId);
      if (!order || !order.shopify_id) {
        throw new Error("Order not found or missing Shopify ID");
      }

      const tokenData = await getShopifyTokenForStore(order.store_id, userId);
      if (!tokenData) {
        throw new Error("Shopify not connected");
      }

      const orderData = parseOrderData(order);
      const previousMethod = String(options?.previousMethod || "none")
        .toLowerCase()
        .trim();
      const methodValue = normalizePaymentMethod(nextMethod);
      if (!methodValue) {
        throw new Error("Invalid payment method");
      }
      const statusForMirror =
        normalizeOrderStatus(order.status) ||
        extractStatusFromOrderData(orderData) ||
        normalizeOrderStatus(orderData?.financial_status);
      const mirroredControlData = applyTetianoControlValuesToOrderData(orderData, {
        status: statusForMirror,
        paymentMethod: methodValue,
      });
      const paymentMethodLine = `[Tetiano] Payment method changed from "${previousMethod}" to "${methodValue}" at ${new Date().toISOString()}`;

      const responseData = await updateShopifyOrderNote({
        tokenData,
        order,
        logLine: paymentMethodLine,
        extraOrderFields: {
          tags: mirroredControlData.tags,
          note_attributes: mirroredControlData.note_attributes,
        },
      });

      const responseOrderPayload = getShopifyOrderPayload(responseData);
      const nextOrderData = applyTetianoControlValuesToOrderData(
        responseOrderPayload || orderData,
        {
          status: statusForMirror,
          paymentMethod: methodValue,
        },
      );

      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          data: nextOrderData,
          pending_sync: false,
          last_synced_at: new Date().toISOString(),
          shopify_updated_at:
            responseData?.order?.updated_at ||
            responseData?.updated_at ||
            new Date().toISOString(),
          sync_error: null,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(userId, orderId, "success", responseData);
      return { success: true };
    } catch (error) {
      console.error("Shopify payment method sync error:", error);

      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          pending_sync: false,
          sync_error: error.message,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(
        userId,
        orderId,
        "failed",
        null,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Sync status to Shopify
   */
  static async syncStatusToShopify(userId, orderId, newStatus, options = {}) {
    try {
      const { data: order } = await Order.findByIdForUser(userId, orderId);
      if (!order || !order.shopify_id) {
        throw new Error("Order not found or missing Shopify ID");
      }

      const tokenData = await getShopifyTokenForStore(order.store_id, userId);

      if (!tokenData) {
        throw new Error("Shopify not connected");
      }

      const normalizedStatus = normalizeOrderStatus(newStatus);
      if (!normalizedStatus) {
        throw new Error("Invalid status");
      }

      const orderData = parseOrderData(order);
      const paymentMethodForMirror = extractPaymentMethodFromOrderData(orderData);
      const mirroredControlData = applyTetianoControlValuesToOrderData(orderData, {
        status: normalizedStatus,
        paymentMethod: paymentMethodForMirror,
      });
      const statusLogLine = `[Tetiano] Status changed to "${normalizedStatus}" at ${new Date().toISOString()}${options?.voidReason ? ` (Reason: ${options.voidReason})` : ""}`;

      let responseData = null;
      if (normalizedStatus === "voided") {
        const cancelResponse = await axios.post(
          `https://${tokenData.shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${order.shopify_id}/cancel.json`,
          {
            reason: "other",
            email: false,
          },
          { headers: buildShopifyHeaders(tokenData.access_token) },
        );
        responseData = cancelResponse.data;

        try {
          const metadataSyncResponse = await updateShopifyOrderNote({
            tokenData,
            order,
            logLine: statusLogLine,
            extraOrderFields: {
              tags: mirroredControlData.tags,
              note_attributes: mirroredControlData.note_attributes,
            },
          });
          if (metadataSyncResponse) {
            responseData = metadataSyncResponse;
          }
        } catch (metadataSyncError) {
          console.warn(
            "Status metadata sync warning after cancel:",
            metadataSyncError?.message || metadataSyncError,
          );
        }
      } else {
        responseData = await updateShopifyOrderNote({
          tokenData,
          order,
          logLine: statusLogLine,
          extraOrderFields: {
            tags: mirroredControlData.tags,
            note_attributes: mirroredControlData.note_attributes,
          },
        });
      }

      const responseOrderPayload = getShopifyOrderPayload(responseData);
      const nextOrderData = applyTetianoControlValuesToOrderData(
        responseOrderPayload || orderData,
        {
          status: normalizedStatus,
          paymentMethod: paymentMethodForMirror,
        },
      );

      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          data: nextOrderData,
          pending_sync: false,
          last_synced_at: new Date().toISOString(),
          shopify_updated_at:
            responseData?.order?.updated_at ||
            responseData?.updated_at ||
            new Date().toISOString(),
          sync_error: null,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(userId, orderId, "success", responseData);

      return { success: true };
    } catch (error) {
      console.error("Shopify status sync error:", error);

      const { supabase } = await import("../supabaseClient.js");
      await supabase
        .from("orders")
        .update({
          pending_sync: false,
          sync_error: error.message,
        })
        .eq("id", orderId);

      await this.updateSyncOperationStatus(
        userId,
        orderId,
        "failed",
        null,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Log sync operation
   */
  static async logSyncOperation(userId, entityId, operationType, requestData) {
    try {
      const { supabase } = await import("../supabaseClient.js");
      await supabase.from("sync_operations").insert([
        {
          user_id: userId,
          operation_type: operationType,
          entity_type: "order",
          entity_id: entityId,
          direction: "to_shopify",
          status: "pending",
          request_data: requestData,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Failed to log sync operation:", error);
    }
  }

  /**
   * Update sync operation status
   */
  static async updateSyncOperationStatus(
    userId,
    entityId,
    status,
    responseData = null,
    errorMessage = null,
  ) {
    try {
      const { supabase } = await import("../supabaseClient.js");

      // Find the most recent pending operation
      const { data: operations } = await supabase
        .from("sync_operations")
        .select("*")
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      if (operations && operations.length > 0) {
        await supabase
          .from("sync_operations")
          .update({
            status,
            response_data: responseData,
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", operations[0].id);
      }
    } catch (error) {
      console.error("Failed to update sync operation status:", error);
    }
  }
}
