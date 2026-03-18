export const SUPPLIER_ENTRY_TYPES = new Set(["delivery", "payment", "adjustment"]);

const PAYMENT_METHOD_FALLBACK = "bank_transfer";
const DELIVERY_ITEM_TYPE_FALLBACK = "model";
const DELIVERY_ITEM_TYPES = new Set(["model", "fabric"]);
const DELIVERY_MEASUREMENT_UNIT_FALLBACK = "piece";
const DELIVERY_MEASUREMENT_UNITS = new Set(["piece", "meter", "kilo"]);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value || "").trim();

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const toUniqueSortedList = (values = []) =>
  Array.from(
    new Set(
      (values || [])
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "ar"));

const getItemDisplayName = (item = {}) =>
  normalizeText(
    item?.product_name || item?.fabric_name || item?.sku || item?.material,
  );

const getItemFabricLabel = (item = {}) => {
  const explicitFabricName = normalizeText(item?.fabric_name);
  if (explicitFabricName) {
    return explicitFabricName;
  }

  if (normalizeDeliveryItemType(item?.item_type) === "fabric") {
    return normalizeText(item?.product_name || item?.material);
  }

  return normalizeText(item?.material);
};

const buildProductGroupKey = (item = {}) => {
  const productId = normalizeText(item?.product_id);
  const variantId = normalizeText(item?.variant_id);
  const sku = normalizeText(item?.sku);
  const productName = normalizeText(item?.product_name);
  const variantTitle = normalizeText(item?.variant_title);

  if (productId) {
    return `product:${productId}:${variantId || "-"}`;
  }

  if (sku) {
    return `sku:${sku.toLowerCase()}`;
  }

  if (productName) {
    return `name:${productName.toLowerCase()}:${variantTitle.toLowerCase()}`;
  }

  return `fallback:${normalizeText(item?.delivery_id)}:${normalizeText(
    item?.piece_label,
  )}`;
};

const buildFabricGroupKey = (item = {}) => {
  const fabricLabel = getItemFabricLabel(item);
  const measurementUnit = normalizeMeasurementUnit(item?.measurement_unit);

  if (fabricLabel) {
    return `fabric:${fabricLabel.toLowerCase()}`;
  }

  return `unit:${measurementUnit}`;
};

const normalizeDeliveryItemType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return DELIVERY_ITEM_TYPES.has(normalized)
    ? normalized
    : DELIVERY_ITEM_TYPE_FALLBACK;
};

const normalizeMeasurementUnit = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return DELIVERY_MEASUREMENT_UNITS.has(normalized)
    ? normalized
    : DELIVERY_MEASUREMENT_UNIT_FALLBACK;
};

const getMaterialUnitPrice = ({
  measurement_unit,
  price_per_meter,
  price_per_kilo,
  piece_cost,
}) => {
  if (measurement_unit === "meter") {
    return roundCurrency(price_per_meter);
  }

  if (measurement_unit === "kilo") {
    return roundCurrency(price_per_kilo);
  }

  return roundCurrency(piece_cost);
};

const getDerivedPieceCost = ({
  measurement_unit,
  pieces_per_unit,
  price_per_meter,
  price_per_kilo,
  piece_cost,
}) => {
  const explicitPieceCost = roundCurrency(piece_cost);
  if (explicitPieceCost > 0) {
    return explicitPieceCost;
  }

  const piecesPerUnit = toNumber(pieces_per_unit);
  if (piecesPerUnit <= 0) {
    return 0;
  }

  const materialUnitPrice = getMaterialUnitPrice({
    measurement_unit,
    price_per_meter,
    price_per_kilo,
    piece_cost: 0,
  });

  if (materialUnitPrice <= 0) {
    return 0;
  }

  return roundCurrency(materialUnitPrice / piecesPerUnit);
};

const getSuggestedUnitCost = ({
  item_type,
  measurement_unit,
  pieces_per_unit,
  price_per_meter,
  price_per_kilo,
  piece_cost,
  manufacturing_cost,
  factory_service_cost,
}) => {
  const materialUnitPrice = getMaterialUnitPrice({
    measurement_unit,
    price_per_meter,
    price_per_kilo,
    piece_cost,
  });
  const derivedPieceCost = getDerivedPieceCost({
    measurement_unit,
    pieces_per_unit,
    price_per_meter,
    price_per_kilo,
    piece_cost,
  });

  if (normalizeDeliveryItemType(item_type) === "fabric") {
    return materialUnitPrice > 0 ? materialUnitPrice : derivedPieceCost;
  }

  return roundCurrency(
    (derivedPieceCost > 0 ? derivedPieceCost : materialUnitPrice) +
      roundCurrency(manufacturing_cost) +
      roundCurrency(factory_service_cost),
  );
};

