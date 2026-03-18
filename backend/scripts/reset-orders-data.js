import dotenv from "dotenv";
dotenv.config();

import { supabase } from "../src/supabaseClient.js";

const ORDER_NOTIFICATION_TYPES = [
  "order_missing",
  "order_missing_escalated",
];
const BATCH_SIZE = 200;

const normalizeId = (value) => String(value || "").trim();

const unique = (values = []) =>
  Array.from(
    new Set(values.map(normalizeId).filter(Boolean)),
  );

const chunkValues = (values = [], size = BATCH_SIZE) => {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (items.length === 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const log = (message = "") => {
  console.log(message);
};

const logSection = (title) => {
  console.log(`\n=== ${title} ===`);
};

const fail = (message) => {
  throw new Error(message);
};

const fetchRows = async (query, label, { allowMissingTable = false } = {}) => {
  const { data, error } = await query;
  if (error) {
    if (
      allowMissingTable &&
      ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error.code || ""))
    ) {
      return [];
    }

    const text =
      `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    if (
      allowMissingTable &&
      (text.includes("does not exist") ||
        text.includes("could not find the") ||
        text.includes("relation") ||
        text.includes("column"))
    ) {
      return [];
    }

    fail(`${label}: ${error.message}`);
  }

  return data || [];
};

const deleteIds = async (tableName, ids, label) => {
  let deletedCount = 0;
  for (const chunk of chunkValues(ids)) {
    const { data, error } = await supabase
      .from(tableName)
      .delete()
      .in("id", chunk)
      .select("id");

    if (error) {
      fail(`${label}: ${error.message}`);
    }

    deletedCount += data?.length || 0;
  }

  return deletedCount;
};

const parseArgs = (argv = []) => {
  const args = Array.isArray(argv) ? argv : [];
  let storeId = "";
  let allStores = false;
  let execute = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || "").trim();
    if (token === "--store") {
      storeId = normalizeId(args[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith("--store=")) {
      storeId = normalizeId(token.slice("--store=".length));
      continue;
    }

    if (token === "--all-stores") {
      allStores = true;
      continue;
    }

    if (token === "--execute") {
      execute = true;
      continue;
    }
  }

  return {
    storeId,
    allStores,
    execute,
  };
};

const loadStoreCatalog = async () => {
  const [stores, tokenStores, orderStores, customerStores] = await Promise.all([
    fetchRows(
      supabase.from("stores").select("id,name,created_by"),
      "Load stores",
      { allowMissingTable: true },
    ),
    fetchRows(
      supabase.from("shopify_tokens").select("store_id,shop,user_id"),
      "Load token stores",
      { allowMissingTable: true },
    ),
    fetchRows(
      supabase.from("orders").select("store_id"),
      "Load order stores",
      { allowMissingTable: true },
    ),
    fetchRows(
      supabase.from("customers").select("store_id"),
      "Load customer stores",
      { allowMissingTable: true },
    ),
  ]);

  const storeMap = new Map();

  for (const row of stores) {
    const id = normalizeId(row?.id);
    if (!id) {
      continue;
    }
    storeMap.set(id, {
      id,
      name: String(row?.name || "").trim(),
      created_by: normalizeId(row?.created_by),
    });
  }

  for (const row of tokenStores) {
    const id = normalizeId(row?.store_id);
    if (!id || storeMap.has(id)) {
      continue;
    }
    storeMap.set(id, {
      id,
      name: String(row?.shop || "").trim(),
      created_by: normalizeId(row?.user_id),
    });
  }

  for (const collection of [orderStores, customerStores]) {
    for (const row of collection) {
      const id = normalizeId(row?.store_id);
      if (!id || storeMap.has(id)) {
        continue;
      }
      storeMap.set(id, {
        id,
        name: "",
        created_by: "",
      });
    }
  }

  return Array.from(storeMap.values()).sort((left, right) =>
    String(left.name || left.id).localeCompare(String(right.name || right.id), "en"),
  );
};

const resolveTargetStores = async ({ storeId, allStores }) => {
  const discoveredStores = await loadStoreCatalog();
  const discoveredStoreIds = discoveredStores.map((store) => store.id);

  if (allStores) {
    if (discoveredStoreIds.length === 0) {
      fail("No stores were discovered in the database.");
    }
    return {
      targetStoreIds: discoveredStoreIds,
      discoveredStores,
      modeLabel: "all stores",
    };
  }

  if (storeId) {
    return {
      targetStoreIds: [storeId],
      discoveredStores,
      modeLabel: `store ${storeId}`,
    };
  }

  if (discoveredStoreIds.length === 1) {
    return {
      targetStoreIds: discoveredStoreIds,
      discoveredStores,
      modeLabel: `store ${discoveredStoreIds[0]}`,
    };
  }

  const printableStores = discoveredStores
    .map((store) => `- ${store.id}${store.name ? ` (${store.name})` : ""}`)
    .join("\n");
  fail(
    [
      "Multiple stores were found. Specify one store or use --all-stores.",
      printableStores || "- No named stores found",
      "Examples:",
      "  node scripts/reset-orders-data.js --store <store-id>",
      "  node scripts/reset-orders-data.js --all-stores --execute",
    ].join("\n"),
  );
};

const resolveTargetUserIds = async (targetStoreIds, discoveredStores = []) => {
  const [tokenRows, userStoreRows] = await Promise.all([
    fetchRows(
      supabase
        .from("shopify_tokens")
        .select("user_id,store_id")
        .in("store_id", targetStoreIds),
      "Load token users",
      { allowMissingTable: true },
    ),
    fetchRows(
      supabase
        .from("user_stores")
        .select("user_id,store_id")
        .in("store_id", targetStoreIds),
      "Load user_stores users",
      { allowMissingTable: true },
    ),
  ]);

  const fallbackOwners = discoveredStores
    .filter((store) => targetStoreIds.includes(store.id))
    .map((store) => store.created_by);

  return unique([
    ...tokenRows.map((row) => row?.user_id),
    ...userStoreRows.map((row) => row?.user_id),
    ...fallbackOwners,
  ]);
};

const fetchScopedRows = async (tableName, selectColumns, targetStoreIds, targetUserIds) => {
  const rowsById = new Map();

  if (targetStoreIds.length > 0) {
    const scopedRows = await fetchRows(
      supabase
        .from(tableName)
        .select(selectColumns)
        .in("store_id", targetStoreIds),
      `Load ${tableName} by store`,
    );

    for (const row of scopedRows) {
      const id = normalizeId(row?.id);
      if (id) {
        rowsById.set(id, row);
      }
    }
  }

  if (targetUserIds.length > 0) {
    const legacyRows = await fetchRows(
      supabase
        .from(tableName)
        .select(selectColumns)
        .is("store_id", null)
        .in("user_id", targetUserIds),
      `Load legacy ${tableName} rows`,
      { allowMissingTable: true },
    );

    for (const row of legacyRows) {
      const id = normalizeId(row?.id);
      if (id) {
        rowsById.set(id, row);
      }
    }
  }

  return Array.from(rowsById.values());
};

const fetchIdsByInFilter = async (tableName, columnName, values, label) => {
  const ids = [];
  for (const chunk of chunkValues(values)) {
    const rows = await fetchRows(
      supabase
        .from(tableName)
        .select("id")
        .in(columnName, chunk),
      label,
      { allowMissingTable: true },
    );
    ids.push(...rows.map((row) => row?.id));
  }

  return unique(ids);
};

const fetchAllIds = async (tableName, label, filterBuilder = null) => {
  const query = supabase.from(tableName).select("id");
  const scopedQuery = typeof filterBuilder === "function" ? filterBuilder(query) : query;
  const rows = await fetchRows(scopedQuery, label, { allowMissingTable: true });
  return unique(rows.map((row) => row?.id));
};

const fetchIdsByEntityIds = async (
  tableName,
  entityIds,
  label,
  { entityType = "", entityColumn = "entity_id" } = {},
) => {
  const ids = [];

  for (const chunk of chunkValues(entityIds)) {
    let query = supabase.from(tableName).select("id").in(entityColumn, chunk);
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    const rows = await fetchRows(query, label, { allowMissingTable: true });
    ids.push(...rows.map((row) => row?.id));
  }

  return unique(ids);
};

const fetchResetPlan = async (targetStoreIds, discoveredStores, { allStores = false } = {}) => {
  const targetUserIds = await resolveTargetUserIds(targetStoreIds, discoveredStores);
  const orders = await fetchScopedRows(
    "orders",
    "id,shopify_id,store_id,user_id",
    targetStoreIds,
    targetUserIds,
  );
  const customers = await fetchScopedRows(
    "customers",
    "id,shopify_id,store_id,user_id",
    targetStoreIds,
    targetUserIds,
  );

  const orderIds = unique(orders.map((row) => row?.id));
  const orderShopifyIds = unique(orders.map((row) => row?.shopify_id));
  const customerIds = unique(customers.map((row) => row?.id));

  const [orderCommentIds, syncOperationIds, notificationIds, activityLogIds] =
    await Promise.all([
      allStores
        ? fetchAllIds("order_comments", "Load all order comments")
        : orderShopifyIds.length > 0
        ? fetchIdsByInFilter(
            "order_comments",
            "order_id",
            orderShopifyIds,
            "Load order comments",
          )
        : Promise.resolve([]),
      allStores
        ? fetchAllIds(
            "sync_operations",
            "Load all order sync operations",
            (query) => query.eq("entity_type", "order"),
          )
        : orderIds.length > 0
        ? fetchIdsByEntityIds(
            "sync_operations",
            orderIds,
            "Load order sync operations",
            { entityType: "order" },
          )
        : Promise.resolve([]),
      allStores
        ? unique([
            ...(await fetchAllIds(
              "notifications",
              "Load all order entity notifications",
              (query) => query.eq("entity_type", "order"),
            )),
            ...(await fetchAllIds(
              "notifications",
              "Load all missing-order notifications",
              (query) => query.in("type", ORDER_NOTIFICATION_TYPES),
            )),
          ])
        : orderIds.length > 0
        ? fetchIdsByEntityIds(
            "notifications",
            orderIds,
            "Load order notifications",
            { entityType: "order" },
          )
        : Promise.resolve([]),
      allStores
        ? unique([
            ...(await fetchAllIds(
              "activity_log",
              "Load all order activity log rows",
              (query) => query.eq("entity_type", "order"),
            )),
            ...(await fetchAllIds(
              "activity_log",
              "Load all customer activity log rows",
              (query) => query.eq("entity_type", "customer"),
            )),
          ])
        : [
            ...(orderIds.length > 0
              ? await fetchIdsByEntityIds(
                  "activity_log",
                  orderIds,
                  "Load order activity log",
                  { entityType: "order" },
                )
              : []),
            ...(customerIds.length > 0
              ? await fetchIdsByEntityIds(
                  "activity_log",
                  customerIds,
                  "Load customer activity log",
                  { entityType: "customer" },
                )
              : []),
          ],
    ]);

  return {
    targetStoreIds,
    targetUserIds,
    orders,
    customers,
    orderIds,
    customerIds,
    orderCommentIds,
    syncOperationIds,
    notificationIds,
    activityLogIds: unique(activityLogIds),
  };
};

const printPlan = (plan, modeLabel, execute) => {
  logSection("Reset Scope");
  log(`Mode: ${modeLabel}`);
  log(`Stores: ${plan.targetStoreIds.length}`);
  if (plan.targetStoreIds.length > 0) {
    for (const storeId of plan.targetStoreIds) {
      log(`- ${storeId}`);
    }
  }
  log(`Linked users: ${plan.targetUserIds.length}`);

  logSection(execute ? "Rows To Delete" : "Dry Run");
  log(`orders: ${plan.orderIds.length}`);
  log(`customers: ${plan.customerIds.length}`);
  log(`order_comments: ${plan.orderCommentIds.length}`);
  log(`sync_operations(order): ${plan.syncOperationIds.length}`);
  log(`notifications(order): ${plan.notificationIds.length}`);
  log(`activity_log(order/customer): ${plan.activityLogIds.length}`);
};

const executeReset = async (plan) => {
  logSection("Deleting");

  const deletedActivityLog = await deleteIds(
    "activity_log",
    plan.activityLogIds,
    "Delete activity_log rows",
  );
  log(`Deleted activity_log: ${deletedActivityLog}`);

  const deletedNotifications = await deleteIds(
    "notifications",
    plan.notificationIds,
    "Delete notifications rows",
  );
  log(`Deleted notifications: ${deletedNotifications}`);

  const deletedSyncOps = await deleteIds(
    "sync_operations",
    plan.syncOperationIds,
    "Delete sync_operations rows",
  );
  log(`Deleted sync_operations: ${deletedSyncOps}`);

  const deletedOrderComments = await deleteIds(
    "order_comments",
    plan.orderCommentIds,
    "Delete order_comments rows",
  );
  log(`Deleted order_comments: ${deletedOrderComments}`);

  const deletedOrders = await deleteIds(
    "orders",
    plan.orderIds,
    "Delete orders rows",
  );
  log(`Deleted orders: ${deletedOrders}`);

  const deletedCustomers = await deleteIds(
    "customers",
    plan.customerIds,
    "Delete customers rows",
  );
  log(`Deleted customers: ${deletedCustomers}`);
};

const main = async () => {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)) {
    fail("Supabase credentials are missing. Check backend/.env before running.");
  }

  const options = parseArgs(process.argv.slice(2));
  const { targetStoreIds, discoveredStores, modeLabel } =
    await resolveTargetStores(options);
  const plan = await fetchResetPlan(targetStoreIds, discoveredStores, {
    allStores: options.allStores,
  });

  printPlan(plan, modeLabel, options.execute);

  if (!options.execute) {
    logSection("Next Step");
    log("This was a dry run. Add --execute to apply the deletion.");
    return;
  }

  await executeReset(plan);

  logSection("Done");
  log("Order-related database data was cleared successfully.");
};

main().catch((error) => {
  console.error(`\nReset failed: ${error.message}`);
  process.exitCode = 1;
});
