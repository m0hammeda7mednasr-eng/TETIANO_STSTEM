const LOCAL_PRODUCT_METADATA_KEY = "_tetiano_local_product";

const hasOwn = (value, key) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);

const normalizeText = (value) => String(value ?? "").trim();

const toPlainObject = (value) => {
  if (!value) return {};

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value) ? value : {};
};

const clonePlainObject = (value) =>
  JSON.parse(JSON.stringify(toPlainObject(value) || {}));

const normalizeLocalFields = (value = {}) => ({
  supplier_phone: normalizeText(value?.supplier_phone),
  supplier_location: normalizeText(value?.supplier_location),
});

const parseNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductVariants = (productData = {}) =>
  Array.isArray(productData?.variants) ? productData.variants : [];

const getVariantKey = (variant = {}, fallbackIndex = 0) =>
  normalizeText(variant?.id || variant?.admin_graphql_api_id || variant?.sku) ||
  `variant-${fallbackIndex}`;

const sumVariantInventory = (variants = []) =>
  variants.reduce(
    (sum, variant) => sum + parseNumeric(variant?.inventory_quantity),
    0,
  );

export const extractProductLocalMetadata = (productData) => {
  const data = toPlainObject(productData);
  const localMetadata = toPlainObject(data?.[LOCAL_PRODUCT_METADATA_KEY]);
  return normalizeLocalFields(localMetadata);
};

export const mergeProductLocalMetadata = (productData, updates = {}) => {
  const nextData = clonePlainObject(productData);
  const currentMetadata = extractProductLocalMetadata(nextData);
  const nextMetadata = { ...currentMetadata };

  if (hasOwn(updates, "supplier_phone")) {
    nextMetadata.supplier_phone = normalizeText(updates.supplier_phone);
  }

  if (hasOwn(updates, "supplier_location")) {
    nextMetadata.supplier_location = normalizeText(updates.supplier_location);
  }

  if (nextMetadata.supplier_phone || nextMetadata.supplier_location) {
    nextData[LOCAL_PRODUCT_METADATA_KEY] = nextMetadata;
  } else {
    delete nextData[LOCAL_PRODUCT_METADATA_KEY];
  }

  return nextData;
};

export const preserveProductLocalMetadata = (incomingData, existingData) =>
  mergeProductLocalMetadata(
    incomingData,
    extractProductLocalMetadata(existingData),
  );

export const zeroProductInventoryData = (productData) => {
  const nextData = clonePlainObject(productData);
  const variants = getProductVariants(nextData);

  if (variants.length > 0) {
    nextData.variants = variants.map((variant) => ({
      ...variant,
      inventory_quantity: 0,
    }));
    nextData.inventory_quantity = 0;
    return nextData;
  }

  nextData.inventory_quantity = 0;
  return nextData;
};

export const preserveProductInventoryData = (incomingData, existingData) => {
  const nextData = clonePlainObject(incomingData);
  const existing = clonePlainObject(existingData);
  const incomingVariants = getProductVariants(nextData);
  const existingVariants = getProductVariants(existing);

  if (incomingVariants.length > 0) {
    const existingVariantsByKey = new Map(
      existingVariants.map((variant, index) => [
        getVariantKey(variant, index),
        variant,
      ]),
    );

    nextData.variants = incomingVariants.map((variant, index) => {
      const key = getVariantKey(variant, index);
      const existingVariant = existingVariantsByKey.get(key);

      return {
        ...variant,
        inventory_quantity: existingVariant
          ? parseNumeric(existingVariant.inventory_quantity)
          : 0,
      };
    });
    nextData.inventory_quantity = sumVariantInventory(nextData.variants);
    return nextData;
  }

  nextData.inventory_quantity = parseNumeric(existing?.inventory_quantity);
  return nextData;
};