const normalizeDeliveryItem = (item = {}) => {
  const itemType = normalizeDeliveryItemType(item?.item_type);
  const measurementUnit = normalizeMeasurementUnit(item?.measurement_unit);
  const productName = normalizeText(item?.product_name || item?.fabric_name);
  const quantity = toNumber(item?.quantity);
  const pricePerMeter = roundCurrency(item?.price_per_meter);
  const pricePerKilo = roundCurrency(item?.price_per_kilo);
  const pieceCostInput = roundCurrency(item?.piece_cost);
  const piecesPerUnit = toNumber(item?.pieces_per_unit);
  const manufacturingCost = roundCurrency(item?.manufacturing_cost);
  const factoryServiceCost = roundCurrency(item?.factory_service_cost);
  const materialUnitPrice = getMaterialUnitPrice({
    measurement_unit: measurementUnit,
    price_per_meter: pricePerMeter,
    price_per_kilo: pricePerKilo,
    piece_cost: pieceCostInput,
  });
  const pieceCost = getDerivedPieceCost({
    measurement_unit: measurementUnit,
    pieces_per_unit: piecesPerUnit,
    price_per_meter: pricePerMeter,
    price_per_kilo: pricePerKilo,
    piece_cost: pieceCostInput,
  });
  const unitCostInput = roundCurrency(item?.unit_cost);
  const unitCost =
    unitCostInput > 0
      ? unitCostInput
      : getSuggestedUnitCost({
          item_type: itemType,
          measurement_unit: measurementUnit,
          pieces_per_unit: piecesPerUnit,
          price_per_meter: pricePerMeter,
          price_per_kilo: pricePerKilo,
          piece_cost: pieceCost,
          manufacturing_cost: manufacturingCost,
          factory_service_cost: factoryServiceCost,
        });
  const totalCostInput = roundCurrency(item?.total_cost);
  const totalCost =
    totalCostInput > 0 ? totalCostInput : roundCurrency(quantity * unitCost);

  return {
    item_type: itemType,
    product_id: normalizeText(item?.product_id),
    variant_id: normalizeText(item?.variant_id),
    variant_title: normalizeText(item?.variant_title),
    product_name: productName,
    sku: normalizeText(item?.sku),
    material: normalizeText(item?.material),
    color: normalizeText(item?.color),
    piece_label: normalizeText(item?.piece_label),
    fabric_name: normalizeText(item?.fabric_name),
    measurement_unit: measurementUnit,
    pieces_per_unit: piecesPerUnit,
    price_per_meter: pricePerMeter,
    price_per_kilo: pricePerKilo,
    piece_cost: pieceCost,
    material_unit_price: materialUnitPrice,
    manufacturing_cost: manufacturingCost,
    factory_service_cost: factoryServiceCost,
    quantity,
    unit_cost: unitCost,
    total_cost: totalCost,
    notes: normalizeText(item?.notes),
  };
};

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
      const normalizedItem = normalizeDeliveryItem(item);

      if (!normalizedItem.product_name || normalizedItem.quantity <= 0) {
        return null;
      }

      return normalizedItem;
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
  items: parseItemsField(entry.items)
    .map((item) => normalizeDeliveryItem(item))
    .filter((item) =>
      Boolean(item.product_name || item.sku || item.material || item.fabric_name),
    ),
});

