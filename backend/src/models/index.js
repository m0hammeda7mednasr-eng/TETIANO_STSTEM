import { supabase } from "../supabaseClient.js";
import {
  preserveProductInventoryData,
  preserveProductLocalMetadata,
  zeroProductInventoryData,
} from "../helpers/productLocalMetadata.js";
import { preserveOrderLocalMetadata } from "../helpers/orderLocalMetadata.js";

const sortByCreatedAtDesc = { ascending: false };
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const SHOPIFY_UPSERT_BATCH_SIZE = 200;
const ACCESSIBLE_STORE_IDS_CACHE_TTL_MS = 60 * 1000;
const accessibleStoreIdsCache = new Map();

const isSchemaCompatibilityError = (error) => {
  if (!error) return false;

  const code = String(error.code || "");
  if (SCHEMA_ERROR_CODES.has(code)) {
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

const hasMeaningfulData = (data) => {
  if (Array.isArray(data)) {
    return data.length > 0;
  }

  return data !== null && data !== undefined;
};

const executeWithSchemaFallback = async (builders) => {
  let lastError = null;

  for (const build of builders) {
    const { data, error } = await build();
    if (!error) {
      return { data, error: null };
    }

    lastError = error;
    if (!isSchemaCompatibilityError(error)) {
      return { data: null, error };
    }
  }

  return { data: null, error: lastError };
};

const executeWithSchemaAndEmptyFallback = (
  builders,
  { continueOnUnexpectedError = false } = {},
) => {
  let lastError = null;
  let lastData = null;

  return (async () => {
    for (const build of builders) {
      const { data, error } = await build();

      if (!error) {
        lastData = data;
        if (hasMeaningfulData(data)) {
          return { data, error: null };
        }
        continue;
      }

      lastError = error;
      if (!continueOnUnexpectedError && !isSchemaCompatibilityError(error)) {
        return { data: null, error };
      }
    }

    return { data: lastData, error: lastError };
  })();
};

const buildListQueryFallbacks = (tableName, applyFilter) => {
  const orderFields = ["created_at", "updated_at", "id", null];

  return orderFields.map((field) => async () => {
    let query = supabase.from(tableName).select();
    if (field) {
      query = query.order(field, sortByCreatedAtDesc);
    }
    if (applyFilter) {
      query = applyFilter(query);
    }
    return await query;
  });
};

const getUniqueStoreIds = (rows) =>
  Array.from(
    new Set(
      (rows || [])
        .map((row) => row?.store_id)
        .filter((value) => value !== null && value !== undefined),
    ),
  );

const getUniqueRowIds = (rows, fieldName) =>
  Array.from(
    new Set(
      (rows || [])
        .map((row) => String(row?.[fieldName] || "").trim())
        .filter(Boolean),
    ),
  );

const discoverSingleSharedStoreIds = async () => {
  const discoveredStoreIds = new Set();
  const rememberStoreIds = (storeIds = []) => {
    for (const storeId of storeIds) {
      discoveredStoreIds.add(storeId);
      if (discoveredStoreIds.size > 1) {
        return false;
      }
    }

    return true;
  };

  const discoveryStrategies = [
    async () => {
      const { data, error } = await supabase.from("stores").select("id");
      if (error) {
        throw error;
      }
      return getUniqueRowIds(data, "id");
    },
    async () => {
      const { data, error } = await supabase
        .from("shopify_tokens")
        .select("store_id")
        .not("store_id", "is", null);
      if (error) {
        throw error;
      }
      return getUniqueStoreIds(data);
    },
  ];

  for (const discover of discoveryStrategies) {
    try {
      const storeIds = await discover();
      if (!rememberStoreIds(storeIds)) {
        return [];
      }
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        console.warn(
          "Single shared store discovery fallback failed:",
          error.message,
        );
      }
    }
  }

  return discoveredStoreIds.size === 1 ? Array.from(discoveredStoreIds) : [];
};

const getCachedAccessibleStoreIds = (userId) => {
  const cacheKey = String(userId || "").trim();
  if (!cacheKey) {
    return null;
  }

  const cachedEntry = accessibleStoreIdsCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.updatedAt > ACCESSIBLE_STORE_IDS_CACHE_TTL_MS) {
    accessibleStoreIdsCache.delete(cacheKey);
    return null;
  }

  return [...cachedEntry.storeIds];
};

