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
