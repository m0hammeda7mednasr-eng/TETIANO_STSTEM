import express from "express";
import { supabase as db } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getAccessibleStoreIds } from "../models/index.js";
import {
  buildMirroredInventoryRow,
  calculateScannedQuantity,
  resolveTrackedWarehouseQuantity,
} from "../helpers/warehouseScan.js";
import { emitRealtimeEvent } from "../services/realtimeEventService.js";
import { ProductUpdateService } from "../services/productUpdateService.js";
import {
  buildWarehouseVariantCatalog,
  normalizeWarehouseCode,
} from "../helpers/warehouseCatalog.js";

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATALOG_CACHE_TTL_MS = 15 * 1000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MOVEMENT_TYPES = new Set(["in", "out"]);
const STOCK_SORT_FIELDS = new Set([
  "title",
  "sku",
  "updated_at",
  "inventory_quantity",
  "warehouse_quantity",
  "shopify_inventory_quantity",
  "stock_difference",
  "last_scanned_at",
  "price",
]);
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const PRODUCT_LOOKUP_SELECT = [
  "id",
  "shopify_id",
  "store_id",
  "title",
  "vendor",
  "product_type",
  "sku",
  "price",
  "inventory_quantity",
  "updated_at",
  "last_synced_at",
  "created_at",
  "data",
].join(",");
const productCatalogCache = new Map();

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isSchemaCompatibilityError = (error) => {
  if (!error) {
    return false;
  }

  if (SCHEMA_ERROR_CODES.has(String(error.code || ""))) {
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

const getRequestedStoreId = (req) => {
  const candidates = [req.headers["x-store-id"], req.body?.store_id, req.query?.store_id];

  for (const value of candidates) {
    const normalized = String(value || "").trim();
    if (UUID_REGEX.test(normalized)) {
      return normalized;
    }
  }

  return null;
};

const resolveIsAdmin = (req) =>
  Boolean(req.user?.isAdmin || String(req.user?.role || "").toLowerCase() === "admin");

const normalizeSku = (value) => normalizeWarehouseCode(value);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInteger = (value, fallback = 1) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getPagination = (query = {}) => {
  const requestedLimit = parseInt(query.limit, 10);
  const requestedOffset = parseInt(query.offset, 10);

  return {
    limit:
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT,
    offset:
      Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0,
  };
};

const getSortOptions = (query = {}) => {
  const rawField = String(query.sort_by || "").trim().toLowerCase();
  const rawDirection = String(query.sort_dir || "asc").trim().toLowerCase();

  return {
    sortBy: STOCK_SORT_FIELDS.has(rawField) ? rawField : "title",
    ascending: rawDirection !== "desc",
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

const buildWarehouseSetupResponse = ({ limit, offset, storeId, message }) => ({
  ...buildPaginatedCollection([], { limit, offset }),
  store_id: storeId || null,
  generated_at: new Date().toISOString(),
  schema_ready: false,
  setup_required: true,
  message,
});

const getFreshProductCatalog = (storeId) => {
  const cacheKey = String(storeId || "").trim();
  if (!cacheKey) {
    return null;
  }

  const entry = productCatalogCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.updatedAt > CATALOG_CACHE_TTL_MS) {
    productCatalogCache.delete(cacheKey);
    return null;
  }

  return entry.value;
};

const rememberProductCatalog = (storeId, value) => {
  const cacheKey = String(storeId || "").trim();
  if (!cacheKey) {
    return;
  }

  productCatalogCache.set(cacheKey, {
    updatedAt: Date.now(),
    value,
  });
};

const clearProductCatalog = (storeId) => {
  const cacheKey = String(storeId || "").trim();
  if (!cacheKey) {
    return;
  }

  productCatalogCache.delete(cacheKey);
};

const getAdminStoreIds = async () => {
  const strategies = [
    async () => {
      const { data, error } = await db.from("stores").select("id");
      if (error) {
        throw error;
      }
      return (data || []).map((row) => String(row?.id || "").trim()).filter(Boolean);
    },
    async () => {
      const { data, error } = await db
        .from("products")
        .select("store_id")
        .not("store_id", "is", null)
        .limit(200);
      if (error) {
        throw error;
      }
      return Array.from(
        new Set(
          (data || []).map((row) => String(row?.store_id || "").trim()).filter(Boolean),
        ),
      );
    },
  ];

  for (const strategy of strategies) {
    try {
      const storeIds = await strategy();
      if (storeIds.length > 0) {
        return storeIds;
      }
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
    }
  }

  return [];
};

const resolveStoreContext = async (req) => {
  const requestedStoreId = getRequestedStoreId(req);
  const isAdmin = resolveIsAdmin(req);

  if (isAdmin) {
    if (requestedStoreId) {
      return {
        isAdmin,
        storeId: requestedStoreId,
        accessibleStoreIds: [],
      };
    }

    const adminStoreIds = await getAdminStoreIds();
    if (adminStoreIds.length === 1) {
      return {
        isAdmin,
        storeId: adminStoreIds[0],
        accessibleStoreIds: adminStoreIds,
      };
    }

    if (adminStoreIds.length === 0) {
      throw createHttpError(400, "No connected store is available yet");
    }

    throw createHttpError(400, "Select a store first before using warehouse tools");
  }

  const accessibleStoreIds = await getAccessibleStoreIds(req.user?.id);

  if (requestedStoreId) {
    if (
      accessibleStoreIds.length === 0 ||
      !accessibleStoreIds.includes(requestedStoreId)
    ) {
      throw createHttpError(403, "Access denied for the selected store");
    }

    return {
      isAdmin,
      storeId: requestedStoreId,
      accessibleStoreIds,
    };
  }

  if (accessibleStoreIds.length === 1) {
    return {
      isAdmin,
      storeId: accessibleStoreIds[0],
      accessibleStoreIds,
    };
  }

  if (accessibleStoreIds.length === 0) {
    throw createHttpError(400, "No store is connected to this account yet");
  }

  throw createHttpError(400, "Select a store first before using warehouse tools");
};

const loadAllStoreProducts = async (storeId) => {
  const rows = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from("products")
      .select(PRODUCT_LOOKUP_SELECT)
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows;
};

const getWarehouseProductCatalog = async (storeId) => {
  const cached = getFreshProductCatalog(storeId);
  if (cached) {
    return cached;
  }

  const products = await loadAllStoreProducts(storeId);
  const catalog = buildWarehouseVariantCatalog(products);
  rememberProductCatalog(storeId, catalog);
  return catalog;
};

const getInventoryRowsForStore = async (storeId) => {
  const { data, error } = await db
    .from("warehouse_inventory")
    .select(
      "id, store_id, product_id, sku, quantity, last_scanned_at, last_movement_type, last_movement_quantity, created_at, updated_at",
    )
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  return data || [];
};

const mapInventoryRowsByCode = (rows = []) =>
  new Map(
    (rows || [])
      .filter((row) => normalizeSku(row?.sku))
      .map((row) => [normalizeSku(row?.sku), row]),
  );

const serializeWarehouseVariantRow = (variantRow, inventoryRow) => {
  const warehouseQuantity = toNumber(inventoryRow?.quantity);
  const shopifyQuantity = toNumber(variantRow?.shopify_inventory_quantity);
  const difference = warehouseQuantity - shopifyQuantity;

  return {
    id: variantRow?.key || variantRow?.id || inventoryRow?.id || null,
    product_id: variantRow?.product_id || inventoryRow?.product_id || null,
    variant_id: variantRow?.variant_id || null,
    shopify_id: variantRow?.shopify_id || null,
    store_id: variantRow?.store_id || inventoryRow?.store_id || null,
    title: variantRow?.title || "Archived product",
    product_title: variantRow?.product_title || variantRow?.title || "Archived product",
    variant_title: variantRow?.variant_title || "Archived Variant",
    display_title:
      variantRow?.display_title ||
      variantRow?.title ||
      `Archived code ${inventoryRow?.sku || ""}`.trim(),
    vendor: variantRow?.vendor || "",
    product_type: variantRow?.product_type || "",
    warehouse_code:
      variantRow?.warehouse_code || normalizeSku(variantRow?.sku || inventoryRow?.sku),
    warehouse_code_source: variantRow?.warehouse_code_source || "legacy",
    sku: variantRow?.sku || inventoryRow?.sku || "",
    normalized_sku:
      variantRow?.normalized_sku || normalizeSku(variantRow?.sku || inventoryRow?.sku),
    barcode: variantRow?.barcode || "",
    normalized_barcode:
      variantRow?.normalized_barcode || normalizeSku(variantRow?.barcode),
    barcode_or_sku:
      variantRow?.barcode_or_sku ||
      variantRow?.sku ||
      variantRow?.barcode ||
      inventoryRow?.sku ||
      "",
    barcode_or_sku_label: variantRow?.barcode_or_sku_label || "Code",
    image_url: variantRow?.image_url || "",
    option_values: Array.isArray(variantRow?.option_values)
      ? variantRow.option_values
      : [],
    price: variantRow?.price ?? null,
    shopify_inventory_quantity: shopifyQuantity,
    warehouse_quantity: warehouseQuantity,
    stock_difference: difference,
    stock_state:
      difference === 0
        ? "matched"
        : difference > 0
          ? "warehouse_higher"
          : "shopify_higher",
    has_multiple_variants: Boolean(variantRow?.has_multiple_variants),
    variants_count: toNumber(variantRow?.variants_count),
    is_archived: Boolean(variantRow?.is_archived),
    is_scannable:
      variantRow?.is_scannable !== undefined
        ? Boolean(variantRow.is_scannable)
        : Boolean(variantRow?.warehouse_code || inventoryRow?.sku),
    last_scanned_at: inventoryRow?.last_scanned_at || null,
    last_movement_type: inventoryRow?.last_movement_type || null,
    last_movement_quantity: toNumber(inventoryRow?.last_movement_quantity),
    last_synced_at: variantRow?.last_synced_at || null,
    created_at: variantRow?.created_at || inventoryRow?.created_at || null,
    updated_at:
      inventoryRow?.updated_at || variantRow?.updated_at || variantRow?.created_at || null,
  };
};

const buildOrphanWarehouseRow = (inventoryRow) =>
  serializeWarehouseVariantRow(
    {
      key: inventoryRow?.id || normalizeSku(inventoryRow?.sku),
      id: normalizeSku(inventoryRow?.sku),
      product_id: inventoryRow?.product_id || null,
      store_id: inventoryRow?.store_id || null,
      title: "Archived product",
      product_title: "Archived product",
      variant_title: "Unknown Variant",
      display_title: `Archived code ${inventoryRow?.sku || ""}`.trim(),
      is_archived: true,
      warehouse_code: normalizeSku(inventoryRow?.sku),
      warehouse_code_source: "legacy",
      sku: inventoryRow?.sku || "",
      normalized_sku: normalizeSku(inventoryRow?.sku),
      barcode_or_sku: inventoryRow?.sku || "",
      barcode_or_sku_label: "Legacy code",
      shopify_inventory_quantity: 0,
      price: null,
      is_scannable: Boolean(inventoryRow?.sku),
      has_multiple_variants: false,
      variants_count: 0,
      option_values: [],
      last_synced_at: null,
      created_at: inventoryRow?.created_at || null,
      updated_at: inventoryRow?.updated_at || null,
    },
    inventoryRow,
  );

const sortWarehouseRows = (rows, { sortBy, ascending }) => {
  const direction = ascending ? 1 : -1;
  const sortedRows = [...(rows || [])];

  sortedRows.sort((left, right) => {
    let leftValue;
    let rightValue;

    switch (sortBy) {
      case "sku":
        leftValue = left?.warehouse_code || left?.normalized_sku || "";
        rightValue = right?.warehouse_code || right?.normalized_sku || "";
        break;
      case "price":
        leftValue = toNumber(left?.price);
        rightValue = toNumber(right?.price);
        break;
      case "inventory_quantity":
      case "shopify_inventory_quantity":
        leftValue = toNumber(left?.shopify_inventory_quantity);
        rightValue = toNumber(right?.shopify_inventory_quantity);
        break;
      case "warehouse_quantity":
        leftValue = toNumber(left?.warehouse_quantity);
        rightValue = toNumber(right?.warehouse_quantity);
        break;
      case "stock_difference":
        leftValue = toNumber(left?.stock_difference);
        rightValue = toNumber(right?.stock_difference);
        break;
      case "last_scanned_at":
        leftValue = new Date(left?.last_scanned_at || 0).getTime() || 0;
        rightValue = new Date(right?.last_scanned_at || 0).getTime() || 0;
        break;
      case "updated_at":
        leftValue = new Date(left?.updated_at || 0).getTime() || 0;
        rightValue = new Date(right?.updated_at || 0).getTime() || 0;
        break;
      case "title":
      default:
        leftValue = String(left?.display_title || left?.title || "").toLowerCase();
        rightValue = String(right?.display_title || right?.title || "").toLowerCase();
        break;
    }

    if (leftValue < rightValue) {
      return -1 * direction;
    }
    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return String(left?.warehouse_code || left?.normalized_sku || "").localeCompare(
      String(right?.warehouse_code || right?.normalized_sku || ""),
    );
  });

  return sortedRows;
};

const findCatalogVariantByScanCode = async ({ storeId, scanCode }) => {
  const normalizedCode = normalizeSku(scanCode);
  if (!normalizedCode) {
    return null;
  }

  const catalog = await getWarehouseProductCatalog(storeId);

  if (catalog.duplicateScanCodes.has(normalizedCode)) {
    throw createHttpError(
      409,
      `More than one variant matches code ${normalizedCode}. SKU or barcode must be unique per store.`,
    );
  }

  return catalog.rowsByAnyCode.get(normalizedCode) || null;
};

const isMissingVariantInventoryError = (error) => {
  const message = String(error?.message || "");
  return (
    message === "No variants found for this product." ||
    (message.startsWith("Variant ") &&
      message.endsWith(" was not found for this product."))
  );
};

const syncScannedProductInventory = async ({
  userId,
  storeId,
  product,
  movementType,
  quantity,
}) => {
  const currentProductQuantity = toNumber(product?.shopify_inventory_quantity);
  const nextProductQuantity = calculateScannedQuantity({
    currentQuantity: currentProductQuantity,
    movementType,
    quantity,
  });

  if (nextProductQuantity < 0) {
    throw createHttpError(
      400,
      `Cannot scan out ${quantity}. Available product stock for ${product.warehouse_code} is ${currentProductQuantity}.`,
    );
  }

  if (!product?.product_id) {
    throw createHttpError(400, "Matched product is missing a local product id");
  }

  try {
    if (product?.variant_id) {
      await ProductUpdateService.updateProduct(userId, product.product_id, {
        variant_updates: [
          {
            id: product.variant_id,
            inventory_quantity: nextProductQuantity,
          },
        ],
      });
    } else {
      await ProductUpdateService.updateProduct(userId, product.product_id, {
        inventory: nextProductQuantity,
      });
    }
  } catch (error) {
    if (!product?.variant_id || !isMissingVariantInventoryError(error)) {
      throw error;
    }

    await ProductUpdateService.updateProduct(userId, product.product_id, {
      inventory: nextProductQuantity,
    });
  }

  clearProductCatalog(storeId);

  const refreshedProduct =
    (await findCatalogVariantByScanCode({
      storeId,
      scanCode: product.warehouse_code,
    })) || {
      ...product,
      shopify_inventory_quantity: nextProductQuantity,
      updated_at: new Date().toISOString(),
    };

  return {
    currentProductQuantity,
    nextProductQuantity,
    refreshedProduct,
  };
};

const persistWarehouseTracking = async ({
  storeId,
  userId,
  product,
  movementType,
  quantity,
  scanCode,
  note,
  nowIso,
  nextProductQuantity,
}) => {
  const fallbackScanEvent = {
    id: null,
    store_id: storeId,
    sku: product.warehouse_code,
    product_id: product.product_id,
    user_id: userId || null,
    movement_type: movementType,
    quantity,
    scan_code: scanCode,
    note: note || null,
    created_at: nowIso,
  };

  try {
    const { data: existingInventory, error: inventoryLookupError } = await db
      .from("warehouse_inventory")
      .select(
        "id, store_id, product_id, sku, quantity, last_scanned_at, last_movement_type, last_movement_quantity",
      )
      .eq("store_id", storeId)
      .eq("sku", product.warehouse_code)
      .maybeSingle();

    if (inventoryLookupError && inventoryLookupError.code !== "PGRST116") {
      throw inventoryLookupError;
    }

    const currentWarehouseQuantity = toNumber(existingInventory?.quantity);
    const nextWarehouseQuantity = resolveTrackedWarehouseQuantity({
      currentWarehouseQuantity,
      movementType,
      quantity,
      fallbackQuantity: nextProductQuantity,
    });

    const inventoryPayload = {
      store_id: storeId,
      product_id: product.product_id,
      sku: product.warehouse_code,
      quantity: nextWarehouseQuantity,
      last_scanned_at: nowIso,
      last_movement_type: movementType,
      last_movement_quantity: quantity,
      updated_at: nowIso,
    };

    let savedInventory;
    if (existingInventory?.id) {
      const { data, error } = await db
        .from("warehouse_inventory")
        .update(inventoryPayload)
        .eq("id", existingInventory.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      savedInventory = data;
    } else {
      const { data, error } = await db
        .from("warehouse_inventory")
        .insert({
          ...inventoryPayload,
          created_at: nowIso,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      savedInventory = data;
    }

    const { data: scanEvent, error: scanEventError } = await db
      .from("warehouse_scan_events")
      .insert({
        store_id: storeId,
        sku: product.warehouse_code,
        product_id: product.product_id,
        user_id: userId || null,
        movement_type: movementType,
        quantity,
        scan_code: scanCode,
        note: note || null,
        created_at: nowIso,
      })
      .select(
        "id, store_id, sku, product_id, user_id, movement_type, quantity, scan_code, note, created_at",
      )
      .single();

    if (scanEventError) {
      throw scanEventError;
    }

    return {
      savedInventory,
      scanEvent,
      trackingMode: "warehouse_and_product",
      warehouseTrackingSaved: true,
      nextWarehouseQuantity,
    };
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      console.warn(
        "Warehouse tracking save failed after product inventory update:",
        error.message,
      );
    }

    return {
      savedInventory: null,
      scanEvent: fallbackScanEvent,
      trackingMode: "product_inventory_only",
      warehouseTrackingSaved: false,
      nextWarehouseQuantity: nextProductQuantity,
    };
  }
};

const serializeScanProduct = (product) => ({
  id: product?.product_id || product?.id || null,
  product_id: product?.product_id || product?.id || null,
  variant_id: product?.variant_id || null,
  title: product?.title || "",
  product_title: product?.product_title || product?.title || "",
  variant_title: product?.variant_title || "",
  display_title: product?.display_title || product?.title || "",
  warehouse_code: product?.warehouse_code || product?.sku || "",
  warehouse_code_source: product?.warehouse_code_source || "legacy",
  sku: product?.sku || "",
  vendor: product?.vendor || "",
  price: product?.price ?? null,
  barcode: product?.barcode || "",
  image_url: product?.image_url || "",
  option_values: Array.isArray(product?.option_values) ? product.option_values : [],
});

const enrichScanEvent = (scan, catalog) => {
  const normalizedCode = normalizeSku(scan?.sku || scan?.scan_code);
  const variantRow = normalizedCode ? catalog.rowsByAnyCode.get(normalizedCode) : null;
  const fallbackProduct = scan?.product || {};

  return {
    ...scan,
    product: {
      id: variantRow?.product_id || fallbackProduct?.id || scan?.product_id || null,
      product_id: variantRow?.product_id || fallbackProduct?.id || scan?.product_id || null,
      variant_id: variantRow?.variant_id || null,
      title: variantRow?.title || fallbackProduct?.title || "Archived product",
      product_title:
        variantRow?.product_title || fallbackProduct?.title || "Archived product",
      variant_title: variantRow?.variant_title || "Unknown Variant",
      display_title:
        variantRow?.display_title || fallbackProduct?.title || scan?.sku || scan?.scan_code || "-",
      warehouse_code: variantRow?.warehouse_code || normalizedCode || "",
      warehouse_code_source: variantRow?.warehouse_code_source || "legacy",
      sku: variantRow?.sku || fallbackProduct?.sku || scan?.sku || "-",
      normalized_sku: variantRow?.normalized_sku || normalizeSku(variantRow?.sku),
      vendor: variantRow?.vendor || fallbackProduct?.vendor || "",
      image_url: variantRow?.image_url || "",
      barcode: variantRow?.barcode || "",
      option_values: Array.isArray(variantRow?.option_values)
        ? variantRow.option_values
        : [],
    },
  };
};

const writeActivityLog = async ({
  userId,
  product,
  movementType,
  quantity,
  storeId,
  scanCode,
  note,
  nextWarehouseQuantity,
  nextProductQuantity,
  trackingMode,
}) => {
  try {
    const { error } = await db.from("activity_log").insert({
      user_id: userId,
      action: movementType === "in" ? "warehouse_scan_in" : "warehouse_scan_out",
      entity_type: "warehouse_variant",
      entity_id: product?.variant_id || product?.product_id || product?.id || null,
      entity_name:
        product?.display_title || product?.title || product?.sku || scanCode,
      details: {
        sku: product?.warehouse_code || product?.sku || scanCode,
        normalized_sku: normalizeSku(product?.warehouse_code || scanCode),
        product_id: product?.product_id || product?.id || null,
        variant_id: product?.variant_id || null,
        movement_type: movementType,
        quantity,
        store_id: storeId,
        warehouse_quantity_after: nextWarehouseQuantity,
        product_inventory_after: nextProductQuantity,
        tracking_mode: trackingMode,
        note: note || null,
      },
    });

    if (error && !isSchemaCompatibilityError(error)) {
      console.warn("Failed to write warehouse activity log:", error.message);
    }
  } catch (error) {
    console.warn("Warehouse activity log exception:", error.message);
  }
};

router.use(authenticateToken);

router.get("/stock", requirePermission("can_view_products"), async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const pagination = getPagination(req.query);
    const sortOptions = getSortOptions(req.query);

    const catalog = await getWarehouseProductCatalog(storeId);
    let inventoryRows = [];
    let warehouseTablesReady = true;

    try {
      inventoryRows = await getInventoryRowsForStore(storeId);
    } catch (inventoryError) {
      if (!isSchemaCompatibilityError(inventoryError)) {
        throw inventoryError;
      }

      warehouseTablesReady = false;
    }

    const inventoryByCode = mapInventoryRowsByCode(inventoryRows);
    const catalogRows = catalog.rows.map((variantRow) =>
      serializeWarehouseVariantRow(
        variantRow,
        warehouseTablesReady
          ? inventoryByCode.get(variantRow.warehouse_code)
          : buildMirroredInventoryRow({
              product: variantRow,
              quantity: variantRow.shopify_inventory_quantity,
            }),
      ),
    );
    const orphanRows = warehouseTablesReady
      ? inventoryRows
          .filter(
            (inventoryRow) =>
              !catalog.rowsByPrimaryCode.has(normalizeSku(inventoryRow?.sku)),
          )
          .map((inventoryRow) => buildOrphanWarehouseRow(inventoryRow))
      : [];
    const sortedRows = sortWarehouseRows(
      [...catalogRows, ...orphanRows],
      sortOptions,
    );
    const rows = sortedRows.slice(
      pagination.offset,
      pagination.offset + pagination.limit,
    );

    res.json({
      ...buildPaginatedCollection(rows, pagination),
      store_id: storeId,
      generated_at: new Date().toISOString(),
      schema_ready: warehouseTablesReady,
      setup_required: !warehouseTablesReady,
      tracking_mode: warehouseTablesReady
        ? "warehouse_and_product"
        : "product_inventory_only",
      message: warehouseTablesReady
        ? null
        : "Warehouse tables are not deployed yet. Showing live product inventory instead.",
    });
  } catch (error) {
    console.error("Error fetching warehouse stock:", error);

    if (isSchemaCompatibilityError(error)) {
      return res.json(
        buildWarehouseSetupResponse({
          limit: getPagination(req.query).limit,
          offset: getPagination(req.query).offset,
          storeId: getRequestedStoreId(req),
          message: "Warehouse tables are not deployed yet",
        }),
      );
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch warehouse stock",
    });
  }
});

router.get("/scans", requirePermission("can_view_products"), async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const pagination = getPagination(req.query);
    const catalog = await getWarehouseProductCatalog(storeId);

    const { data, error } = await db
      .from("warehouse_scan_events")
      .select(
        "id, store_id, sku, product_id, user_id, movement_type, quantity, scan_code, note, created_at, product:products(id, title, sku, vendor), user:users(id, name, email)",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);

    if (error) {
      throw error;
    }

    const rows = (data || []).map((scan) => enrichScanEvent(scan, catalog));

    res.json({
      ...buildPaginatedCollection(rows, pagination),
      store_id: storeId,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching warehouse scans:", error);

    if (isSchemaCompatibilityError(error)) {
      const pagination = getPagination(req.query);
      const requestedStoreId = getRequestedStoreId(req);

      return res.json({
        ...buildPaginatedCollection([], pagination),
        store_id: requestedStoreId,
        generated_at: new Date().toISOString(),
        schema_ready: false,
        setup_required: true,
        tracking_mode: "product_inventory_only",
        message:
          "Warehouse scan history is not available yet. Scanner actions still update live product stock.",
      });
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch warehouse scan history",
    });
  }
});

router.post("/scan", requirePermission("can_edit_products"), async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const movementType = String(req.body?.movement_type || "").trim().toLowerCase();
    const quantity = toPositiveInteger(req.body?.quantity, 1);
    const scanCode = String(req.body?.code || req.body?.sku || "").trim();
    const normalizedScanCode = normalizeSku(scanCode);
    const note = String(req.body?.note || "").trim();

    if (!normalizedScanCode) {
      throw createHttpError(400, "Scan code is required");
    }

    if (!MOVEMENT_TYPES.has(movementType)) {
      throw createHttpError(400, "movement_type must be either in or out");
    }

    const product = await findCatalogVariantByScanCode({
      storeId,
      scanCode: normalizedScanCode,
    });

    if (!product) {
      throw createHttpError(
        404,
        `No product was found for code ${normalizedScanCode} in the selected store`,
      );
    }

    const nowIso = new Date().toISOString();
    const {
      nextProductQuantity,
      refreshedProduct,
    } = await syncScannedProductInventory({
      userId: req.user?.id,
      storeId,
      product,
      movementType,
      quantity,
    });
    const trackingResult = await persistWarehouseTracking({
      storeId,
      userId: req.user?.id,
      product: refreshedProduct,
      movementType,
      quantity,
      scanCode,
      note,
      nowIso,
      nextProductQuantity,
    });
    const inventorySnapshot = serializeWarehouseVariantRow(
      refreshedProduct,
      trackingResult.savedInventory ||
        buildMirroredInventoryRow({
          product: refreshedProduct,
          quantity: nextProductQuantity,
          scannedAt: nowIso,
          movementType,
          movementQuantity: quantity,
          createdAt: nowIso,
          updatedAt: nowIso,
        }),
    );

    await writeActivityLog({
      userId: req.user?.id,
      product: refreshedProduct,
      movementType,
      quantity,
      storeId,
      scanCode,
      note,
      nextWarehouseQuantity: trackingResult.nextWarehouseQuantity,
      nextProductQuantity,
      trackingMode: trackingResult.trackingMode,
    });

    emitRealtimeEvent({
      type: "warehouse.updated",
      source: "/api/warehouse/scan",
      userIds: [String(req.user?.id || "").trim()].filter(Boolean),
      storeIds: [storeId],
      payload: {
        resource: "warehouse",
        context: "scanner",
        sku: refreshedProduct.warehouse_code,
        movement_type: movementType,
        quantity,
      },
    });

    res.status(201).json({
      message:
        movementType === "in"
          ? `Stock increased for code ${refreshedProduct.warehouse_code}`
          : `Stock decreased for code ${refreshedProduct.warehouse_code}`,
      tracking_mode: trackingResult.trackingMode,
      warehouse_tracking_saved: trackingResult.warehouseTrackingSaved,
      product: serializeScanProduct(refreshedProduct),
      inventory: inventorySnapshot,
      scan: trackingResult.scanEvent,
    });
  } catch (error) {
    console.error("Error applying warehouse scan:", error);

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to save warehouse scan",
    });
  }
});

export default router;