const rememberAccessibleStoreIds = (userId, storeIds) => {
  const cacheKey = String(userId || "").trim();
  if (!cacheKey) {
    return;
  }

  accessibleStoreIdsCache.set(cacheKey, {
    storeIds: Array.isArray(storeIds) ? [...storeIds] : [],
    updatedAt: Date.now(),
  });
};

const getAccessibleStoreIdsSafe = async (userId) => {
  try {
    return await getAccessibleStoreIds(userId);
  } catch (error) {
    console.error("getAccessibleStoreIds error:", error);
    return [];
  }
};

const findRowsByUserWithFallback = async (tableName, userId) => {
  const storeIds = await getAccessibleStoreIdsSafe(userId);

  let primaryScopeResult = { data: null, error: null };

  // First try: rows linked to stores this user can access.
  if (storeIds.length > 0) {
    primaryScopeResult = await executeWithSchemaAndEmptyFallback(
      buildListQueryFallbacks(tableName, (query) =>
        query.in("store_id", storeIds),
      ),
      { continueOnUnexpectedError: true },
    );

    if (!primaryScopeResult.error) {
      return {
        data: Array.isArray(primaryScopeResult.data)
          ? primaryScopeResult.data
          : [],
        error: null,
      };
    }
  }

  // Fallback for legacy rows that predate store_id backfill.
  const result = await executeWithSchemaAndEmptyFallback(
    buildListQueryFallbacks(tableName, (query) => query.eq("user_id", userId)),
  );

  if (result.error && isSchemaCompatibilityError(result.error)) {
    return {
      data: Array.isArray(primaryScopeResult.data)
        ? primaryScopeResult.data
        : [],
      error: null,
    };
  }

  if (result.error && !primaryScopeResult.error) {
    return {
      data: Array.isArray(primaryScopeResult.data)
        ? primaryScopeResult.data
        : [],
      error: null,
    };
  }

  return {
    data: Array.isArray(result.data) ? result.data : [],
    error: result.error,
  };
};

const findRowByIdForUserWithFallback = async (tableName, userId, id) => {
  const storeIds = await getAccessibleStoreIdsSafe(userId);

  let primaryScopeResult = { data: null, error: null };

  if (storeIds.length > 0) {
    primaryScopeResult = await executeWithSchemaAndEmptyFallback(
      [
        async () =>
          supabase
            .from(tableName)
            .select()
            .eq("id", id)
            .in("store_id", storeIds)
            .maybeSingle(),
      ],
      { continueOnUnexpectedError: true },
    );

    if (!primaryScopeResult.error) {
      return { data: primaryScopeResult.data || null, error: null };
    }
  }

  const { data, error } = await executeWithSchemaAndEmptyFallback([
    async () =>
      supabase
        .from(tableName)
        .select()
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle(),
  ]);

  if (error && isSchemaCompatibilityError(error)) {
    return { data: primaryScopeResult.data || null, error: null };
  }

  if (error && !primaryScopeResult.error) {
    return { data: primaryScopeResult.data || null, error: null };
  }

  return { data: data || null, error };
};

const upsertWithFallback = async (tableName, rows, conflictCandidates = []) => {
  const builders = [];

  for (const onConflict of conflictCandidates) {
    builders.push(async () => {
      const options = {
        ignoreDuplicates: false,
      };
      if (onConflict) {
        options.onConflict = onConflict;
      }

      return await supabase.from(tableName).upsert(rows, options).select();
    });
  }

  builders.push(async () => supabase.from(tableName).insert(rows).select());
  return await executeWithSchemaFallback(builders);
};

