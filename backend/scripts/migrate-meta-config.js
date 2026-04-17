#!/usr/bin/env node

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const TIMEOUT_MS = 20 * 1000;

const text = (value) => String(value ?? "").trim();

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

const mask = (value) => {
  const normalized = text(value);
  if (!normalized) return "";
  if (normalized.length <= 8) return "********";
  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
};

const fetchWithTimeout = async (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const createDb = ({ url, key, label }) => {
  if (!url || !key) {
    throw new Error(`Missing ${label} Supabase URL or service role key`);
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
};

const getConfig = () => {
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

  if (oldUrl === newUrl) {
    throw new Error("Old and new Supabase URLs are the same; refusing to run");
  }

  return {
    oldDb: createDb({ url: oldUrl, key: oldKey, label: "old" }),
    newDb: createDb({ url: newUrl, key: newKey, label: "new" }),
    dryRun: !truthy(process.env.MIGRATE_APPLY),
  };
};

const loadSingleIntegration = async (db) => {
  const { data, error } = await db
    .from("meta_integrations")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`meta_integrations: ${error.message}`);
  return data || null;
};

const resolveTargetStoreId = async (newDb, oldIntegration) => {
  const explicitStoreId = text(process.env.MIGRATE_TARGET_STORE_ID);
  if (explicitStoreId) return explicitStoreId;

  const { data: sameStore, error: sameStoreError } = await newDb
    .from("stores")
    .select("id")
    .eq("id", oldIntegration.store_id)
    .limit(1)
    .maybeSingle();

  if (sameStoreError) {
    throw new Error(`stores lookup: ${sameStoreError.message}`);
  }
  if (sameStore?.id) return sameStore.id;

  const { data: stores, error } = await newDb
    .from("stores")
    .select("id")
    .limit(2);

  if (error) throw new Error(`stores: ${error.message}`);
  if ((stores || []).length === 1) return stores[0].id;

  throw new Error(
    "Could not infer target store. Set MIGRATE_TARGET_STORE_ID and retry.",
  );
};

const buildPayload = (oldIntegration, storeId) => ({
  store_id: storeId,
  meta_access_token: text(oldIntegration.meta_access_token),
  meta_business_id: text(oldIntegration.meta_business_id),
  meta_ad_account_ids: Array.isArray(oldIntegration.meta_ad_account_ids)
    ? oldIntegration.meta_ad_account_ids
    : [],
  meta_page_id: text(oldIntegration.meta_page_id),
  meta_pixel_id: text(oldIntegration.meta_pixel_id),
  openrouter_api_key: text(oldIntegration.openrouter_api_key),
  openrouter_model: text(oldIntegration.openrouter_model) || "openai/gpt-4o-mini",
  openrouter_site_url: text(oldIntegration.openrouter_site_url),
  openrouter_site_name: text(oldIntegration.openrouter_site_name),
  is_meta_connected: Boolean(oldIntegration.is_meta_connected),
  is_openrouter_connected: Boolean(oldIntegration.is_openrouter_connected),
  last_meta_sync_at: oldIntegration.last_meta_sync_at || null,
  last_meta_sync_status: text(oldIntegration.last_meta_sync_status) || "idle",
  last_meta_sync_error: text(oldIntegration.last_meta_sync_error),
  last_ai_analysis_at: oldIntegration.last_ai_analysis_at || null,
  created_by: null,
  updated_by: null,
});

const migrateMetaConfig = async () => {
  const { oldDb, newDb, dryRun } = getConfig();
  const oldIntegration = await loadSingleIntegration(oldDb);

  if (!oldIntegration) {
    console.log("No old Meta/OpenRouter integration found.");
    return null;
  }

  const storeId = await resolveTargetStoreId(newDb, oldIntegration);
  const payload = buildPayload(oldIntegration, storeId);

  console.log("Meta/OpenRouter config");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(
    JSON.stringify(
      {
        target_store_id: storeId,
        meta_configured: Boolean(payload.meta_access_token),
        meta_token: mask(payload.meta_access_token),
        meta_business_id: payload.meta_business_id,
        meta_ad_account_ids: payload.meta_ad_account_ids,
        meta_page_id: payload.meta_page_id,
        meta_pixel_id: payload.meta_pixel_id,
        openrouter_configured: Boolean(payload.openrouter_api_key),
        openrouter_key: mask(payload.openrouter_api_key),
        openrouter_model: payload.openrouter_model,
        openrouter_site_url: payload.openrouter_site_url,
        openrouter_site_name: payload.openrouter_site_name,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry run only. Re-run with MIGRATE_APPLY=true to write.");
    return payload;
  }

  const { error } = await newDb.from("meta_integrations").upsert([payload], {
    onConflict: "store_id",
    ignoreDuplicates: false,
  });

  if (error) throw new Error(`meta_integrations upsert: ${error.message}`);
  console.log("Meta/OpenRouter config migrated.");
  return payload;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateMetaConfig().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

export { migrateMetaConfig };
