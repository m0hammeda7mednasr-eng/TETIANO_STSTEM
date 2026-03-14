import dotenv from "dotenv";
dotenv.config();

import { supabase } from "../src/supabaseClient.js";

const ENTITY_TABLES = ["products", "orders", "customers"];
const nowIso = () => new Date().toISOString();

const unique = (values) =>
  Array.from(
    new Set((values || []).filter((value) => value !== null && value !== undefined)),
  );

const assertNoError = (label, error) => {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
};

const logSection = (title) => {
  console.log(`\n=== ${title} ===`);
};

const fetchMaybeSingle = async (query, label) => {
  const { data, error } = await query.maybeSingle();
  assertNoError(label, error);
  return data || null;
};

const fetchRows = async (query, label) => {
  const { data, error } = await query;
  assertNoError(label, error);
  return data || [];
};

const ensureUserStoreLink = async (userId, storeId, stats) => {
  if (!userId || !storeId) {
    return false;
  }

  const existing = await fetchMaybeSingle(
    supabase
      .from("user_stores")
      .select("user_id,store_id")
      .eq("user_id", userId)
      .eq("store_id", storeId),
    `Lookup user_stores ${userId}/${storeId}`,
  );

  if (existing) {
    return false;
  }

  const { error } = await supabase
    .from("user_stores")
    .insert({ user_id: userId, store_id: storeId });
  assertNoError(`Insert user_stores ${userId}/${storeId}`, error);
  stats.userStoreLinksCreated += 1;
  return true;
};

const ensureStoreForToken = async (token, stats) => {
  const normalizedShop = String(token.shop || "").trim().toLowerCase();
  let store =
    token.store_id
      ? await fetchMaybeSingle(
          supabase.from("stores").select("*").eq("id", token.store_id),
          `Lookup store by id ${token.store_id}`,
        )
      : null;

  if (!store && normalizedShop) {
    store = await fetchMaybeSingle(
      supabase.from("stores").select("*").eq("name", normalizedShop),
      `Lookup store by name ${normalizedShop}`,
    );
  }

  if (!store && normalizedShop) {
    const { data, error } = await supabase
      .from("stores")
      .insert({
        name: normalizedShop,
        created_by: token.user_id || null,
      })
      .select()
      .single();
    assertNoError(`Create store for ${normalizedShop}`, error);
    store = data;
    stats.storesCreated += 1;
  }

  if (!store) {
    stats.warnings.push(
      `Token ${token.id} could not be mapped because it has no valid shop/store reference.`,
    );
    return null;
  }

  if (!store.created_by && token.user_id) {
    const { error } = await supabase
      .from("stores")
      .update({
        created_by: token.user_id,
        updated_at: nowIso(),
      })
      .eq("id", store.id);
    assertNoError(`Set created_by on store ${store.id}`, error);
    stats.storesUpdated += 1;
    store = { ...store, created_by: token.user_id };
  }

  if (token.store_id !== store.id) {
    const { error } = await supabase
      .from("shopify_tokens")
      .update({
        store_id: store.id,
        updated_at: nowIso(),
      })
      .eq("id", token.id);
    assertNoError(`Update token ${token.id} store_id`, error);
    stats.tokensUpdated += 1;
  }

  await ensureUserStoreLink(token.user_id, store.id, stats);

  return {
    ...token,
    shop: normalizedShop || store.name,
    store_id: store.id,
    store_name: store.name,
  };
};

const buildResolvedMaps = (resolvedTokens) => {
  const storeIdsByUser = new Map();
  const ownerByStore = new Map();
  const ambiguousStores = new Set();

  for (const token of resolvedTokens) {
    if (!token?.user_id || !token?.store_id) {
      continue;
    }

    const userStoreIds = storeIdsByUser.get(token.user_id) || [];
    userStoreIds.push(token.store_id);
    storeIdsByUser.set(token.user_id, userStoreIds);

    const currentOwner = ownerByStore.get(token.store_id);
    if (!currentOwner) {
      ownerByStore.set(token.store_id, token.user_id);
    } else if (currentOwner !== token.user_id) {
      ambiguousStores.add(token.store_id);
    }
  }

  for (const [userId, storeIds] of storeIdsByUser.entries()) {
    storeIdsByUser.set(userId, unique(storeIds));
  }

  for (const storeId of ambiguousStores) {
    ownerByStore.delete(storeId);
  }

  return { storeIdsByUser, ownerByStore };
};