const buildShopifyRowLookupQuery = (tableName, row) => {
  let query = supabase
    .from(tableName)
    .select("id")
    .eq("shopify_id", row.shopify_id);

  if (row.store_id) {
    query = query.eq("store_id", row.store_id);
  } else if (row.user_id) {
    query = query.eq("user_id", row.user_id);
  }

  return query;
};

const syncRowsIndividually = async (tableName, rows, itemLabel) => {
  const results = [];
  const failures = [];

  for (const row of rows) {
    try {
      const { data: existing, error: lookupError } =
        await buildShopifyRowLookupQuery(tableName, row).maybeSingle();

      if (lookupError) {
        failures.push(
          `${row.shopify_id}: lookup failed (${lookupError.message})`,
        );
        continue;
      }

      if (existing?.id) {
        const { data: updated, error: updateError } = await supabase
          .from(tableName)
          .update(row)
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) {
          failures.push(
            `${row.shopify_id}: update failed (${updateError.message})`,
          );
          continue;
        }

        results.push(updated);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from(tableName)
        .insert([row])
        .select()
        .single();

      if (insertError) {
        failures.push(
          `${row.shopify_id}: insert failed (${insertError.message})`,
        );
        continue;
      }

      results.push(inserted);
    } catch (itemError) {
      failures.push(`${row.shopify_id}: ${itemError.message}`);
    }
  }

  return {
    data: results,
    error:
      failures.length > 0
        ? {
            message: `Failed to sync ${failures.length} ${itemLabel} rows`,
            details: failures,
          }
        : null,
  };
};

const upsertRowsChunkWithFallback = async (tableName, rows, itemLabel) => {
  const upsertResult = await supabase
    .from(tableName)
    .upsert(rows, {
      onConflict: "shopify_id",
      ignoreDuplicates: false,
    })
    .select();

  if (!upsertResult.error) {
    return upsertResult;
  }

  console.warn(
    `Upsert failed for ${tableName}, falling back to per-row sync: ${upsertResult.error.message}`,
  );

  return await syncRowsIndividually(tableName, rows, itemLabel);
};

const upsertRowsWithManualFallback = async (tableName, rows, itemLabel) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { data: [], error: null };
  }

  if (rows.length <= SHOPIFY_UPSERT_BATCH_SIZE) {
    return await upsertRowsChunkWithFallback(tableName, rows, itemLabel);
  }

  const persistedRows = [];

  for (
    let startIndex = 0;
    startIndex < rows.length;
    startIndex += SHOPIFY_UPSERT_BATCH_SIZE
  ) {
    const chunk = rows.slice(
      startIndex,
      startIndex + SHOPIFY_UPSERT_BATCH_SIZE,
    );
    const chunkResult = await upsertRowsChunkWithFallback(
      tableName,
      chunk,
      itemLabel,
    );

    if (chunkResult?.error) {
      return {
        data: persistedRows,
        error: chunkResult.error,
      };
    }

    persistedRows.push(...(chunkResult?.data || []));
  }

  return {
    data: persistedRows,
    error: null,
  };
};

const findMatchingProductRow = (existingRows = [], row = {}) => {
  const normalizedShopifyId = String(row?.shopify_id || "").trim();
  if (!normalizedShopifyId) {
    return null;
  }

  const scopedRows = existingRows.filter(
    (existingRow) =>
      String(existingRow?.shopify_id || "").trim() === normalizedShopifyId,
  );

  if (scopedRows.length === 0) {
    return null;
  }

  const normalizedStoreId = String(row?.store_id || "").trim();
  if (normalizedStoreId) {
    const byStore = scopedRows.find(
      (existingRow) =>
        String(existingRow?.store_id || "").trim() === normalizedStoreId,
    );
    if (byStore) {
      return byStore;
    }
  }

  const normalizedUserId = String(row?.user_id || "").trim();
  if (normalizedUserId) {
    const byUser = scopedRows.find(
      (existingRow) =>
        String(existingRow?.user_id || "").trim() === normalizedUserId,
    );
    if (byUser) {
      return byUser;
    }
  }

  return scopedRows[0];
};