const buildItemRelations = (items = []) => {
  const productGroups = new Map();
  const fabricGroups = new Map();

  for (const item of items || []) {
    const normalizedItem = {
      ...item,
      ...normalizeDeliveryItem(item),
      delivery_id: normalizeText(item?.delivery_id),
      entry_date: normalizeText(item?.entry_date),
      reference_code: normalizeText(item?.reference_code),
      supplier_id: normalizeText(item?.supplier_id),
      supplier_name: normalizeText(item?.supplier_name),
      supplier_code: normalizeText(item?.supplier_code),
    };
    const productKey = buildProductGroupKey(normalizedItem);
    const fabricKey = buildFabricGroupKey(normalizedItem);
    const displayName = getItemDisplayName(normalizedItem);
    const fabricLabel = getItemFabricLabel(normalizedItem);
    const quantity = toNumber(normalizedItem.quantity);
    const totalCost = roundCurrency(normalizedItem.total_cost);
    const entryDate = normalizeText(normalizedItem.entry_date);

    if (displayName) {
      if (!productGroups.has(productKey)) {
        productGroups.set(productKey, {
          key: productKey,
          product_id: normalizedItem.product_id || null,
          variant_id: normalizedItem.variant_id || null,
          product_name: displayName,
          variant_title: normalizedItem.variant_title || "",
          sku: normalizedItem.sku || "",
          total_quantity: 0,
          total_cost: 0,
          last_delivery_at: null,
          colors: new Set(),
          materials: new Set(),
          fabrics: new Set(),
          item_types: new Set(),
          measurement_units: new Set(),
          delivery_ids: new Set(),
          items: [],
        });
      }

      const productGroup = productGroups.get(productKey);
      productGroup.total_quantity += quantity;
      productGroup.total_cost = roundCurrency(productGroup.total_cost + totalCost);
      productGroup.item_types.add(normalizedItem.item_type);
      productGroup.measurement_units.add(normalizedItem.measurement_unit);
      productGroup.delivery_ids.add(normalizedItem.delivery_id || productKey);
      if (normalizedItem.color) {
        productGroup.colors.add(normalizedItem.color);
      }
      if (normalizedItem.material) {
        productGroup.materials.add(normalizedItem.material);
      }
      if (fabricLabel) {
        productGroup.fabrics.add(fabricLabel);
      }
      if (
        entryDate &&
        (!productGroup.last_delivery_at || entryDate > productGroup.last_delivery_at)
      ) {
        productGroup.last_delivery_at = entryDate;
      }
      productGroup.items.push(normalizedItem);
    }

    if (fabricLabel) {
      if (!fabricGroups.has(fabricKey)) {
        fabricGroups.set(fabricKey, {
          key: fabricKey,
          fabric_name: fabricLabel,
          total_quantity: 0,
          total_cost: 0,
          last_delivery_at: null,
          colors: new Set(),
          materials: new Set(),
          measurement_units: new Set(),
          delivery_ids: new Set(),
          product_map: new Map(),
          items: [],
        });
      }

      const fabricGroup = fabricGroups.get(fabricKey);
      fabricGroup.total_quantity += quantity;
      fabricGroup.total_cost = roundCurrency(fabricGroup.total_cost + totalCost);
      fabricGroup.measurement_units.add(normalizedItem.measurement_unit);
      fabricGroup.delivery_ids.add(normalizedItem.delivery_id || fabricKey);
      if (normalizedItem.color) {
        fabricGroup.colors.add(normalizedItem.color);
      }
      if (normalizedItem.material) {
        fabricGroup.materials.add(normalizedItem.material);
      }
      if (
        entryDate &&
        (!fabricGroup.last_delivery_at || entryDate > fabricGroup.last_delivery_at)
      ) {
        fabricGroup.last_delivery_at = entryDate;
      }

      if (displayName) {
        fabricGroup.product_map.set(productKey, {
          key: productKey,
          product_id: normalizedItem.product_id || null,
          variant_id: normalizedItem.variant_id || null,
          product_name: displayName,
          variant_title: normalizedItem.variant_title || "",
          sku: normalizedItem.sku || "",
          item_type: normalizedItem.item_type,
        });
      }

      fabricGroup.items.push(normalizedItem);
    }
  }

  const productCatalog = Array.from(productGroups.values())
    .map((group) => ({
      ...group,
      total_quantity: roundCurrency(group.total_quantity),
      total_cost: roundCurrency(group.total_cost),
      deliveries_count: group.delivery_ids.size,
      colors: toUniqueSortedList(Array.from(group.colors)),
      materials: toUniqueSortedList(Array.from(group.materials)),
      fabrics: toUniqueSortedList(Array.from(group.fabrics)),
      item_types: toUniqueSortedList(Array.from(group.item_types)),
      measurement_units: toUniqueSortedList(Array.from(group.measurement_units)),
      items: [...group.items].sort((left, right) => {
        const rightTime = new Date(
          right.entry_date || right.created_at || 0,
        ).getTime();
        const leftTime = new Date(left.entry_date || left.created_at || 0).getTime();
        return rightTime - leftTime;
      }),
    }))
    .sort((left, right) => {
      const rightTime = new Date(right.last_delivery_at || 0).getTime();
      const leftTime = new Date(left.last_delivery_at || 0).getTime();
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(left.product_name || "").localeCompare(
        String(right.product_name || ""),
        "ar",
      );
    });

  const fabricCatalog = Array.from(fabricGroups.values())
    .map((group) => ({
      key: group.key,
      fabric_name: group.fabric_name,
      total_quantity: roundCurrency(group.total_quantity),
      total_cost: roundCurrency(group.total_cost),
      last_delivery_at: group.last_delivery_at,
      deliveries_count: group.delivery_ids.size,
      colors: toUniqueSortedList(Array.from(group.colors)),
      materials: toUniqueSortedList(Array.from(group.materials)),
      measurement_units: toUniqueSortedList(Array.from(group.measurement_units)),
      products: Array.from(group.product_map.values()).sort((left, right) =>
        String(left.product_name || "").localeCompare(
          String(right.product_name || ""),
          "ar",
        ),
      ),
      items: [...group.items].sort((left, right) => {
        const rightTime = new Date(
          right.entry_date || right.created_at || 0,
        ).getTime();
        const leftTime = new Date(left.entry_date || left.created_at || 0).getTime();
        return rightTime - leftTime;
      }),
    }))
    .sort((left, right) => {
      const rightTime = new Date(right.last_delivery_at || 0).getTime();
      const leftTime = new Date(left.last_delivery_at || 0).getTime();
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(left.fabric_name || "").localeCompare(
        String(right.fabric_name || ""),
        "ar",
      );
    });

  return {
    product_catalog: productCatalog,
    fabric_catalog: fabricCatalog,
    products_count: productCatalog.length,
    fabrics_count: fabricCatalog.length,
  };
};

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
  const itemRelations = buildItemRelations(receivedItems);
  const openingBalance = roundCurrency(supplier?.opening_balance);
  const outstandingBalance = roundCurrency(
    openingBalance + totalDeliveries + totalAdjustments - totalPayments,
  );

  return {
    ...itemRelations,
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
        product_catalog: undefined,
        fabric_catalog: undefined,
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

const matchesProductReference = (item = {}, reference = {}) => {
  const productId = normalizeText(item?.product_id);
  if (productId && reference.product_ids.has(productId)) {
    return true;
  }

  const variantId = normalizeText(item?.variant_id);
  if (variantId && reference.variant_ids.has(variantId)) {
    return true;
  }

  const sku = normalizeText(item?.sku).toLowerCase();
  if (sku && reference.skus.has(sku)) {
    return true;
  }

  if (productId || variantId || sku) {
    return false;
  }

  const productName = normalizeText(item?.product_name).toLowerCase();
  return Boolean(productName && productName === reference.product_name);
};

export const buildProductSourcingDetail = (
  product = {},
  suppliers = [],
  entries = [],
) => {
  const reference = {
    product_ids: new Set(
      [product?.id, product?.shopify_id].map(normalizeText).filter(Boolean),
    ),
    variant_ids: new Set(
      (product?.variants || [])
        .map((variant) => normalizeText(variant?.id))
        .filter(Boolean),
    ),
    skus: new Set(
      [product?.sku, ...(product?.variants || []).map((variant) => variant?.sku)]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean),
    ),
    product_name: normalizeText(product?.title).toLowerCase(),
  };
  const supplierMap = new Map(
    (suppliers || []).map((supplier) => [normalizeText(supplier?.id), supplier]),
  );
  const normalizedEntries = (entries || [])
    .map(normalizeEntry)
    .filter((entry) => entry.entry_type === "delivery");
  const matchedItems = [];
  const matchedDeliveries = [];
  const supplierGroups = new Map();

  for (const entry of normalizedEntries) {
    const supplierId = normalizeText(entry?.supplier_id);
    const supplier = supplierMap.get(supplierId) || null;
    const deliveryItems = (entry.items || [])
      .filter((item) => matchesProductReference(item, reference))
      .map((item) => ({
        ...item,
        supplier_id: supplierId || null,
        supplier_name: normalizeText(supplier?.name),
        supplier_code: normalizeText(supplier?.code),
        supplier_phone: normalizeText(supplier?.phone),
        delivery_id: entry.id,
        entry_date: entry.entry_date,
        reference_code: entry.reference_code || "",
        description: entry.description || "",
      }));

    if (deliveryItems.length === 0) {
      continue;
    }

    const deliveryAmount = roundCurrency(
      deliveryItems.reduce((sum, item) => sum + toNumber(item.total_cost), 0),
    );
    matchedDeliveries.push({
      id: entry.id,
      supplier_id: supplierId || null,
      supplier_name: normalizeText(supplier?.name),
      supplier_code: normalizeText(supplier?.code),
      entry_date: entry.entry_date,
      reference_code: entry.reference_code || "",
      description: entry.description || "",
      items_count: deliveryItems.length,
      quantity: roundCurrency(
        deliveryItems.reduce((sum, item) => sum + toNumber(item.quantity), 0),
      ),
      total_cost: deliveryAmount,
      items: deliveryItems,
    });

    for (const item of deliveryItems) {
      matchedItems.push(item);

      const supplierGroupKey =
        supplierId || `supplier:${normalizeText(supplier?.name || item.supplier_name)}`;
      if (!supplierGroups.has(supplierGroupKey)) {
        supplierGroups.set(supplierGroupKey, {
          supplier_id: supplierId || null,
          name: normalizeText(supplier?.name || item.supplier_name),
          code: normalizeText(supplier?.code || item.supplier_code),
          phone: normalizeText(supplier?.phone || item.supplier_phone),
          is_active: supplier?.is_active !== false,
          total_quantity: 0,
          total_cost: 0,
          last_delivery_at: null,
          delivery_ids: new Set(),
          fabrics: new Set(),
          materials: new Set(),
          colors: new Set(),
          variants: new Set(),
          items: [],
        });
      }

      const supplierGroup = supplierGroups.get(supplierGroupKey);
      supplierGroup.total_quantity += toNumber(item.quantity);
      supplierGroup.total_cost = roundCurrency(
        supplierGroup.total_cost + toNumber(item.total_cost),
      );
      supplierGroup.delivery_ids.add(item.delivery_id || supplierGroupKey);
      if (
        item.entry_date &&
        (!supplierGroup.last_delivery_at || item.entry_date > supplierGroup.last_delivery_at)
      ) {
        supplierGroup.last_delivery_at = item.entry_date;
      }
      if (getItemFabricLabel(item)) {
        supplierGroup.fabrics.add(getItemFabricLabel(item));
      }
      if (item.material) {
        supplierGroup.materials.add(item.material);
      }
      if (item.color) {
        supplierGroup.colors.add(item.color);
      }
      if (item.variant_title) {
        supplierGroup.variants.add(item.variant_title);
      }
      supplierGroup.items.push(item);
    }
  }

  const itemRelations = buildItemRelations(matchedItems);
  const supplierList = Array.from(supplierGroups.values())
    .map((group) => ({
      supplier_id: group.supplier_id,
      name: group.name,
      code: group.code,
      phone: group.phone,
      is_active: group.is_active,
      total_quantity: roundCurrency(group.total_quantity),
      total_cost: roundCurrency(group.total_cost),
      last_delivery_at: group.last_delivery_at,
      deliveries_count: group.delivery_ids.size,
      fabrics: toUniqueSortedList(Array.from(group.fabrics)),
      materials: toUniqueSortedList(Array.from(group.materials)),
      colors: toUniqueSortedList(Array.from(group.colors)),
      variants: toUniqueSortedList(Array.from(group.variants)),
      items: [...group.items].sort((left, right) => {
        const rightTime = new Date(
          right.entry_date || right.created_at || 0,
        ).getTime();
        const leftTime = new Date(left.entry_date || left.created_at || 0).getTime();
        return rightTime - leftTime;
      }),
    }))
    .sort((left, right) => {
      const rightTime = new Date(right.last_delivery_at || 0).getTime();
      const leftTime = new Date(left.last_delivery_at || 0).getTime();
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), "ar");
    });
  const deliveries = matchedDeliveries.sort((left, right) => {
    const rightTime = new Date(right.entry_date || 0).getTime();
    const leftTime = new Date(left.entry_date || 0).getTime();
    return rightTime - leftTime;
  });
  const totalQuantity = matchedItems.reduce(
    (sum, item) => sum + toNumber(item.quantity),
    0,
  );
  const totalCost = matchedItems.reduce(
    (sum, item) => sum + toNumber(item.total_cost),
    0,
  );

  return {
    product_id: normalizeText(product?.id) || null,
    product_name: normalizeText(product?.title),
    supplier_count: supplierList.length,
    total_quantity: roundCurrency(totalQuantity),
    total_cost: roundCurrency(totalCost),
    deliveries_count: deliveries.length,
    last_delivery_at: deliveries[0]?.entry_date || null,
    suppliers: supplierList,
    fabrics: itemRelations.fabric_catalog,
    variants: itemRelations.product_catalog,
    deliveries,
  };
};
