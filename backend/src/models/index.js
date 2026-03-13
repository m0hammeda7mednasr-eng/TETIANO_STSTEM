import { supabase } from "../supabaseClient.js";

const sortByCreatedAtDesc = { ascending: false };
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

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

const executeWithSchemaAndEmptyFallback = async (builders) => {
  let lastError = null;
  let lastData = null;

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
    if (!isSchemaCompatibilityError(error)) {
      return { data: null, error };
    }
  }

  return { data: lastData, error: lastError };
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

const getAccessibleStoreIdsSafe = async (userId) => {
  try {
    return await getAccessibleStoreIds(userId);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }
    throw error;
  }
};

const findRowsByUserWithFallback = async (tableName, userId) => {
  const storeIds = await getAccessibleStoreIdsSafe(userId);

  const builders = [];
  if (storeIds.length > 0) {
    builders.push(
      ...buildListQueryFallbacks(tableName, (query) =>
        query.in("store_id", storeIds),
      ),
    );
  }

  builders.push(
    ...buildListQueryFallbacks(tableName, (query) =>
      query.eq("user_id", userId),
    ),
  );

  builders.push(...buildListQueryFallbacks(tableName));
  const result = await executeWithSchemaAndEmptyFallback(builders);

  if (result.error && isSchemaCompatibilityError(result.error)) {
    return { data: [], error: null };
  }

  return result;
};

const findRowByIdForUserWithFallback = async (tableName, userId, id) => {
  const storeIds = await getAccessibleStoreIdsSafe(userId);

  const builders = [];
  if (storeIds.length > 0) {
    builders.push(async () =>
      supabase
        .from(tableName)
        .select()
        .eq("id", id)
        .in("store_id", storeIds)
        .maybeSingle(),
    );
  }

  builders.push(async () =>
    supabase
      .from(tableName)
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  );

  builders.push(async () =>
    supabase.from(tableName).select().eq("id", id).maybeSingle(),
  );

  const { data, error } = await executeWithSchemaAndEmptyFallback(builders);
  if (error && isSchemaCompatibilityError(error)) {
    return { data: null, error: null };
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

export const getAccessibleStoreIds = async (userId) => {
  if (!userId) return [];

  const uniqueValues = (rows) =>
    Array.from(
      new Set(
        (rows || [])
          .map((row) => row.store_id)
          .filter((value) => value !== null && value !== undefined),
      ),
    );

  const { data: directAccessRows, error: directAccessError } = await supabase
    .from("user_stores")
    .select("store_id")
    .eq("user_id", userId);

  if (directAccessError && !isSchemaCompatibilityError(directAccessError)) {
    throw directAccessError;
  }

  const directStoreIds = uniqueValues(directAccessRows);
  if (directStoreIds.length > 0) {
    return directStoreIds;
  }

  // Compatibility fallback: stores connected directly by this user.
  const { data: ownedTokenRows, error: ownedTokenError } = await supabase
    .from("shopify_tokens")
    .select("store_id")
    .eq("user_id", userId)
    .not("store_id", "is", null);

  if (ownedTokenError && !isSchemaCompatibilityError(ownedTokenError)) {
    throw ownedTokenError;
  }

  const ownedStoreIds = uniqueValues(ownedTokenRows);
  if (ownedStoreIds.length > 0) {
    return ownedStoreIds;
  }

  // Final fallback for old setups without store-user mappings.
  const { data: globalTokenRows, error: globalTokenError } = await supabase
    .from("shopify_tokens")
    .select("store_id")
    .not("store_id", "is", null);

  if (globalTokenError && !isSchemaCompatibilityError(globalTokenError)) {
    throw globalTokenError;
  }

  return uniqueValues(globalTokenRows);
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
    }));

    return await upsertWithFallback("products", upserts, [
      "shopify_id,user_id,store_id",
      "shopify_id,user_id",
      "shopify_id",
      null,
    ]);
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
    }));
    return await upsertWithFallback("orders", upserts, [
      "shopify_id,user_id,store_id",
      "shopify_id,user_id",
      "shopify_id",
      null,
    ]);
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
    }));
    return await upsertWithFallback("customers", upserts, [
      "shopify_id,user_id,store_id",
      "shopify_id,user_id",
      "shopify_id",
      null,
    ]);
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
