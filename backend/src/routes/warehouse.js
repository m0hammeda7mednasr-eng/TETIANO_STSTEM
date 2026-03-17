import express from "express";
import { supabase as db } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getAccessibleStoreIds } from "../models/index.js";
import { emitRealtimeEvent } from "../services/realtimeEventService.js";

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MOVEMENT_TYPES = new Set(["in", "out"]);
const STOCK_SORT_FIELDS = new Set([
  "title",
  "updated_at",
  "inventory_quantity",
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
].join(",");

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

const normalizeSku = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

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

const mapInventoryRowsByProductId = (rows = []) =>
  new Map(
    (rows || [])
      .filter((row) => row?.product_id)
      .map((row) => [String(row.product_id), row]),
  );

const serializeWarehouseProductRow = (product, inventoryRow) => {
  const warehouseQuantity = toNumber(inventoryRow?.quantity);
  const shopifyQuantity = toNumber(product?.inventory_quantity);
  const difference = warehouseQuantity - shopifyQuantity;

  return {
    id: product?.id || null,
    shopify_id: product?.shopify_id || null,
    store_id: product?.store_id || null,
    title: product?.title || "Untitled product",
    vendor: product?.vendor || "",
    product_type: product?.product_type || "",
    sku: product?.sku || "",
    normalized_sku: normalizeSku(product?.sku),
    price: product?.price ?? null,
    shopify_inventory_quantity: shopifyQuantity,
    warehouse_quantity: warehouseQuantity,
    stock_difference: difference,
    stock_state: difference === 0 ? "matched" : difference > 0 ? "warehouse_higher" : "shopify_higher",
    last_scanned_at: inventoryRow?.last_scanned_at || null,
    last_movement_type: inventoryRow?.last_movement_type || null,
    last_movement_quantity: toNumber(inventoryRow?.last_movement_quantity),
    last_synced_at: product?.last_synced_at || null,
    created_at: product?.created_at || null,
    updated_at: product?.updated_at || null,
  };
};

const getProductsPage = async ({ storeId, pagination, sortOptions }) => {
  let query = db
    .from("products")
    .select(PRODUCT_LOOKUP_SELECT)
    .eq("store_id", storeId)
    .not("sku", "is", null)
    .neq("sku", "")
    .order(sortOptions.sortBy, { ascending: sortOptions.ascending })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []).filter((product) => normalizeSku(product?.sku));
};

const getInventoryRowsForProducts = async (storeId, productIds = []) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from("warehouse_inventory")
    .select(
      "id, product_id, quantity, last_scanned_at, last_movement_type, last_movement_quantity, updated_at",
    )
    .eq("store_id", storeId)
    .in("product_id", productIds);

  if (error) {
    throw error;
  }

  return data || [];
};

const findProductBySku = async ({ storeId, scanCode }) => {
  const normalizedSku = normalizeSku(scanCode);
  const lookupValues = Array.from(
    new Set(
      [String(scanCode || "").trim(), normalizedSku].filter(Boolean),
    ),
  );

  let matchedRows = [];
  for (const lookupValue of lookupValues) {
    const exactResult = await db
      .from("products")
      .select(PRODUCT_LOOKUP_SELECT)
      .eq("store_id", storeId)
      .eq("sku", lookupValue)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (exactResult.error) {
      throw exactResult.error;
    }

    const exactMatches = (exactResult.data || []).filter(
      (row) => normalizeSku(row?.sku) === normalizedSku,
    );
    if (exactMatches.length > 0) {
      matchedRows = exactMatches;
      break;
    }

    const ilikeResult = await db
      .from("products")
      .select(PRODUCT_LOOKUP_SELECT)
      .eq("store_id", storeId)
      .ilike("sku", lookupValue)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (ilikeResult.error) {
      throw ilikeResult.error;
    }

    const ilikeMatches = (ilikeResult.data || []).filter(
      (row) => normalizeSku(row?.sku) === normalizedSku,
    );
    if (ilikeMatches.length > 0) {
      matchedRows = ilikeMatches;
      break;
    }
  }

  if (matchedRows.length === 0) {
    return null;
  }

  if (matchedRows.length > 1) {
    throw createHttpError(
      409,
      `More than one product uses SKU ${normalizedSku}. SKU must be unique per store.`,
    );
  }

  return matchedRows[0];
};

