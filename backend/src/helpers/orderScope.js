import {
  PAID_LIKE_STATUSES,
  extractTagValueByPrefixes,
  getNoteAttributeValue,
  getOrderFinancialStatus,
  getOrderFulfillmentStatus,
  getOrderGrossAmount,
  getOrderRefundedAmount,
  isCancelledOrder,
  parseOrderData,
  parseTagList,
} from "./orderAnalytics.js";

const TETIANO_PAYMENT_TAG_PREFIXES = ["tetiano_payment_method:", "tetiano_pm:"];
const TETIANO_PAYMENT_NOTE_ATTRIBUTE_NAMES = [
  "tetiano_payment_method",
  "tetiano_pm",
  "payment_method",
];

const DEFAULT_ORDER_SCOPE_FILTERS = {
  search: "",
  dateFrom: "",
  dateTo: "",
  orderNumberFrom: "",
  orderNumberTo: "",
  minTotal: "",
  maxTotal: "",
  paymentStatus: "all",
  paymentMethod: "all",
  fulfillmentStatus: "all",
  refundFilter: "all",
  cancelledOnly: false,
  fulfilledOnly: false,
  paidOnly: false,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const normalizePaymentMethod = (value) => {
  const normalized = normalizeText(value);
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

const normalizeBoolean = (value) => normalizeText(value) === "true";

const startOfDay = (value) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
};

export const normalizeOrderScopeFilters = (rawFilters = {}) => ({
  search: String(rawFilters?.search || "").trim(),
  dateFrom: String(rawFilters?.date_from || rawFilters?.dateFrom || "").trim(),
  dateTo: String(rawFilters?.date_to || rawFilters?.dateTo || "").trim(),
  orderNumberFrom: String(
    rawFilters?.order_number_from || rawFilters?.orderNumberFrom || "",
  ).trim(),
  orderNumberTo: String(
    rawFilters?.order_number_to || rawFilters?.orderNumberTo || "",
  ).trim(),
  minTotal: String(rawFilters?.min_total || rawFilters?.minTotal || "").trim(),
  maxTotal: String(rawFilters?.max_total || rawFilters?.maxTotal || "").trim(),
  paymentStatus:
    normalizeText(rawFilters?.payment_status || rawFilters?.paymentStatus) || "all",
  paymentMethod:
    normalizePaymentMethod(rawFilters?.payment_method || rawFilters?.paymentMethod) ||
    (normalizeText(rawFilters?.payment_method || rawFilters?.paymentMethod) === "all"
      ? "all"
      : "all"),
  fulfillmentStatus:
    normalizeText(
      rawFilters?.fulfillment_status || rawFilters?.fulfillmentStatus,
    ) || "all",
  refundFilter:
    normalizeText(rawFilters?.refund_filter || rawFilters?.refundFilter) || "all",
  cancelledOnly: Boolean(
    rawFilters?.cancelledOnly || normalizeBoolean(rawFilters?.cancelled_only),
  ),
  fulfilledOnly: Boolean(
    rawFilters?.fulfilledOnly || normalizeBoolean(rawFilters?.fulfilled_only),
  ),
  paidOnly: Boolean(rawFilters?.paidOnly || normalizeBoolean(rawFilters?.paid_only)),
});

export const hasActiveOrderScopeFilters = (rawFilters = {}) => {
  const filters = normalizeOrderScopeFilters(rawFilters);
  return Object.entries(DEFAULT_ORDER_SCOPE_FILTERS).some(([key, defaultValue]) => {
    if (typeof defaultValue === "boolean") {
      return Boolean(filters[key]) !== defaultValue;
    }

    return String(filters[key] || "") !== defaultValue;
  });
};

export const getOrderScopeFiltersCacheKey = (rawFilters = {}) => {
  const filters = normalizeOrderScopeFilters(rawFilters);
  return [
    filters.search,
    filters.dateFrom,
    filters.dateTo,
    filters.orderNumberFrom,
    filters.orderNumberTo,
    filters.minTotal,
    filters.maxTotal,
    filters.paymentStatus,
    filters.paymentMethod,
    filters.fulfillmentStatus,
    filters.refundFilter,
    filters.cancelledOnly ? "1" : "0",
    filters.fulfilledOnly ? "1" : "0",
    filters.paidOnly ? "1" : "0",
  ].join("|");
};

export const resolveManualPaymentMethodFromData = (data = {}) => {
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

  return normalizePaymentMethod(
    extractTagValueByPrefixes(
      parseTagList(data?.tags),
      TETIANO_PAYMENT_TAG_PREFIXES,
    ),
  );
};

export const isShopifyPaidOrder = (order) => {
  const status = getOrderFinancialStatus(order);
  return status === "paid" || status === "partially_paid";
};

export const resolveOrderPaymentMethod = (order) => {
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

  const data = parseOrderData(order);
  const manualMethod =
    normalizePaymentMethod(order?.manual_payment_method) ||
    resolveManualPaymentMethodFromData(data);

  if (manualMethod === "instapay" || manualMethod === "wallet") {
    return manualMethod;
  }

  return "none";
};

export const getOrderScopeMeta = (order) => {
  const paymentStatus = normalizeText(getOrderFinancialStatus(order));
  const fulfillmentStatus = normalizeText(getOrderFulfillmentStatus(order));
  const totalPrice = toNumber(getOrderGrossAmount(order));
  const refundedAmount = toNumber(getOrderRefundedAmount(order));
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
  const isPaid = isShopifyPaidOrder(order);
  const isPaidLike = PAID_LIKE_STATUSES.has(paymentStatus);
  const isFulfilled = fulfillmentStatus === "fulfilled";

  return {
    paymentStatus,
    fulfillmentStatus,
    paymentMethod: resolveOrderPaymentMethod(order),
    refundedAmount,
    totalPrice,
    isCancelled: isCancelledOrder(order),
    hasAnyRefund,
    isPartialRefund,
    isFullRefund,
    isPaid,
    isPaidLike,
    isFulfilled,
    orderNumberNumeric: toNumber(order?.order_number),
    createdAtDate: new Date(order?.created_at),
  };
};

const matchesOrderSearch = (order, keyword) => {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return true;
  }

  return [
    order?.customer_name,
    order?.customer_email,
    order?.order_number,
    order?.shopify_id,
  ].some((value) => String(value || "").toLowerCase().includes(normalizedKeyword));
};