const findMatchingOrderRow = (existingRows = [], row = {}) => {
  const normalizedShopifyId = String(row?.shopify_id || "").trim();
  if (!normalizedShopifyId) {
    return null;
  }

  const scopedRows = existingRows.filter(
    (existingRow) =>
      String(existingRow?.shopify_id || "").trim() === normalizedShopifyId,
  );

  if (scopedRows.length === 0) {
    return null;
  }

  const normalizedStoreId = String(row?.store_id || "").trim();
  if (normalizedStoreId) {
    const byStore = scopedRows.find(
      (existingRow) =>
        String(existingRow?.store_id || "").trim() === normalizedStoreId,
    );
    if (byStore) {
      return byStore;
    }
  }

  const normalizedUserId = String(row?.user_id || "").trim();
  if (normalizedUserId) {
    const byUser = scopedRows.find(
      (existingRow) =>
        String(existingRow?.user_id || "").trim() === normalizedUserId,
    );
    if (byUser) {
      return byUser;
    }
  }

  return scopedRows[0];
};

const preserveLocalProductMetadataForUpserts = async (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const shopifyIds = Array.from(
    new Set(
      rows.map((row) => String(row?.shopify_id || "").trim()).filter(Boolean),
    ),
  );

  if (shopifyIds.length === 0) {
    return rows;
  }

  const { data: existingRows, error } = await supabase
    .from("products")
    .select("shopify_id, store_id, user_id, data, inventory_quantity")
    .in("shopify_id", shopifyIds);

  if (error) {
    console.warn("Product local metadata preservation skipped:", error.message);
    return rows;
  }

  return rows.map((row) => {
    const matchingRow = findMatchingProductRow(existingRows || [], row);
    if (row?.data === undefined) {
      return {
        ...row,
        inventory_quantity: matchingRow
          ? Number(matchingRow.inventory_quantity) || 0
          : 0,
      };
    }

    return {
      ...row,
      inventory_quantity: matchingRow
        ? Number(matchingRow.inventory_quantity) || 0
        : 0,
      data: matchingRow?.data
        ? preserveProductLocalMetadata(
            preserveProductInventoryData(row.data, matchingRow.data),
            matchingRow.data,
          )
        : preserveProductLocalMetadata(zeroProductInventoryData(row.data), {}),
    };
  });
};

const preserveLocalOrderMetadataForUpserts = async (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const shopifyIds = Array.from(
    new Set(
      rows.map((row) => String(row?.shopify_id || "").trim()).filter(Boolean),
    ),
  );

  if (shopifyIds.length === 0) {
    return rows;
  }

  const { data: existingRows, error } = await supabase
    .from("orders")
    .select("shopify_id, store_id, user_id, data")
    .in("shopify_id", shopifyIds);

  if (error) {
    console.warn("Order local metadata preservation skipped:", error.message);
    return rows;
  }

  return rows.map((row) => {
    const matchingRow = findMatchingOrderRow(existingRows || [], row);
    if (!matchingRow?.data || row?.data === undefined) {
      return row;
    }

    return {
      ...row,
      data: preserveOrderLocalMetadata(row.data, matchingRow.data),
    };
  });
};