const writeActivityLog = async ({
  userId,
  product,
  movementType,
  quantity,
  storeId,
  scanCode,
  note,
  nextQuantity,
}) => {
  try {
    const { error } = await db.from("activity_log").insert({
      user_id: userId,
      action: movementType === "in" ? "warehouse_scan_in" : "warehouse_scan_out",
      entity_type: "warehouse_product",
      entity_id: product?.id || null,
      entity_name: product?.title || product?.sku || scanCode,
      details: {
        sku: product?.sku || scanCode,
        normalized_sku: normalizeSku(scanCode),
        movement_type: movementType,
        quantity,
        store_id: storeId,
        warehouse_quantity_after: nextQuantity,
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

router.use(authenticateToken, requirePermission("can_view_products"));

router.get("/stock", async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const pagination = getPagination(req.query);
    const sortOptions = getSortOptions(req.query);

    const products = await getProductsPage({
      storeId,
      pagination,
      sortOptions,
    });

    const inventoryRows = await getInventoryRowsForProducts(
      storeId,
      products.map((product) => product.id).filter(Boolean),
    );
    const inventoryByProductId = mapInventoryRowsByProductId(inventoryRows);
    const rows = products.map((product) =>
      serializeWarehouseProductRow(
        product,
        inventoryByProductId.get(String(product.id)),
      ),
    );

    res.json({
      ...buildPaginatedCollection(rows, pagination),
      store_id: storeId,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching warehouse stock:", error);

    if (isSchemaCompatibilityError(error)) {
      return res.status(503).json({
        error: "Warehouse tables are not deployed yet",
      });
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch warehouse stock",
    });
  }
});

router.get("/scans", async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const pagination = getPagination(req.query);

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

    res.json({
      ...buildPaginatedCollection(data || [], pagination),
      store_id: storeId,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching warehouse scans:", error);

    if (isSchemaCompatibilityError(error)) {
      return res.status(503).json({
        error: "Warehouse tables are not deployed yet",
      });
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to fetch warehouse scan history",
    });
  }
});

router.post("/scan", async (req, res) => {
  try {
    const { storeId } = await resolveStoreContext(req);
    const movementType = String(req.body?.movement_type || "").trim().toLowerCase();
    const quantity = toPositiveInteger(req.body?.quantity, 1);
    const scanCode = String(req.body?.code || req.body?.sku || "").trim();
    const normalizedSku = normalizeSku(scanCode);
    const note = String(req.body?.note || "").trim();

    if (!normalizedSku) {
      throw createHttpError(400, "SKU code is required");
    }

    if (!MOVEMENT_TYPES.has(movementType)) {
      throw createHttpError(400, "movement_type must be either in or out");
    }

    const product = await findProductBySku({
      storeId,
      scanCode: normalizedSku,
    });

    if (!product) {
      throw createHttpError(
        404,
        `No product was found for SKU ${normalizedSku} in the selected store`,
      );
    }

    const { data: existingInventory, error: inventoryLookupError } = await db
      .from("warehouse_inventory")
      .select(
        "id, store_id, product_id, sku, quantity, last_scanned_at, last_movement_type, last_movement_quantity",
      )
      .eq("store_id", storeId)
      .eq("sku", normalizedSku)
      .maybeSingle();

    if (inventoryLookupError && inventoryLookupError.code !== "PGRST116") {
      throw inventoryLookupError;
    }

    const currentQuantity = toNumber(existingInventory?.quantity);
    const nextQuantity =
      movementType === "in" ? currentQuantity + quantity : currentQuantity - quantity;

    if (nextQuantity < 0) {
      throw createHttpError(
        400,
        `Cannot scan out ${quantity}. Available warehouse quantity for ${normalizedSku} is ${currentQuantity}.`,
      );
    }

    const nowIso = new Date().toISOString();
    const inventoryPayload = {
      store_id: storeId,
      product_id: product.id,
      sku: normalizedSku,
      quantity: nextQuantity,
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
        sku: normalizedSku,
        product_id: product.id,
        user_id: req.user?.id || null,
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

    await writeActivityLog({
      userId: req.user?.id,
      product,
      movementType,
      quantity,
      storeId,
      scanCode,
      note,
      nextQuantity,
    });

    emitRealtimeEvent({
      type: "warehouse.updated",
      source: "/api/warehouse/scan",
      userIds: [String(req.user?.id || "").trim()].filter(Boolean),
      storeIds: [storeId],
      payload: {
        resource: "warehouse",
        context: "scanner",
        sku: normalizedSku,
        movement_type: movementType,
        quantity,
      },
    });

    res.status(201).json({
      message:
        movementType === "in"
          ? `Warehouse stock increased for SKU ${normalizedSku}`
          : `Warehouse stock decreased for SKU ${normalizedSku}`,
      product: {
        id: product.id,
        title: product.title,
        sku: product.sku,
        vendor: product.vendor,
        price: product.price,
      },
      inventory: serializeWarehouseProductRow(product, savedInventory),
      scan: scanEvent,
    });
  } catch (error) {
    console.error("Error applying warehouse scan:", error);

    if (isSchemaCompatibilityError(error)) {
      return res.status(503).json({
        error: "Warehouse tables are not deployed yet",
      });
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Failed to save warehouse scan",
    });
  }
});

export default router;
