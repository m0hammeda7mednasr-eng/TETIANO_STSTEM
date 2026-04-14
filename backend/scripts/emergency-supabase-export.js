import axios from "axios";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const TABLES = [
  "users",
  "permissions",
  "stores",
  "user_stores",
  "shopify_tokens",
  "shopify_credentials",
  "products",
  "orders",
  "customers",
  "order_comments",
  "order_comments_with_user",
  "notifications",
  "sync_operations",
  "warehouse_inventory",
  "warehouse_scan_events",
  "operational_costs",
  "suppliers",
  "supplier_entries",
  "supplier_fabrics",
  "tasks",
  "task_comments",
  "task_attachments",
  "access_requests",
  "activity_log",
  "daily_reports",
  "meta_ai_analyses",
  "meta_entities",
  "meta_insight_snapshots",
  "meta_integrations",
  "meta_sync_runs",
];
const selectedTables = process.env.SUPABASE_EXPORT_TABLES
  ? process.env.SUPABASE_EXPORT_TABLES.split(",")
      .map((tableName) => tableName.trim())
      .filter(Boolean)
  : TABLES;

const DEFAULT_BATCH_SIZE = Number.parseInt(
  process.env.SUPABASE_EXPORT_BATCH_SIZE || "1000",
  10,
);
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.SUPABASE_EXPORT_TIMEOUT_MS || "3000",
  10,
);
const MAX_RETRIES = Number.parseInt(
  process.env.SUPABASE_EXPORT_RETRIES || "0",
  10,
);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(repoRoot, "backups", `supabase-emergency-${timestamp}`);

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "",
).trim();
const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeName = (tableName) => tableName.replace(/[^a-zA-Z0-9_.-]/g, "_");

const getProjectRef = () => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
};

const writeJson = async (filePath, value) => {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const copyIfExists = async (source, destination) => {
  try {
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
      await fs.cp(source, destination, { recursive: true });
      return true;
    }
    await fs.copyFile(source, destination);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const fetchPage = async (tableName, offset, limit) => {
  const response = await axios.get(`${supabaseUrl}/rest/v1/${tableName}`, {
    params: {
      select: "*",
      limit,
      offset,
    },
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
    },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const error = new Error(
      `HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 500)}`,
    );
    error.status = response.status;
    throw error;
  }

  return Array.isArray(response.data) ? response.data : [];
};

const fetchPageWithRetry = async (tableName, offset, limit) => {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchPage(tableName, offset, limit);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastError;
};

const exportTable = async (tableName) => {
  const startedAt = Date.now();
  const rows = [];
  let offset = 0;
  let batchSize =
    Number.isFinite(DEFAULT_BATCH_SIZE) && DEFAULT_BATCH_SIZE > 0
      ? DEFAULT_BATCH_SIZE
      : 1000;

  while (true) {
    let page;
    try {
      page = await fetchPageWithRetry(tableName, offset, batchSize);
    } catch (error) {
      if (offset === 0 && batchSize > 100) {
        batchSize = 100;
        page = await fetchPageWithRetry(tableName, offset, batchSize);
      } else {
        throw error;
      }
    }

    rows.push(...page);
    offset += page.length;

    if (page.length < batchSize) {
      break;
    }
  }

  const tableFile = path.join(backupDir, "tables", `${safeName(tableName)}.json`);
  await writeJson(tableFile, rows);

  return {
    table: tableName,
    ok: true,
    rows: rows.length,
    file: path.relative(repoRoot, tableFile),
    ms: Date.now() - startedAt,
  };
};

const run = async () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE key in backend/.env");
  }

  await fs.mkdir(path.join(backupDir, "tables"), { recursive: true });
  await fs.mkdir(path.join(backupDir, "schema"), { recursive: true });

  await copyIfExists(
    path.join(backendRoot, "migrations"),
    path.join(backupDir, "schema", "backend-migrations"),
  );

  const rootEntries = await fs.readdir(repoRoot, { withFileTypes: true });
  await Promise.all(
    rootEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
      .map((entry) =>
        copyIfExists(
          path.join(repoRoot, entry.name),
          path.join(backupDir, "schema", entry.name),
        ),
      ),
  );

  const manifest = {
    started_at: new Date().toISOString(),
    finished_at: null,
    project_ref: getProjectRef(),
    key_type: keyType,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    batch_size: DEFAULT_BATCH_SIZE,
    backup_dir: path.relative(repoRoot, backupDir),
    tables: [],
    totals: {
      ok: 0,
      failed: 0,
      rows: 0,
    },
  };

  console.log(`Backup directory: ${manifest.backup_dir}`);
  console.log(`Supabase project: ${manifest.project_ref || "unknown"}`);
  console.log(`Using key type: ${keyType}`);

  for (const tableName of selectedTables) {
    process.stdout.write(`Exporting ${tableName}... `);
    try {
      const result = await exportTable(tableName);
      manifest.tables.push(result);
      manifest.totals.ok += 1;
      manifest.totals.rows += result.rows;
      console.log(`${result.rows} rows (${result.ms}ms)`);
    } catch (error) {
      const result = {
        table: tableName,
        ok: false,
        rows: 0,
        error: error?.message || String(error),
        code: error?.code || null,
        status: error?.status || null,
      };
      manifest.tables.push(result);
      manifest.totals.failed += 1;
      console.log(`FAILED: ${result.error}`);
    }

    await writeJson(path.join(backupDir, "manifest.json"), manifest);
  }

  manifest.finished_at = new Date().toISOString();
  await writeJson(path.join(backupDir, "manifest.json"), manifest);
  console.log(
    `Done. ${manifest.totals.ok} tables exported, ${manifest.totals.failed} failed, ${manifest.totals.rows} rows saved.`,
  );
};

run().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
