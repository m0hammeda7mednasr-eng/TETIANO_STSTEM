import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const PAGE_SIZE = 1000;

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

const normalizeText = (value) => String(value || "").trim();

const countTableRows = async (tableName) => {
  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    if (String(error?.message || "").trim() === "") {
      return null;
    }
    throw error;
  }

  return count || 0;
};

const fetchAllRows = async (tableName, selectColumns, totalCount) => {
  const rows = [];
  const total = Number.isFinite(totalCount) ? totalCount : 0;

  for (let from = 0; from < total; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, total - 1);
    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));
  }

  return rows;
};

const summarizeDuplicates = (
  rows,
  keyBuilder,
  { idBuilder = (row) => row?.id || null, limit = 20 } = {},
) => {
  const groupedRows = new Map();

  for (const row of rows || []) {
    const key = normalizeText(keyBuilder(row));
    if (!key) {
      continue;
    }

    const group = groupedRows.get(key) || [];
    group.push(row);
    groupedRows.set(key, group);
  }

  const duplicates = Array.from(groupedRows.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      ids: group.map((row) => idBuilder(row)).filter(Boolean).slice(0, 10),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );

  return {
    groups: duplicates.length,
    rows: duplicates.reduce((sum, item) => sum + item.count, 0),
    sample: duplicates.slice(0, limit),
  };
};

const buildStoreScopedKey = (row, fieldName = "shopify_id") => {
  const storeId = normalizeText(row?.store_id);
  const scopedValue = normalizeText(row?.[fieldName]);

  if (!storeId || !scopedValue) {
    return "";
  }

  return `${storeId}::${scopedValue.toLowerCase()}`;
};

const main = async () => {
  const tableCounts = {
    stores: await countTableRows("stores"),
    user_stores: await countTableRows("user_stores"),
    shopify_tokens: await countTableRows("shopify_tokens"),
    orders: await countTableRows("orders"),
    products: await countTableRows("products"),
    customers: await countTableRows("customers"),
  };

  const stores = await fetchAllRows(
    "stores",
    "id,name,created_by",
    tableCounts.stores,
  );
  const userStores = await fetchAllRows(
    "user_stores",
    "user_id,store_id",
    tableCounts.user_stores || 0,
  );
  const shopifyTokens = await fetchAllRows(
    "shopify_tokens",
    "id,user_id,store_id,shop,updated_at",
    tableCounts.shopify_tokens,
  );
  const orders = await fetchAllRows(
    "orders",
    "id,store_id,user_id,shopify_id",
    tableCounts.orders,
  );
  const products = await fetchAllRows(
    "products",
    "id,store_id,user_id,shopify_id,sku",
    tableCounts.products,
  );
  const customers = await fetchAllRows(
    "customers",
    "id,store_id,user_id,shopify_id,email",
    tableCounts.customers,
  );

  const report = {
    totals: tableCounts,
    null_links: {
      orders: {
        store_id: orders.filter((row) => !normalizeText(row?.store_id)).length,
        user_id: orders.filter((row) => !normalizeText(row?.user_id)).length,
      },
      products: {
        store_id: products.filter((row) => !normalizeText(row?.store_id)).length,
        user_id: products.filter((row) => !normalizeText(row?.user_id)).length,
      },
      customers: {
        store_id: customers.filter((row) => !normalizeText(row?.store_id)).length,
        user_id: customers.filter((row) => !normalizeText(row?.user_id)).length,
      },
      shopify_tokens: {
        store_id: shopifyTokens.filter((row) => !normalizeText(row?.store_id)).length,
        user_id: shopifyTokens.filter((row) => !normalizeText(row?.user_id)).length,
      },
    },
    duplicates: {
      orders_store_shopify: summarizeDuplicates(orders, (row) =>
        buildStoreScopedKey(row, "shopify_id"),
      ),
      products_store_shopify: summarizeDuplicates(products, (row) =>
        buildStoreScopedKey(row, "shopify_id"),
      ),
      products_store_sku: summarizeDuplicates(products, (row) =>
        buildStoreScopedKey(row, "sku"),
      ),
      customers_store_shopify: summarizeDuplicates(customers, (row) =>
        buildStoreScopedKey(row, "shopify_id"),
      ),
      customers_store_email: summarizeDuplicates(customers, (row) =>
        buildStoreScopedKey(row, "email"),
      ),
      shopify_tokens_store_id: summarizeDuplicates(shopifyTokens, (row) =>
        normalizeText(row?.store_id),
      ),
      shopify_tokens_user_shop: summarizeDuplicates(shopifyTokens, (row) => {
        const userId = normalizeText(row?.user_id);
        const shop = normalizeText(row?.shop).toLowerCase();
        return userId && shop ? `${userId}::${shop}` : "";
      }),
      user_stores_user_store: summarizeDuplicates(
        userStores,
        (row) => {
          const userId = normalizeText(row?.user_id);
          const storeId = normalizeText(row?.store_id);
          return userId && storeId ? `${userId}::${storeId}` : "";
        },
        {
          idBuilder: (row) => `${normalizeText(row?.user_id)}:${normalizeText(row?.store_id)}`,
        },
      ),
      stores_name: summarizeDuplicates(stores, (row) =>
        normalizeText(row?.name).toLowerCase(),
      ),
    },
  };

  console.log(JSON.stringify(report, null, 2));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
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
  });
