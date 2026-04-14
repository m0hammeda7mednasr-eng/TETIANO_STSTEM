import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve("backend/.env") });
dotenv.config({ path: path.resolve(".env") });

const importDir = path.resolve(
  process.env.SUPABASE_IMPORT_DIR || path.join("backups", "supabase-import"),
);

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before import");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const TABLES = [
  { name: "users", conflict: "id" },
  { name: "permissions", conflict: "user_id" },
  { name: "stores", conflict: "id" },
  { name: "user_stores", conflict: "user_id,store_id" },
  { name: "shopify_credentials", conflict: "user_id" },
  { name: "shopify_tokens", conflict: "user_id,shop" },
  { name: "products", conflict: "id" },
  { name: "customers", conflict: "id" },
  { name: "orders", conflict: "id" },
  { name: "order_comments", conflict: "id" },
  { name: "access_requests", conflict: "id" },
  { name: "daily_reports", conflict: "id" },
  { name: "notifications", conflict: "id" },
  { name: "activity_log", conflict: "id" },
  { name: "operational_costs", conflict: "id" },
  { name: "sync_operations", conflict: "id" },
  { name: "warehouse_inventory", conflict: "id" },
  { name: "warehouse_scan_events", conflict: "id" },
  { name: "suppliers", conflict: "id" },
  { name: "supplier_entries", conflict: "id" },
  { name: "supplier_fabrics", conflict: "id" },
  { name: "tasks", conflict: "id" },
  { name: "task_comments", conflict: "id" },
  { name: "task_attachments", conflict: "id" },
  { name: "meta_integrations", conflict: "id" },
  { name: "meta_sync_runs", conflict: "id" },
  { name: "meta_insight_snapshots", conflict: "id" },
  { name: "meta_entities", conflict: "id" },
  { name: "meta_ai_analyses", conflict: "id" },
];

const CHUNK_SIZE = Math.max(
  1,
  parseInt(process.env.SUPABASE_IMPORT_CHUNK_SIZE || "200", 10),
);

const readRows = async (tableName) => {
  const filePath = path.join(importDir, "tables", `${tableName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const chunk = (rows, size) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
};

const sanitizeRows = (rows) =>
  rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return row;
    }
    const next = { ...row };
    delete next.user_name;
    delete next.user_email;
    delete next.user_role;
    delete next.edited_by_name;
    delete next.edited_by_email;
    return next;
  });

const importTable = async ({ name, conflict }) => {
  const rows = await readRows(name);
  if (rows === null) {
    console.log(`Skipping ${name}: no file`);
    return { table: name, skipped: true, imported: 0 };
  }

  if (rows.length === 0) {
    console.log(`Skipping ${name}: empty`);
    return { table: name, skipped: true, imported: 0 };
  }

  const sanitizedRows = sanitizeRows(rows);
  let imported = 0;

  for (const batch of chunk(sanitizedRows, CHUNK_SIZE)) {
    const { error } = await supabase.from(name).upsert(batch, {
      onConflict: conflict,
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`${name}: ${error.message}`);
    }

    imported += batch.length;
  }

  console.log(`Imported ${name}: ${imported}`);
  return { table: name, skipped: false, imported };
};

const run = async () => {
  const summary = [];

  for (const table of TABLES) {
    summary.push(await importTable(table));
  }

  const total = summary.reduce((sum, item) => sum + item.imported, 0);
  console.log(`Done. Imported rows: ${total}`);
};

run().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
