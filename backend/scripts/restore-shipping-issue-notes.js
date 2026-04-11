import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_SHIPPING_ISSUE_REASON,
  applyOrderLocalMetadata,
  extractOrderLocalMetadata,
} from "../src/helpers/orderLocalMetadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

const readEnvFile = (envPath) => {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
};

const env = {
  ...readEnvFile(path.join(backendDir, ".env")),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE key in backend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const APPLY_MODE = process.argv.includes("--apply");
const CHUNK_SIZE = 200;

const normalizeText = (value) => String(value ?? "").trim();

const parseJsonField = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return typeof value === "object" ? value : {};
};

const hasAnyRecoveredNotes = (issue) =>
  Boolean(
    normalizeText(issue?.shipping_company_note) ||
      normalizeText(issue?.customer_service_note),
  );

const toIsoFileName = (value = new Date()) =>
  value.toISOString().replace(/[:.]/g, "-");

const fetchAllShippingIssueOperations = async () => {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + 999;
    const { data, error } = await supabase
      .from("sync_operations")
      .select("id, entity_id, created_at, request_data")
      .eq("operation_type", "order_shipping_issue_update")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));

    if (!data || data.length < 1000) {
      break;
    }

    from += 1000;
  }

  return rows;
};

const fetchOrdersByIds = async (orderIds) => {
  const rows = [];

  for (let index = 0; index < orderIds.length; index += CHUNK_SIZE) {
    const chunk = orderIds.slice(index, index + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, shopify_id, data, updated_at, local_updated_at")
      .in("id", chunk);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));
  }

  return rows;
};

const buildLatestRecoverableNotesMap = (operations) => {
  const recoverableByOrderId = new Map();

  for (const operation of operations) {
    const requestData = operation?.request_data || {};
    const candidates = [
      requestData?.new_shipping_issue,
      requestData?.old_shipping_issue,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!hasAnyRecoveredNotes(candidate)) {
        continue;
      }

      if (!recoverableByOrderId.has(operation.entity_id)) {
        recoverableByOrderId.set(operation.entity_id, {
          source_operation_id: operation.id,
          source_created_at: operation.created_at,
          issue: candidate,
        });
      }

      break;
    }
  }

  return recoverableByOrderId;
};

const buildRestorePlan = (orders, recoverableByOrderId) =>
  orders.reduce((plan, order) => {
    const recoverable = recoverableByOrderId.get(order.id);
    if (!recoverable) {
      return plan;
    }

    const orderData = parseJsonField(order.data);
    const metadata = extractOrderLocalMetadata(orderData);
    const currentIssue = metadata?.shipping_issue || null;

    if (hasAnyRecoveredNotes(currentIssue)) {
      return plan;
    }

    const nextIssue = {
      reason:
        normalizeText(currentIssue?.reason) ||
        normalizeText(recoverable.issue?.reason) ||
        DEFAULT_SHIPPING_ISSUE_REASON,
      shipping_company_note:
        normalizeText(currentIssue?.shipping_company_note) ||
        normalizeText(recoverable.issue?.shipping_company_note),
      customer_service_note:
        normalizeText(currentIssue?.customer_service_note) ||
        normalizeText(recoverable.issue?.customer_service_note),
      updated_at:
        normalizeText(currentIssue?.updated_at) ||
        normalizeText(recoverable.issue?.updated_at) ||
        new Date().toISOString(),
      updated_by:
        normalizeText(currentIssue?.updated_by) ||
        normalizeText(recoverable.issue?.updated_by) ||
        "shipping-note-recovery",
      updated_by_name:
        normalizeText(currentIssue?.updated_by_name) ||
        normalizeText(recoverable.issue?.updated_by_name) ||
        "Shipping note recovery",
    };

    if (!hasAnyRecoveredNotes(nextIssue)) {
      return plan;
    }

    const nextData = applyOrderLocalMetadata(orderData, {
      ...metadata,
      shipping_issue: nextIssue,
    });

    plan.push({
      order_id: order.id,
      order_number: order.order_number,
      shopify_id: order.shopify_id,
      current_issue: currentIssue,
      restored_issue: nextIssue,
      source_operation_id: recoverable.source_operation_id,
      source_created_at: recoverable.source_created_at,
      before_data: orderData,
      after_data: nextData,
    });

    return plan;
  }, []);

const persistBackupFile = (restorePlan) => {
  const backupDir = path.join(backendDir, "recovery");
  fs.mkdirSync(backupDir, { recursive: true });

  const backupPath = path.join(
    backupDir,
    `shipping-note-restore-${toIsoFileName()}.json`,
  );

  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        apply_mode: APPLY_MODE,
        restored_count: restorePlan.length,
        orders: restorePlan,
      },
      null,
      2,
    ),
  );

  return backupPath;
};

const applyRestorePlan = async (restorePlan) => {
  for (const item of restorePlan) {
    const updatePayload = {
      data: item.after_data,
      local_updated_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", item.order_id);

    if (error) {
      const retryPayload = { data: item.after_data };
      ({ error } = await supabase
        .from("orders")
        .update(retryPayload)
        .eq("id", item.order_id));
    }

    if (error) {
      throw error;
    }
  }
};

const verifyRestorePlan = async (restorePlan) => {
  const restoredOrders = await fetchOrdersByIds(
    restorePlan.map((item) => item.order_id),
  );
  const orderById = new Map(restoredOrders.map((order) => [order.id, order]));

  return restorePlan.map((item) => {
    const order = orderById.get(item.order_id);
    const currentIssue =
      extractOrderLocalMetadata(parseJsonField(order?.data))?.shipping_issue ||
      null;

    return {
      order_id: item.order_id,
      order_number: item.order_number,
      shipping_company_note: normalizeText(currentIssue?.shipping_company_note),
      customer_service_note: normalizeText(currentIssue?.customer_service_note),
      reason: normalizeText(currentIssue?.reason),
      restored: hasAnyRecoveredNotes(currentIssue),
    };
  });
};

try {
  const operations = await fetchAllShippingIssueOperations();
  const recoverableByOrderId = buildLatestRecoverableNotesMap(operations);
  const orders = await fetchOrdersByIds(Array.from(recoverableByOrderId.keys()));
  const restorePlan = buildRestorePlan(orders, recoverableByOrderId);
  const backupPath = persistBackupFile(restorePlan);

  if (!APPLY_MODE) {
    console.log(
      JSON.stringify(
        {
          apply_mode: false,
          restore_count: restorePlan.length,
          backup_path: backupPath,
          sample: restorePlan.slice(0, 20).map((item) => ({
            order_id: item.order_id,
            order_number: item.order_number,
            source_created_at: item.source_created_at,
            restored_issue: item.restored_issue,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  await applyRestorePlan(restorePlan);
  const verification = await verifyRestorePlan(restorePlan);

  console.log(
    JSON.stringify(
      {
        apply_mode: true,
        restore_count: restorePlan.length,
        backup_path: backupPath,
        verification,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Failed to restore shipping issue notes:", error);
  process.exit(1);
}