const backfillEntityStoreIds = async ({
  table,
  userId,
  storeId,
  stats,
}) => {
  if (!userId || !storeId) {
    return 0;
  }

  const { data, error } = await supabase
    .from(table)
    .update({
      store_id: storeId,
      updated_at: nowIso(),
    })
    .eq("user_id", userId)
    .is("store_id", null)
    .select("id");

  assertNoError(`Backfill ${table}.store_id for user ${userId}`, error);
  const count = data?.length || 0;
  stats.entityStoreBackfills[table] += count;
  return count;
};

const backfillEntityUserIds = async ({
  table,
  userId,
  storeId,
  stats,
}) => {
  if (!userId || !storeId) {
    return 0;
  }

  const { data, error } = await supabase
    .from(table)
    .update({
      user_id: userId,
      updated_at: nowIso(),
    })
    .eq("store_id", storeId)
    .is("user_id", null)
    .select("id");

  assertNoError(`Backfill ${table}.user_id for store ${storeId}`, error);
  const count = data?.length || 0;
  stats.entityUserBackfills[table] += count;
  return count;
};

const ensureLinksFromEntityRows = async (table, stats) => {
  const rows = await fetchRows(
    supabase
      .from(table)
      .select("user_id,store_id")
      .not("user_id", "is", null)
      .not("store_id", "is", null),
    `Fetch ${table} user/store pairs`,
  );

  const seenPairs = new Set();
  for (const row of rows) {
    const pairKey = `${row.user_id}:${row.store_id}`;
    if (seenPairs.has(pairKey)) {
      continue;
    }
    seenPairs.add(pairKey);
    await ensureUserStoreLink(row.user_id, row.store_id, stats);
  }
};

const collectNullCounts = async () => {
  const counts = {};
  for (const table of ENTITY_TABLES) {
    const nullStoreRows = await fetchRows(
      supabase.from(table).select("id").is("store_id", null),
      `Count ${table} rows with null store_id`,
    );
    const nullUserRows = await fetchRows(
      supabase.from(table).select("id").is("user_id", null),
      `Count ${table} rows with null user_id`,
    );
    counts[table] = {
      nullStoreId: nullStoreRows.length,
      nullUserId: nullUserRows.length,
    };
  }
  return counts;
};

const main = async () => {
  const stats = {
    storesCreated: 0,
    storesUpdated: 0,
    tokensUpdated: 0,
    userStoreLinksCreated: 0,
    entityStoreBackfills: {
      products: 0,
      orders: 0,
      customers: 0,
    },
    entityUserBackfills: {
      products: 0,
      orders: 0,
      customers: 0,
    },
    warnings: [],
  };

  logSection("Loading tokens");
  const tokenRows = await fetchRows(
    supabase
      .from("shopify_tokens")
      .select("id,user_id,store_id,shop,updated_at")
      .order("updated_at", { ascending: false }),
    "Fetch shopify_tokens",
  );
  console.log(`Found ${tokenRows.length} Shopify token(s).`);

  logSection("Resolving stores and token links");
  const resolvedTokens = [];
  for (const token of tokenRows) {
    const resolved = await ensureStoreForToken(token, stats);
    if (resolved) {
      resolvedTokens.push(resolved);
      console.log(
        `Token ${token.id} -> store ${resolved.store_id} (${resolved.store_name})`,
      );
    }
  }

  const { storeIdsByUser, ownerByStore } = buildResolvedMaps(resolvedTokens);

  logSection("Backfilling entity store_id/user_id");
  for (const [userId, storeIds] of storeIdsByUser.entries()) {
    if (storeIds.length === 1) {
      const [storeId] = storeIds;
      for (const table of ENTITY_TABLES) {
        await backfillEntityStoreIds({ table, userId, storeId, stats });
      }
    } else {
      stats.warnings.push(
        `User ${userId} has ${storeIds.length} stores; skipped null store_id backfill because it is ambiguous.`,
      );
    }
  }

  for (const [storeId, userId] of ownerByStore.entries()) {
    for (const table of ENTITY_TABLES) {
      await backfillEntityUserIds({ table, userId, storeId, stats });
    }
  }

  logSection("Ensuring user_stores links from synced data");
  for (const table of ENTITY_TABLES) {
    await ensureLinksFromEntityRows(table, stats);
  }

  logSection("Residual null-link counts");
  const nullCounts = await collectNullCounts();
  console.log(JSON.stringify(nullCounts, null, 2));

  logSection("Repair summary");
  console.log(JSON.stringify(stats, null, 2));

  if (stats.warnings.length > 0) {
    logSection("Warnings");
    for (const warning of stats.warnings) {
      console.warn(`- ${warning}`);
    }
  }
};

main()
  .then(() => {
    console.log("\nDatabase repair completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDatabase repair failed:", error.message);
    process.exit(1);
  });