export const getAccessibleStoreIds = async (userId, context = {}) => {
  if (!userId) return [];

  const inheritanceTrail = context?.inheritanceTrail || new Set();
  const normalizedUserId = String(userId || "").trim();
  if (inheritanceTrail.has(normalizedUserId)) {
    return [];
  }

  const nextTrail = new Set(inheritanceTrail);
  nextTrail.add(normalizedUserId);

  const cachedStoreIds = getCachedAccessibleStoreIds(userId);
  if (cachedStoreIds) {
    return cachedStoreIds;
  }

  try {
    // Try user_stores table first
    try {
      const { data: directAccessRows, error: directAccessError } =
        await supabase
          .from("user_stores")
          .select("store_id")
          .eq("user_id", userId);

      if (
        !directAccessError &&
        directAccessRows &&
        directAccessRows.length > 0
      ) {
        const directStoreIds = getUniqueStoreIds(directAccessRows);
        if (directStoreIds.length > 0) {
          rememberAccessibleStoreIds(userId, directStoreIds);
          return directStoreIds;
        }
      }
    } catch (userStoresError) {
      console.log("user_stores table query failed, trying fallback...");
    }

    // Fallback: stores connected directly by this user
    try {
      const { data: ownedTokenRows, error: ownedTokenError } = await supabase
        .from("shopify_tokens")
        .select("store_id")
        .eq("user_id", userId)
        .not("store_id", "is", null);

      if (!ownedTokenError && ownedTokenRows && ownedTokenRows.length > 0) {
        const ownedStoreIds = getUniqueStoreIds(ownedTokenRows);
        if (ownedStoreIds.length > 0) {
          rememberAccessibleStoreIds(userId, ownedStoreIds);
          return ownedStoreIds;
        }
      }
    } catch (tokensError) {
      console.log(
        "shopify_tokens table query failed, trying final fallback...",
      );
    }

    // Final fallback: infer stores from previously synced data owned by the user.
    try {
      const inferredResults = await Promise.all([
        supabase
          .from("products")
          .select("store_id")
          .eq("user_id", userId)
          .not("store_id", "is", null)
          .limit(20),
        supabase
          .from("orders")
          .select("store_id")
          .eq("user_id", userId)
          .not("store_id", "is", null)
          .limit(20),
        supabase
          .from("customers")
          .select("store_id")
          .eq("user_id", userId)
          .not("store_id", "is", null)
          .limit(20),
      ]);

      const inferredStoreIds = getUniqueStoreIds(
        inferredResults.flatMap((result) => result?.data || []),
      );
      if (inferredStoreIds.length > 0) {
        rememberAccessibleStoreIds(userId, inferredStoreIds);
        return inferredStoreIds;
      }
    } catch (inferenceError) {
      console.log("Store inference fallback failed:", inferenceError.message);
    }

    // Inherit store access from the account creator so secondary users work on
    // the same store data without leaking unrelated stores.
    try {
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("created_by")
        .eq("id", userId)
        .limit(1)
        .maybeSingle();

      if (!userError) {
        const creatorId = String(userRow?.created_by || "").trim();
        if (creatorId && creatorId !== normalizedUserId) {
          const inheritedStoreIds = await getAccessibleStoreIds(creatorId, {
            inheritanceTrail: nextTrail,
          });

          if (inheritedStoreIds.length > 0) {
            rememberAccessibleStoreIds(userId, inheritedStoreIds);
            return inheritedStoreIds;
          }
        }
      }
    } catch (inheritanceError) {
      console.log(
        "Creator store inheritance fallback failed:",
        inheritanceError.message,
      );
    }

    // Single-store deployments should keep shared Shopify data visible to all
    // authenticated users even if explicit user-store mappings are missing.
    try {
      const sharedStoreIds = await discoverSingleSharedStoreIds();
      if (sharedStoreIds.length === 1) {
        rememberAccessibleStoreIds(userId, sharedStoreIds);
        return sharedStoreIds;
      }
    } catch (sharedStoreError) {
      console.log(
        "Single shared store fallback failed:",
        sharedStoreError.message,
      );
    }

    return [];
  } catch (error) {
    console.error("getAccessibleStoreIds error:", error);
    return [];
  }
};

const applyUserStoreScope = async (query, userId) => {
  const storeIds = await getAccessibleStoreIds(userId);

  if (storeIds.length > 0) {
    return query.in("store_id", storeIds);
  }

  // Backward compatibility for older rows without store mapping
  return query.eq("user_id", userId);
};

export const User = {
  async create(userData) {
    return await supabase.from("users").insert([userData]).select();
  },

  async findByEmail(email) {
    return await supabase.from("users").select().eq("email", email).single();
  },

  async findById(id) {
    return await supabase.from("users").select().eq("id", id).single();
  },

  async getByShop(shop) {
    return await supabase
      .from("users")
      .select()
      .eq("shopify_shop", shop)
      .single();
  },

  async updateShopifyToken(userId, accessToken, shop) {
    return await supabase
      .from("users")
      .update({ shopify_access_token: accessToken, shopify_shop: shop })
      .eq("id", userId);
  },
};

