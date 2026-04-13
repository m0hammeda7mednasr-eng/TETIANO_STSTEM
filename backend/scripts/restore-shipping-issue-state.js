import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  applyShippingIssueRecoveryPlan,
  buildShippingIssueRecoveryPlan,
  fetchLatestShippingIssueOperationsByOrderId,
} from "../src/helpers/shippingIssueRecovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const recoveryDir = path.join(backendDir, "recovery");
const APPLY_MODE = process.argv.includes("--apply");
const ORDER_FETCH_CHUNK_SIZE = 200;

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

const toIsoFileName = (value = new Date()) =>
  value.toISOString().replace(/[:.]/g, "-");

const normalizeIssueSignature = (issue) =>
  JSON.stringify({
    reason: String(issue?.reason || "").trim(),
    shipping_company_note: String(issue?.shipping_company_note || "").trim(),
    customer_service_note: String(issue?.customer_service_note || "").trim(),
    updated_at: String(issue?.updated_at || "").trim(),
    updated_by: String(issue?.updated_by || "").trim(),
    updated_by_name: String(issue?.updated_by_name || "").trim(),
  });

const fetchOrdersByIds = async (orderIds) => {
  const rows = [];

  for (
    let index = 0;
    index < orderIds.length;
    index += ORDER_FETCH_CHUNK_SIZE
  ) {
    const chunk = orderIds.slice(index, index + ORDER_FETCH_CHUNK_SIZE);
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

const writeBackup = (recoveryPlan) => {
  fs.mkdirSync(recoveryDir, { recursive: true });
  const backupPath = path.join(
    recoveryDir,
    `shipping-issue-state-recovery-${toIsoFileName()}.json`,
  );

  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        apply_mode: APPLY_MODE,
        recovered_count: recoveryPlan.length,
        orders: recoveryPlan,
      },
      null,
      2,
    ),
  );

  return backupPath;
};

const verifyOrders = async (recoveryPlan) => {
  const restoredOrders = await fetchOrdersByIds(
    recoveryPlan.map((item) => item.order_id),
  );
  const byId = new Map(restoredOrders.map((order) => [order.id, order]));

  return recoveryPlan.map((item) => {
    const currentOrder = byId.get(item.order_id);
    const currentIssue =
      currentOrder?.data?._tetiano_local_order?.shipping_issue || null;

    return {
      order_id: item.order_id,
      order_number: item.order_number,
      restored:
        normalizeIssueSignature(currentIssue) ===
        normalizeIssueSignature(item.after_issue),
      current_issue: currentIssue,
    };
  });
};

try {
  const latestOperationByOrderId =
    await fetchLatestShippingIssueOperationsByOrderId(
      supabase,
      Array.from(
        new Set(
          (
            await (async () => {
              const { data, error } = await supabase
                .from("sync_operations")
                .select("entity_id")
                .eq("operation_type", "order_shipping_issue_update");

              if (error) {
                throw error;
              }

              return data || [];
            })()
          )
            .map((row) => row.entity_id)
            .filter(Boolean),
        ),
      ),
    );
  const orders = await fetchOrdersByIds(Array.from(latestOperationByOrderId.keys()));
  const recoveryPlan = buildShippingIssueRecoveryPlan(
    orders,
    latestOperationByOrderId,
  );
  const backupPath = writeBackup(recoveryPlan);

  if (!APPLY_MODE) {
    console.log(
      JSON.stringify(
        {
          apply_mode: false,
          recover_count: recoveryPlan.length,
          backup_path: backupPath,
          sample: recoveryPlan.slice(0, 20).map((item) => ({
            order_id: item.order_id,
            order_number: item.order_number,
            before_issue: item.before_issue,
            after_issue: item.after_issue,
            source_created_at: item.source_created_at,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  await applyShippingIssueRecoveryPlan(supabase, recoveryPlan);
  const verification = await verifyOrders(recoveryPlan);

  console.log(
    JSON.stringify(
      {
        apply_mode: true,
        recover_count: recoveryPlan.length,
        backup_path: backupPath,
        verification,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error?.message || String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
