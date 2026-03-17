export const SUPPLIER_ENTRY_TYPES = new Set(["delivery", "payment", "adjustment"]);

const PAYMENT_METHOD_FALLBACK = "bank_transfer";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value || "").trim();

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const parseItemsField = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

export const sanitizeSupplierPayload = (payload = {}) => ({
  code: normalizeText(payload.code),
  name: normalizeText(payload.name),
  contact_name: normalizeText(payload.contact_name),
  phone: normalizeText(payload.phone),
  address: normalizeText(payload.address),
  notes: normalizeText(payload.notes),
  opening_balance: roundCurrency(payload.opening_balance),
  is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
});

export const sanitizeDeliveryItems = (items) => {
  const list = Array.isArray(items) ? items : [];

  return list
    .map((item) => {
      const productName = normalizeText(item?.product_name);
      const productId = normalizeText(item?.product_id);
      const variantId = normalizeText(item?.variant_id);
      const variantTitle = normalizeText(item?.variant_title);
      const sku = normalizeText(item?.sku);
      const material = normalizeText(item?.material);
      const quantity = toNumber(item?.quantity);
      const unitCost = roundCurrency(item?.unit_cost);
      const totalCostInput = roundCurrency(item?.total_cost);
      const totalCost =
        totalCostInput > 0 ? totalCostInput : roundCurrency(quantity * unitCost);

      if (!productName || quantity <= 0) {
        return null;
      }

      return {
        product_id: productId,
        variant_id: variantId,
        variant_title: variantTitle,
        product_name: productName,
        sku,
        material,
        quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        notes: normalizeText(item?.notes),
      };
    })
    .filter(Boolean);
};

export const sanitizeDeliveryPayload = (payload = {}) => {
  const items = sanitizeDeliveryItems(payload.items);
  const amount = roundCurrency(
    items.reduce((sum, item) => sum + toNumber(item.total_cost), 0),
  );

  return {
    entry_date: normalizeText(payload.entry_date),
    reference_code: normalizeText(payload.reference_code),
    description: normalizeText(payload.description),
    notes: normalizeText(payload.notes),
    payment_account: normalizeText(payload.payment_account),
    payment_method:
      normalizeText(payload.payment_method) || PAYMENT_METHOD_FALLBACK,
    amount,
    items,
  };
};

export const sanitizePaymentPayload = (payload = {}) => ({
  entry_date: normalizeText(payload.entry_date),
  reference_code: normalizeText(payload.reference_code),
  description: normalizeText(payload.description),
  notes: normalizeText(payload.notes),
  payment_account: normalizeText(payload.payment_account),
  payment_method:
    normalizeText(payload.payment_method) || PAYMENT_METHOD_FALLBACK,
  amount: roundCurrency(payload.amount),
});

const normalizeEntry = (entry = {}) => ({
  ...entry,
  entry_type: normalizeText(entry.entry_type).toLowerCase(),
  amount: roundCurrency(entry.amount),
  items: parseItemsField(entry.items),
});

const buildSupplierSummary = (supplier, entries = []) => {
  const normalizedEntries = (entries || []).map(normalizeEntry);
  const deliveryEntries = normalizedEntries.filter(
    (entry) => entry.entry_type === "delivery",
  );
  const paymentEntries = normalizedEntries.filter(
    (entry) => entry.entry_type === "payment",
  );
  const adjustmentEntries = normalizedEntries.filter(
    (entry) => entry.entry_type === "adjustment",
  );

  const totalDeliveries = roundCurrency(
    deliveryEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
  );
  const totalPayments = roundCurrency(
    paymentEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
  );
  const totalAdjustments = roundCurrency(
    adjustmentEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
  );
  const receivedItems = deliveryEntries.flatMap((entry) =>
    (entry.items || []).map((item) => ({
      ...item,
      delivery_id: entry.id,
      entry_date: entry.entry_date,
      reference_code: entry.reference_code || "",
      supplier_id: supplier?.id || null,
    })),
  );
  const totalReceivedQuantity = receivedItems.reduce(
    (sum, item) => sum + toNumber(item.quantity),
    0,
  );
  const openingBalance = roundCurrency(supplier?.opening_balance);
  const outstandingBalance = roundCurrency(
    openingBalance + totalDeliveries + totalAdjustments - totalPayments,
  );

  return {
    opening_balance: openingBalance,
    total_deliveries: totalDeliveries,
    total_payments: totalPayments,
    total_adjustments: totalAdjustments,
    outstanding_balance: outstandingBalance,
    deliveries_count: deliveryEntries.length,
    payments_count: paymentEntries.length,
    received_items_count: receivedItems.length,
    received_quantity: totalReceivedQuantity,
    last_delivery_at: deliveryEntries[0]?.entry_date || null,
    last_payment_at: paymentEntries[0]?.entry_date || null,
    received_items: receivedItems,
    payments: paymentEntries,
    entries: normalizedEntries,
  };
};

export const buildSupplierList = (suppliers = [], entries = []) =>
  (suppliers || [])
    .map((supplier) => {
      const supplierEntries = (entries || []).filter(
        (entry) => String(entry?.supplier_id || "").trim() === String(supplier?.id || "").trim(),
      );
      const summary = buildSupplierSummary(supplier, supplierEntries);

      return {
        ...supplier,
        ...summary,
        entries: undefined,
        payments: undefined,
        received_items: undefined,
      };
    })
    .sort((left, right) => {
      const leftActive = left?.is_active !== false ? 1 : 0;
      const rightActive = right?.is_active !== false ? 1 : 0;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }

      return String(left?.name || "").localeCompare(String(right?.name || ""), "ar");
    });

export const buildSupplierDetail = (supplier, entries = []) => {
  const normalizedEntries = (entries || [])
    .map(normalizeEntry)
    .sort((left, right) => {
      const rightTime = new Date(
        right.entry_date || right.created_at || 0,
      ).getTime();
      const leftTime = new Date(left.entry_date || left.created_at || 0).getTime();
      return rightTime - leftTime;
    });
  const summary = buildSupplierSummary(supplier, normalizedEntries);

  return {
    ...supplier,
    ...summary,
    entries: normalizedEntries,
    payments: summary.payments,
    received_items: summary.received_items,
  };
};