export const Product = {
  async create(productData) {
    return await supabase.from("products").insert([productData]).select();
  },

  async findAll() {
    // Return ALL products (shared data - no user filter)
    return await supabase
      .from("products")
      .select()
      .order("created_at", sortByCreatedAtDesc);
  },

  async findByUser(userId) {
    return await findRowsByUserWithFallback("products", userId);
  },

  async findById(id) {
    return await supabase.from("products").select().eq("id", id).single();
  },

  async findByIdForUser(userId, id) {
    return await findRowByIdForUserWithFallback("products", userId, id);
  },

  async update(id, updateData) {
    return await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
  },

  async updateMultiple(products) {
    const upserts = products.map((p) => ({
      ...p,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const upsertsWithPreservedLocalMetadata =
      await preserveLocalProductMetadataForUpserts(upserts);

    return await upsertRowsWithManualFallback(
      "products",
      upsertsWithPreservedLocalMetadata,
      "product",
    );
  },
};

export const Order = {
  async create(orderData) {
    return await supabase.from("orders").insert([orderData]).select();
  },

  async findAll() {
    // Return ALL orders (shared data - no user filter)
    return await supabase
      .from("orders")
      .select()
      .order("created_at", sortByCreatedAtDesc);
  },

  async findByUser(userId) {
    return await findRowsByUserWithFallback("orders", userId);
  },

  async findById(id) {
    return await supabase.from("orders").select().eq("id", id).single();
  },

  async findByIdForUser(userId, id) {
    return await findRowByIdForUserWithFallback("orders", userId, id);
  },

  async updateMultiple(orders) {
    const upserts = orders.map((o) => ({
      ...o,
      created_at: o.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const upsertsWithPreservedLocalMetadata =
      await preserveLocalOrderMetadataForUpserts(upserts);

    return await upsertRowsWithManualFallback(
      "orders",
      upsertsWithPreservedLocalMetadata,
      "order",
    );
  },
};

export const Customer = {
  async create(customerData) {
    return await supabase.from("customers").insert([customerData]).select();
  },

  async findAll() {
    // Return ALL customers (shared data - no user filter)
    return await supabase
      .from("customers")
      .select()
      .order("created_at", sortByCreatedAtDesc);
  },

  async findByUser(userId) {
    return await findRowsByUserWithFallback("customers", userId);
  },

  async updateMultiple(customers) {
    const upserts = customers.map((c) => ({
      ...c,
      created_at: c.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    return await upsertRowsWithManualFallback("customers", upserts, "customer");
  },
};

export const ShopifyToken = {
  async save(userId, shop, accessToken, storeId) {
    // First, try to find existing token
    const { data: existingTokens } = await supabase
      .from("shopify_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("shop", shop);

    const baseRow = {
      user_id: userId,
      shop,
      access_token: accessToken,
      store_id: storeId || null,
      updated_at: new Date().toISOString(),
    };

    if (existingTokens && existingTokens.length > 0) {
      // Update existing token
      return await supabase
        .from("shopify_tokens")
        .update(baseRow)
        .eq("user_id", userId)
        .eq("shop", shop)
        .select();
    } else {
      // Insert new token
      return await supabase
        .from("shopify_tokens")
        .insert([
          {
            ...baseRow,
            created_at: new Date().toISOString(),
          },
        ])
        .select();
    }
  },

  async findByShop(shop) {
    return await supabase
      .from("shopify_tokens")
      .select()
      .eq("shop", shop)
      .single();
  },

  async findByUser(userId, storeId = null) {
    let query = supabase
      .from("shopify_tokens")
      .select("*")
      .eq("user_id", userId);

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    query = query.order("updated_at", { ascending: false }).limit(1);
    return await query.maybeSingle();
  },
};