export const matchesOrderScopeFilters = (order, rawFilters = {}) => {
  const filters = normalizeOrderScopeFilters(rawFilters);
  const meta = getOrderScopeMeta(order);

  if (!matchesOrderSearch(order, filters.search)) {
    return false;
  }

  const from = filters.dateFrom ? startOfDay(filters.dateFrom) : null;
  if (from && meta.createdAtDate < from) {
    return false;
  }

  const to = filters.dateTo ? endOfDay(filters.dateTo) : null;
  if (to && meta.createdAtDate > to) {
    return false;
  }

  if (filters.orderNumberFrom) {
    const minOrderNumber = toNumber(filters.orderNumberFrom);
    if (meta.orderNumberNumeric < minOrderNumber) {
      return false;
    }
  }

  if (filters.orderNumberTo) {
    const maxOrderNumber = toNumber(filters.orderNumberTo);
    if (meta.orderNumberNumeric > maxOrderNumber) {
      return false;
    }
  }

  if (filters.minTotal) {
    const minTotal = toNumber(filters.minTotal);
    if (meta.totalPrice < minTotal) {
      return false;
    }
  }

  if (filters.maxTotal) {
    const maxTotal = toNumber(filters.maxTotal);
    if (meta.totalPrice > maxTotal) {
      return false;
    }
  }

  if (filters.paymentStatus !== "all") {
    if (filters.paymentStatus === "paid_or_partial") {
      if (
        meta.paymentStatus !== "paid" &&
        meta.paymentStatus !== "partially_paid"
      ) {
        return false;
      }
    } else if (filters.paymentStatus === "pending_or_authorized") {
      if (
        meta.paymentStatus !== "pending" &&
        meta.paymentStatus !== "authorized"
      ) {
        return false;
      }
    } else if (meta.paymentStatus !== filters.paymentStatus) {
      return false;
    }
  }

  if (
    filters.paymentMethod !== "all" &&
    meta.paymentMethod !== filters.paymentMethod
  ) {
    return false;
  }

  if (filters.fulfillmentStatus !== "all") {
    if (filters.fulfillmentStatus === "unfulfilled") {
      if (
        meta.fulfillmentStatus &&
        meta.fulfillmentStatus !== "unfulfilled" &&
        meta.fulfillmentStatus !== "null"
      ) {
        return false;
      }
    } else if (meta.fulfillmentStatus !== filters.fulfillmentStatus) {
      return false;
    }
  }

  if (filters.refundFilter !== "all") {
    if (filters.refundFilter === "any" && !meta.hasAnyRefund) {
      return false;
    }
    if (filters.refundFilter === "partial" && !meta.isPartialRefund) {
      return false;
    }
    if (filters.refundFilter === "full" && !meta.isFullRefund) {
      return false;
    }
    if (filters.refundFilter === "none" && meta.hasAnyRefund) {
      return false;
    }
  }

  if (filters.cancelledOnly && !meta.isCancelled) {
    return false;
  }

  if (filters.fulfilledOnly && !meta.isFulfilled) {
    return false;
  }

  if (filters.paidOnly && !meta.isPaid) {
    return false;
  }

  return true;
};

export const filterOrdersByScope = (rows = [], rawFilters = {}) =>
  (Array.isArray(rows) ? rows : []).filter((order) =>
    matchesOrderScopeFilters(order, rawFilters),
  );
