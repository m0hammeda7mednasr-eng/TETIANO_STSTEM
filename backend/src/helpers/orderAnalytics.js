const PAID_LIKE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);

const CANCELLED_STATUSES = new Set(["voided", "cancelled"]);
const TETIANO_STATUS_TAG_PREFIXES = ["tetiano_status:"];
const TETIANO_STATUS_NOTE_ATTRIBUTE_NAMES = ["tetiano_status", "status"];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseOrderData = (order) => {
  if (!order) {
    return {};
  }

  if (typeof order.data === "string") {
    try {
      return JSON.parse(order.data);
    } catch {
      return {};
    }
  }

  return order.data || {};
};

export const parseTagList = (tagsValue) => {
  if (Array.isArray(tagsValue)) {
    return tagsValue.map((tag) => String(tag || "").trim()).filter(Boolean);
  }

  return String(tagsValue || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

export const extractTagValueByPrefixes = (tags, prefixes = []) => {
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

export const getNoteAttributeValue = (data, keys = []) => {
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

export const resolveOrderStatusFromData = (data = {}) => {
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

export const getOrderFinancialStatus = (order) => {
  const data = parseOrderData(order);
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

export const getOrderFulfillmentStatus = (order) => {
  const data = parseOrderData(order);
  return String(order?.fulfillment_status || data?.fulfillment_status || "")
    .toLowerCase()
    .trim();
};

export const getOrderGrossAmount = (order) => {
  const data = parseOrderData(order);
  return toNumber(order?.total_price ?? data?.total_price);
};

export const getOrderCurrentAmount = (order) => {
  const data = parseOrderData(order);
  return toNumber(order?.current_total_price ?? data?.current_total_price);
};

export const getRefundedAmountFromTransactions = (order) => {
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

export const getOrderRefundedAmount = (order) => {
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

export const isCancelledOrder = (order) => {
  const data = parseOrderData(order);
  const financialStatus = getOrderFinancialStatus(order);

  return (
    Boolean(order?.cancelled_at) ||
    Boolean(data?.cancelled_at) ||
    CANCELLED_STATUSES.has(financialStatus)
  );
};

const getDiscountAllocationsAmount = (item) => {
  const allocations = Array.isArray(item?.discount_allocations)
    ? item.discount_allocations
    : [];

  return allocations.reduce(
    (sum, allocation) => sum + toNumber(allocation?.amount),
    0,
  );
};

const getLineItemOrderedQuantity = (item) => Math.max(0, toNumber(item?.quantity));

const getLineItemGrossTotal = (item) => {
  const quantity = getLineItemOrderedQuantity(item);
  const explicitGrossTotal = Math.max(
    toNumber(item?.original_total_price),
    toNumber(item?.original_line_price),
    toNumber(item?.line_price),
  );
  if (explicitGrossTotal > 0) {
    return explicitGrossTotal;
  }

  const unitPrice = Math.max(
    toNumber(item?.original_price),
    toNumber(item?.price),
    toNumber(item?.price_set?.shop_money?.amount),
    toNumber(item?.price_set?.presentment_money?.amount),
  );

  return quantity > 0 ? unitPrice * quantity : 0;
};

export const getLineItemBookedAmount = (item) => {
  const quantity = getLineItemOrderedQuantity(item);
  if (quantity <= 0) {
    return 0;
  }

  const explicitBookedAmount = Math.max(
    toNumber(item?.discounted_total),
    toNumber(item?.discounted_total_price),
    toNumber(item?.final_line_price),
  );
  if (explicitBookedAmount > 0) {
    return explicitBookedAmount;
  }

  const discountedUnitPrice = Math.max(
    toNumber(item?.discounted_price),
    toNumber(item?.final_price),
  );
  if (discountedUnitPrice > 0) {
    return discountedUnitPrice * quantity;
  }

  const grossAmount = getLineItemGrossTotal(item);
  if (grossAmount <= 0) {
    return 0;
  }

  const discountAmount = Math.max(
    toNumber(item?.total_discount),
    getDiscountAllocationsAmount(item),
  );

  return Math.max(0, grossAmount - discountAmount);
};

export const getLineItemBookedUnitAmount = (item) => {
  const quantity = getLineItemOrderedQuantity(item);
  if (quantity <= 0) {
    return 0;
  }

  return getLineItemBookedAmount(item) / quantity;
};

export { CANCELLED_STATUSES, PAID_LIKE_STATUSES };
