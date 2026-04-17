#!/usr/bin/env node

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyProductWarehouseInventorySnapshot,
  getProductWarehouseInventorySnapshot,
} from "../src/helpers/productLocalMetadata.js";
import {
  buildWarehouseVariantCatalog,
  normalizeWarehouseCode,
} from "../src/helpers/warehouseCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 100;

const text = (value) => String(value ?? "").trim();
const normalizeCode = (value) => normalizeWarehouseCode(value);

const truthy = (value) =>
  value === true ||
  value === 1 ||
  ["1", "true", "yes", "on"].includes(text(value).toLowerCase());

const env = (...names) => {
  for (const name of names) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  return "";
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseData = (value) => {
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

const stable = (value) => JSON.stringify(value ?? null);

const createDb = () => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY");

  if (!url || !key) {
    throw new Error("Missing target Supabase URL or service role key");
  }

  return createClient(url, key, { auth: { persistSession: false } });
};

const fetchAll = async (db, table, select) => {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
};

const buildInventoryByStoreAndCode = (rows) =>
  new Map(
    rows
      .map((row) => [
        `${text(row.store_id)}:${normalizeCode(row.sku)}`,
        row,
      ])
      .filter(([key]) => !key.endsWith(":")),
  );

const buildProductUpdates = (products, inventoryRows) => {
  const inventoryByStoreAndCode = buildInventoryByStoreAndCode(inventoryRows);
  const productsById = new Map(
    products.map((product) => [text(product.id), product]).filter(([id]) => id),
  );
  const nextDataByProductId = new Map();
  const catalog = buildWarehouseVariantCatalog(products);

  for (const catalogRow of catalog.rows) {
    const product = productsById.get(text(catalogRow.product_id));
    const code = normalizeCode(catalogRow.warehouse_code);
    const inventoryRow = inventoryByStoreAndCode.get(
      `${text(catalogRow.store_id)}:${code}`,
    );

    if (!product || !inventoryRow) {
      continue;
    }

    const currentData =
      nextDataByProductId.get(product.id)?.data || parseData(product.data);
    const quantity = toNumber(inventoryRow.quantity);
    const currentSnapshot = getProductWarehouseInventorySnapshot(currentData, {
      variantId: catalogRow.variant_id,
      sku: catalogRow.sku || catalogRow.warehouse_code,
    });

    if (toNumber(currentSnapshot.quantity) === quantity) {
      continue;
    }

    let nextData;

    try {
      nextData = applyProductWarehouseInventorySnapshot(
        currentData,
        {
          variantId: catalogRow.variant_id,
          sku: catalogRow.sku || catalogRow.warehouse_code,
        },
        {
          quantity,
          last_scanned_at: inventoryRow.last_scanned_at,
          last_movement_type: inventoryRow.last_movement_type,
          last_movement_quantity: toNumber(inventoryRow.last_movement_quantity),
          created_at: inventoryRow.created_at,
          updated_at: inventoryRow.updated_at,
        },
      );
    } catch {
      continue;
    }

    nextDataByProductId.set(product.id, { product, data: nextData });
  }

  return Array.from(nextDataByProductId.values())
    .filter(({ product, data }) => stable(parseData(product.data)) !== stable(data))
    .map(({ product, data }) => ({
      id: product.id,
      data,
      local_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
};

const syncWarehouseInventoryToProducts = async () => {
  const dryRun = !truthy(process.env.MIGRATE_APPLY);
  const db = createDb();
  const [products, inventoryRows] = await Promise.all([
    fetchAll(db, "products", "id,store_id,shopify_id,sku,title,inventory_quantity,data"),
    fetchAll(
      db,
      "warehouse_inventory",
      "store_id,product_id,sku,quantity,last_scanned_at,last_movement_type,last_movement_quantity,created_at,updated_at",
    ),
  ]);
  const updates = buildProductUpdates(products, inventoryRows);

  console.log("Warehouse inventory product snapshot sync");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(
    JSON.stringify(
      {
        products: products.length,
        warehouse_inventory_rows: inventoryRows.length,
        product_updates: updates.length,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry run only. Re-run with MIGRATE_APPLY=true to write.");
    return updates;
  }

  for (let index = 0; index < updates.length; index += WRITE_BATCH_SIZE) {
    const batch = updates.slice(index, index + WRITE_BATCH_SIZE);
    const { error } = await db.from("products").upsert(batch, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

    if (error) throw new Error(`products upsert: ${error.message}`);
  }

  console.log("Warehouse inventory snapshots synced to products.");
  return updates;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncWarehouseInventoryToProducts().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

export { syncWarehouseInventoryToProducts };
