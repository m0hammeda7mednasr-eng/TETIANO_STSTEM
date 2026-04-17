#!/usr/bin/env node

/**
 * Targeted migration from an old Supabase project to the current project.
 *
 * Copies only local/business data that Shopify sync will not recreate:
 * shipping issue notes, product cost fields, product local metadata,
 * warehouse stock, and warehouse scan history.
 *
 * Safe by default: it runs as a dry run unless MIGRATE_APPLY=true is set.
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  extractOrderLocalMetadata,
  mergeOrderLocalMetadata,
} from "../src/helpers/orderLocalMetadata.js";
import {
  extractProductLocalMetadata,
  mergeProductLocalMetadata,
} from "../src/helpers/productLocalMetadata.js";
import {
  buildWarehouseVariantCatalog,
  normalizeWarehouseCode,
  parseWarehouseJsonField,
} from "../src/helpers/warehouseCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 200;
const TABLE_MISSING_CODES = new Set(["42P01", "PGRST106", "PGRST205"]);

const nowIso = () => new Date().toISOString();
const text = (value) => String(value ?? "").trim();
const parseJson = (value) => parseWarehouseJsonField(value);
const stable = (value) => JSON.stringify(value ?? null);
const sku = (value) => normalizeWarehouseCode(value);

const truthy = (value) =>
  value === true ||
  value === 1 ||
  ["1", "true", "yes", "on"].includes(text(value).toLowerCase());

const falsey = (value) =>
  value === false ||
  value === 0 ||
  ["0", "false", "no", "off"].includes(text(value).toLowerCase());

const env = (...names) => {
  for (const name of names) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  return "";
};

const numberOrNull = (value, { allowZero = true } = {}) => {
  if (value === null || value === undefined || text(value) === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!allowZero && parsed === 0) return null;
  return parsed;
};

const firstNumber = (row, fields, options = {}) => {
  for (const field of fields) {
    const value = numberOrNull(row?.[field], options);
    if (value !== null) return value;
  }
  return null;
};

const firstText = (row, fields) => {
  for (const field of fields) {
    const value = text(row?.[field]);
    if (value) return value;
  }
  return "";
};

const toInt = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
};

const normalizeShopifyId = (value) => {
  const raw = text(value);
  if (!raw) return "";
  const parts = raw.split("/");
  return parts[parts.length - 1] || raw;
};

const shopifyKeys = (...values) =>
  values.flatMap((value) => [text(value), normalizeShopifyId(value)]).filter(Boolean);

const isMissingTable = (error) =>
  TABLE_MISSING_CODES.has(error?.code) ||
  /could not find the table|relation .* does not exist/i.test(
    error?.message || "",
  );

const client = (url, key, label) => {
  if (!url || !key) {
    throw new Error(`Missing ${label} Supabase URL or service role key`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

const fetchAll = async (db, table, { select = "*", optional = false } = {}) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      if (optional && isMissingTable(error)) return [];
      throw new Error(`${table}: ${error.message}`);
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
};

const batchUpsert = async (db, table, rows, conflict, dryRun) => {
  if (rows.length === 0 || dryRun) return rows.length;

  for (let index = 0; index < rows.length; index += WRITE_BATCH_SIZE) {
    const batch = rows.slice(index, index + WRITE_BATCH_SIZE);
    const { error } = await db.from(table).upsert(batch, {
      onConflict: conflict,
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
};

const updateById = async (db, table, id, payload, dryRun) => {
  if (dryRun) return;
  const { error } = await db.from(table).update(payload).eq("id", id);
  if (error) throw new Error(`${table}:${id}: ${error.message}`);
};

const uniqueIndex = (rows, getKeys) => {
  const index = new Map();
  for (const row of rows) {
    for (const key of getKeys(row).filter(Boolean)) {
      if (index.has(key)) index.set(key, null);
      else index.set(key, row);
    }
  }
  return index;
};

const lookup = (index, ...keys) => {
  for (const key of keys.filter(Boolean)) {
    const value = index.get(key);
    if (value) return value;
  }
  return null;
};

const productShopifyKeys = (product) => {
  const data = parseJson(product?.data);
  return shopifyKeys(
    product?.shopify_id,
    product?.shopify_product_id,
    data?.id,
    data?.admin_graphql_api_id,
  );
};

const productSkuKeys = (product) => {
  const data = parseJson(product?.data);
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  return [product?.sku, ...variants.map((variant) => variant?.sku)]
    .map(sku)
    .filter(Boolean);
};

const orderShopifyKeys = (order) => {
  const data = parseJson(order?.data);
  return shopifyKeys(
    order?.shopify_id,
    order?.shopify_order_id,
    data?.id,
    data?.admin_graphql_api_id,
  );
};

const orderNumberKeys = (order) =>
  [order?.order_number, order?.name, parseJson(order?.data)?.name]
    .map(text)
    .filter(Boolean);

const buildProductContext = (oldProducts, newProducts) => {
  const oldById = new Map(
    oldProducts.map((row) => [text(row?.id), row]).filter(([id]) => id),
  );
  const newById = uniqueIndex(newProducts, (row) => [text(row?.id)]);
  const newByShopify = uniqueIndex(newProducts, productShopifyKeys);
  const newBySku = uniqueIndex(newProducts, productSkuKeys);

  const resolveProduct = (oldProduct) =>
    oldProduct
      ? lookup(newById, text(oldProduct?.id)) ||
        lookup(newByShopify, ...productShopifyKeys(oldProduct)) ||
        lookup(newBySku, ...productSkuKeys(oldProduct))
      : null;

  const resolveWarehouseProduct = (row) => {
    const oldProduct = oldById.get(text(row?.product_id));
    return (
      resolveProduct(oldProduct) ||
      lookup(
        newByShopify,
        ...shopifyKeys(row?.shopify_id, row?.shopify_product_id),
      ) ||
      lookup(newBySku, sku(row?.sku || row?.scan_code || row?.warehouse_code))
    );
  };

  return { oldById, resolveProduct, resolveWarehouseProduct };
};

const buildStoreContext = (newStores) => {
  const targetStoreId = text(process.env.MIGRATE_TARGET_STORE_ID);
  const storeIds = new Set(newStores.map((row) => text(row?.id)).filter(Boolean));

  return {
    resolveStoreId({ sourceStoreId, targetProduct }) {
      if (targetStoreId) return targetStoreId;
      if (targetProduct?.store_id) return targetProduct.store_id;
      if (sourceStoreId && storeIds.has(sourceStoreId)) return sourceStoreId;
      if (storeIds.size === 1) return Array.from(storeIds)[0];
      return "";
    },
  };
};

const readShippingIssue = (order) => {
  const data = parseJson(order?.data);
  const modern =
    extractOrderLocalMetadata(data)?.shipping_issue ||
    data?._tetiano_local_order?.shipping_issue ||
    order?.shipping_issue;

  if (modern && typeof modern === "object") {
    return {
      reason: firstText(modern, ["reason"]) || "issue",
      shipping_company_note: firstText(modern, [
        "shipping_company_note",
        "shippingIssueShippingCompanyNote",
      ]),
      customer_service_note: firstText(modern, [
        "customer_service_note",
        "customerServiceNote",
      ]),
      updated_at:
        firstText(modern, ["updated_at", "updatedAt"]) ||
        firstText(order, ["local_updated_at", "updated_at", "created_at"]) ||
        nowIso(),
      updated_by: firstText(modern, ["updated_by", "updatedBy"]),
      updated_by_name: firstText(modern, ["updated_by_name", "updatedByName"]),
    };
  }

  const hasLegacy =
    truthy(order?.shipping_issue_active) ||
    Boolean(
      firstText(order, [
        "shipping_issue_reason",
        "shipping_issue_shipping_company_note",
        "shipping_issue_customer_service_note",
      ]),
    );

  if (!hasLegacy) return null;

  return {
    reason: firstText(order, ["shipping_issue_reason"]) || "issue",
    shipping_company_note: firstText(order, [
      "shipping_issue_shipping_company_note",
      "shipping_company_note",
    ]),
    customer_service_note: firstText(order, [
      "shipping_issue_customer_service_note",
      "customer_service_note",
    ]),
    updated_at:
      firstText(order, [
        "shipping_issue_updated_at",
        "shipping_issue_created_at",
        "local_updated_at",
        "updated_at",
        "created_at",
      ]) || nowIso(),
    updated_by: firstText(order, ["shipping_issue_updated_by"]),
    updated_by_name: firstText(order, ["shipping_issue_updated_by_name"]),
  };
};

const hasIssue = (issue) =>
  Boolean(
    issue?.reason ||
      issue?.shipping_company_note ||
      issue?.customer_service_note,
  );

const migrateShippingIssues = async (oldDb, newDb, dryRun) => {
  console.log("\nShipping issues");

  const oldOrders = await fetchAll(oldDb, "orders");
  const newOrders = await fetchAll(newDb, "orders", {
    select: "id, shopify_id, order_number, data",
  });
  const newById = uniqueIndex(newOrders, (row) => [text(row?.id)]);
  const newByShopify = uniqueIndex(newOrders, orderShopifyKeys);
  const newByNumber = uniqueIndex(newOrders, orderNumberKeys);
  const summary = {
    scanned: oldOrders.length,
    found: 0,
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    failed: 0,
  };

  for (const oldOrder of oldOrders) {
    const issue = readShippingIssue(oldOrder);
    if (!hasIssue(issue)) continue;

    summary.found += 1;
    const target =
      lookup(newById, text(oldOrder?.id)) ||
      lookup(newByShopify, ...orderShopifyKeys(oldOrder)) ||
      lookup(newByNumber, ...orderNumberKeys(oldOrder));

    if (!target?.id) {
      summary.unmatched += 1;
      continue;
    }

    const currentIssue =
      extractOrderLocalMetadata(parseJson(target.data))?.shipping_issue || null;
    const nextData = mergeOrderLocalMetadata(
      parseJson(target.data),
      { shipping_issue: issue },
      {
        updatedAt: issue.updated_at,
        updatedBy: issue.updated_by,
        updatedByName: issue.updated_by_name,
      },
    );
    const nextIssue = extractOrderLocalMetadata(nextData)?.shipping_issue || null;

    if (stable(currentIssue) === stable(nextIssue)) {
      summary.unchanged += 1;
      continue;
    }

    try {
      await updateById(
        newDb,
        "orders",
        target.id,
        {
          data: nextData,
          local_updated_at: issue.updated_at,
          updated_at: nowIso(),
        },
        dryRun,
      );
      target.data = nextData;
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      console.warn(
        `  Failed order ${oldOrder?.order_number || oldOrder?.id}: ${error.message}`,
      );
    }
  }

  console.log(
    `  scanned=${summary.scanned}, found=${summary.found}, updated=${summary.updated}, unchanged=${summary.unchanged}, unmatched=${summary.unmatched}, failed=${summary.failed}`,
  );
  return summary;
};

const costUpdates = (product, { includeZeroCosts, migrateProductPrice }) => {
  const allowZero = includeZeroCosts;
  const updates = {};
  const cost = firstNumber(
    product,
    ["cost_price", "supplier_cost", "product_cost", "cost"],
    { allowZero },
  );
  const ads = firstNumber(
    product,
    ["ads_cost", "ad_cost", "marketing_cost", "marketing_cost_per_unit"],
    { allowZero },
  );
  const shipping = firstNumber(
    product,
    ["shipping_cost", "shipping_cost_per_unit"],
    { allowZero },
  );
  const operation = firstNumber(
    product,
    ["operation_cost", "operations_cost", "operational_cost"],
    { allowZero },
  );

  if (cost !== null) updates.cost_price = cost;
  if (ads !== null) updates.ads_cost = ads;
  if (shipping !== null) updates.shipping_cost = shipping;

  if (operation !== null) {
    updates.operation_cost = operation;
  } else {
    const components = [
      numberOrNull(product?.additional_cost_per_unit, { allowZero }),
      numberOrNull(product?.packaging_cost_per_unit, { allowZero }),
      numberOrNull(product?.other_costs_per_unit, { allowZero }),
    ].filter((value) => value !== null);
    if (components.length > 0) {
      updates.operation_cost = components.reduce((sum, value) => sum + value, 0);
    }
  }

  if (migrateProductPrice) {
    const price = firstNumber(product, ["price", "selling_price"], {
      allowZero: false,
    });
    if (price !== null) updates.price = price;
  }

  return updates;
};

const migrateProductCosts = async (oldProducts, productContext, newDb, dryRun, options) => {
  console.log("\nProduct costs and local product metadata");

  const summary = {
    scanned: oldProducts.length,
    found: 0,
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    failed: 0,
  };

  for (const oldProduct of oldProducts) {
    const target = productContext.resolveProduct(oldProduct);
    const updates = costUpdates(oldProduct, options);
    const localMetadata = extractProductLocalMetadata(parseJson(oldProduct.data));
    const hasMetadata =
      Boolean(localMetadata.supplier_phone) ||
      Boolean(localMetadata.supplier_location) ||
      Boolean(localMetadata.suppress_low_stock_alerts);

    if (Object.keys(updates).length === 0 && !hasMetadata) continue;
    summary.found += 1;

    if (!target?.id) {
      summary.unmatched += 1;
      continue;
    }

    const payload = {};
    for (const [field, value] of Object.entries(updates)) {
      if (numberOrNull(target[field]) !== value) payload[field] = value;
    }

    if (hasMetadata) {
      const currentData = parseJson(target.data);
      const nextData = mergeProductLocalMetadata(currentData, localMetadata);
      if (stable(currentData) !== stable(nextData)) {
        payload.data = nextData;
        payload.local_updated_at = nowIso();
      }
    }

    if (Object.keys(payload).length === 0) {
      summary.unchanged += 1;
      continue;
    }

    payload.updated_at = nowIso();

    try {
      await updateById(newDb, "products", target.id, payload, dryRun);
      Object.assign(target, payload);
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      console.warn(
        `  Failed product ${oldProduct?.sku || oldProduct?.title || oldProduct?.id}: ${error.message}`,
      );
    }
  }

  console.log(
    `  scanned=${summary.scanned}, found=${summary.found}, updated=${summary.updated}, unchanged=${summary.unchanged}, unmatched=${summary.unmatched}, failed=${summary.failed}`,
  );
  return summary;
};

const movement = (value) => {
  const normalized = text(value).toLowerCase();
  return normalized === "out" ? "out" : "in";
};

const warehousePayload = ({ source, oldProduct, target, storeId, code }) => {
  const quantity = toInt(
    firstNumber(source, [
      "quantity",
      "warehouse_stock_quantity",
      "warehouse_quantity",
      "warehouse_inventory_quantity",
      "warehouse_available_quantity",
    ]),
  );
  const scannedAt =
    firstText(source, [
      "last_scanned_at",
      "warehouse_last_updated",
      "local_last_scanned_at",
      "updated_at",
      "created_at",
    ]) || nowIso();

  return {
    store_id: storeId,
    sku: sku(code),
    product_id: target?.id || null,
    shopify_id:
      text(target?.shopify_id) ||
      firstText(source, ["shopify_id", "shopify_product_id"]) ||
      firstText(oldProduct, ["shopify_id", "shopify_product_id"]),
    variant_id: text(source?.variant_id),
    shopify_inventory_quantity: toInt(
      source?.shopify_inventory_quantity ??
        source?.inventory_quantity ??
        target?.inventory_quantity,
    ),
    quantity,
    last_scanned_at: scannedAt,
    last_movement_type: movement(
      source?.last_movement_type || source?.local_last_movement_type,
    ),
    last_movement_quantity: toInt(
      source?.last_movement_quantity ?? source?.local_last_movement_quantity,
    ),
    created_at: firstText(source, ["created_at", "local_created_at"]) || scannedAt,
    updated_at: firstText(source, ["updated_at", "local_updated_at"]) || scannedAt,
  };
};

const keepWarehousePayload = (payload) =>
  Boolean(
    payload.store_id &&
      payload.sku &&
      (payload.quantity > 0 ||
        payload.last_scanned_at ||
        payload.last_movement_quantity > 0),
  );

const addWarehousePayload = (map, payload, priority) => {
  if (!keepWarehousePayload(payload)) return;

  const key = `${payload.store_id}:${payload.sku}`;
  const existing = map.get(key);
  if (!existing || priority >= existing.priority) {
    map.set(key, { payload, priority });
  }
};

const addWarehouseTableRows = (map, rows, productContext, storeContext) => {
  for (const row of rows) {
    const oldProduct = productContext.oldById.get(text(row.product_id));
    const target = productContext.resolveWarehouseProduct(row);
    const storeId = storeContext.resolveStoreId({
      sourceStoreId: text(row.store_id || oldProduct?.store_id),
      targetProduct: target,
    });
    const code = sku(row.sku || row.warehouse_code || oldProduct?.sku || target?.sku);

    addWarehousePayload(
      map,
      warehousePayload({ source: row, oldProduct, target, storeId, code }),
      3,
    );
  }
};

const addWarehouseProductDataRows = (map, oldProducts, productContext, storeContext) => {
  const catalog = buildWarehouseVariantCatalog(oldProducts);

  for (const row of catalog.rows) {
    if (toInt(row.local_warehouse_quantity) === 0 && !row.local_last_scanned_at) {
      continue;
    }

    const oldProduct = productContext.oldById.get(text(row.product_id));
    const target = productContext.resolveProduct(oldProduct);
    const storeId = storeContext.resolveStoreId({
      sourceStoreId: text(oldProduct?.store_id || row.store_id),
      targetProduct: target,
    });
    const code = sku(row.warehouse_code || row.sku);

    addWarehousePayload(
      map,
      warehousePayload({
        source: {
          quantity: row.local_warehouse_quantity,
          last_scanned_at: row.local_last_scanned_at,
          last_movement_type: row.local_last_movement_type,
          last_movement_quantity: row.local_last_movement_quantity,
          created_at: row.local_created_at,
          updated_at: row.local_updated_at,
          shopify_inventory_quantity: row.shopify_inventory_quantity,
          variant_id: row.variant_id,
        },
        oldProduct,
        target,
        storeId,
        code,
      }),
      1,
    );
  }
};

const addWarehouseLegacyProductRows = (map, oldProducts, productContext, storeContext) => {
  for (const oldProduct of oldProducts) {
    const quantity = firstNumber(oldProduct, [
      "warehouse_stock_quantity",
      "warehouse_quantity",
      "warehouse_inventory_quantity",
      "warehouse_available_quantity",
    ]);
    if (quantity === null && !oldProduct.warehouse_last_updated) continue;

    const target = productContext.resolveProduct(oldProduct);
    const storeId = storeContext.resolveStoreId({
      sourceStoreId: text(oldProduct.store_id),
      targetProduct: target,
    });
    const code = sku(oldProduct.sku || target?.sku);

    addWarehousePayload(
      map,
      warehousePayload({
        source: {
          ...oldProduct,
          quantity,
          last_scanned_at: oldProduct.warehouse_last_updated,
        },
        oldProduct,
        target,
        storeId,
        code,
      }),
      2,
    );
  }
};

const migrateWarehouseInventory = async (
  oldDb,
  newDb,
  oldProducts,
  productContext,
  storeContext,
  dryRun,
) => {
  console.log("\nWarehouse inventory");

  const tableRows = await fetchAll(oldDb, "warehouse_inventory", {
    optional: true,
  });
  const byKey = new Map();

  addWarehouseProductDataRows(byKey, oldProducts, productContext, storeContext);
  addWarehouseLegacyProductRows(byKey, oldProducts, productContext, storeContext);
  addWarehouseTableRows(byKey, tableRows, productContext, storeContext);

  const rows = Array.from(byKey.values()).map((entry) => entry.payload);
  const written = await batchUpsert(
    newDb,
    "warehouse_inventory",
    rows,
    "store_id,sku",
    dryRun,
  );
  const summary = { tableRows: tableRows.length, prepared: rows.length, written };

  console.log(
    `  table_rows=${summary.tableRows}, prepared=${summary.prepared}, written=${summary.written}`,
  );
  return summary;
};

const migrateWarehouseScanEvents = async (
  oldDb,
  newDb,
  productContext,
  storeContext,
  dryRun,
  options,
) => {
  console.log("\nWarehouse scan events");

  if (!options.migrateScanEvents) {
    console.log("  skipped by MIGRATE_SCAN_EVENTS=false");
    return { scanned: 0, prepared: 0, written: 0, skipped: true };
  }

  const rows = await fetchAll(oldDb, "warehouse_scan_events", { optional: true });
  const users = await fetchAll(newDb, "users", { select: "id", optional: true });
  const newUserIds = new Set(users.map((row) => text(row.id)).filter(Boolean));
  const prepared = [];
  let skipped = 0;

  for (const row of rows) {
    const target = productContext.resolveWarehouseProduct(row);
    const storeId = storeContext.resolveStoreId({
      sourceStoreId: text(row.store_id),
      targetProduct: target,
    });
    const code = sku(row.sku || row.scan_code);
    const type = text(row.movement_type).toLowerCase();

    if (!storeId || !code || !["in", "out"].includes(type)) {
      skipped += 1;
      continue;
    }

    const userId = text(row.user_id);
    prepared.push({
      id: text(row.id) || undefined,
      store_id: storeId,
      sku: code,
      product_id: target?.id || null,
      user_id: userId && newUserIds.has(userId) ? userId : null,
      movement_type: type,
      quantity: Math.max(1, toInt(row.quantity, 1)),
      scan_code: text(row.scan_code) || code,
      note: text(row.note) || null,
      created_at: text(row.created_at) || nowIso(),
    });
  }

  const written = await batchUpsert(
    newDb,
    "warehouse_scan_events",
    prepared,
    "id",
    dryRun,
  );
  const summary = {
    scanned: rows.length,
    prepared: prepared.length,
    written,
    skipped,
  };

  console.log(
    `  scanned=${summary.scanned}, prepared=${summary.prepared}, written=${summary.written}, skipped=${summary.skipped}`,
  );
  return summary;
};

const getOptions = () => ({
  dryRun: !truthy(process.env.MIGRATE_APPLY),
  includeZeroCosts: truthy(process.env.MIGRATE_INCLUDE_ZERO_COSTS),
  migrateProductPrice: truthy(process.env.MIGRATE_PRODUCT_PRICE),
  migrateScanEvents: !falsey(process.env.MIGRATE_SCAN_EVENTS),
});

const config = () => {
  const oldUrl = env("OLD_SUPABASE_URL");
  const oldKey = env(
    "OLD_SUPABASE_SERVICE_ROLE_KEY",
    "OLD_SUPABASE_KEY",
    "OLD_SUPABASE_ANON_KEY",
  );
  const newUrl = env("NEW_SUPABASE_URL", "SUPABASE_URL");
  const newKey = env(
    "NEW_SUPABASE_SERVICE_ROLE_KEY",
    "NEW_SUPABASE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_KEY",
  );

  if (!oldUrl || !oldKey) {
    throw new Error(
      "Set OLD_SUPABASE_URL and OLD_SUPABASE_SERVICE_ROLE_KEY in backend/.env",
    );
  }
  if (!newUrl || !newKey) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the new project in backend/.env",
    );
  }
  if (oldUrl === newUrl) {
    throw new Error("Old and new Supabase URLs are the same; refusing to run");
  }

  return { oldUrl, oldKey, newUrl, newKey };
};

const testConnection = async (db, label) => {
  const { error } = await db.from("products").select("id").limit(1);
  if (error && !isMissingTable(error)) {
    throw new Error(`${label} connection failed: ${error.message}`);
  }
};

const migrateSpecificData = async () => {
  const options = getOptions();
  const settings = config();
  const oldDb = client(settings.oldUrl, settings.oldKey, "old");
  const newDb = client(settings.newUrl, settings.newKey, "new");

  console.log("Targeted Supabase migration");
  console.log(`Mode: ${options.dryRun ? "DRY RUN" : "APPLY"}`);
  console.log("Set MIGRATE_APPLY=true to write changes.");

  await testConnection(oldDb, "Old Supabase");
  await testConnection(newDb, "New Supabase");

  const [oldProducts, newProducts, newStores] = await Promise.all([
    fetchAll(oldDb, "products"),
    fetchAll(newDb, "products", {
      select:
        "id, store_id, shopify_id, sku, title, price, cost_price, ads_cost, operation_cost, shipping_cost, inventory_quantity, data",
    }),
    fetchAll(newDb, "stores", { select: "id", optional: true }),
  ]);

  const productContext = buildProductContext(oldProducts, newProducts);
  const storeContext = buildStoreContext(newStores);

  const results = {
    shippingIssues: await migrateShippingIssues(oldDb, newDb, options.dryRun),
    productCosts: await migrateProductCosts(
      oldProducts,
      productContext,
      newDb,
      options.dryRun,
      options,
    ),
    warehouseInventory: await migrateWarehouseInventory(
      oldDb,
      newDb,
      oldProducts,
      productContext,
      storeContext,
      options.dryRun,
    ),
    warehouseScanEvents: await migrateWarehouseScanEvents(
      oldDb,
      newDb,
      productContext,
      storeContext,
      options.dryRun,
      options,
    ),
  };

  console.log("\nSummary");
  console.log(JSON.stringify(results, null, 2));

  if (options.dryRun) {
    console.log(
      "\nDry run only. Re-run with MIGRATE_APPLY=true after reviewing the counts.",
    );
  }

  return results;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateSpecificData().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

export { migrateSpecificData };
