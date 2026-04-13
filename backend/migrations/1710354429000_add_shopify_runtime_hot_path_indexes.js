/* eslint-disable camelcase */

exports.shorthands = undefined;

const quoteList = (values) => values.map((value) => `'${value}'`).join(", ");

const createGuardedIndexSql = ({
  tableName,
  indexName,
  requiredColumns,
  definition,
}) => `
  DO $$
  BEGIN
    IF to_regclass('public.${tableName}') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = '${tableName}'
           AND column_name IN (${quoteList(requiredColumns)})
         GROUP BY table_name
         HAVING COUNT(*) = ${requiredColumns.length}
       ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS ${indexName} ${definition}';
    END IF;
  END $$;
`;

const createOptionalUniqueShopifyStoreIndexSql = ({ tableName, indexName }) => `
  DO $$
  BEGIN
    IF to_regclass('public.${tableName}') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = '${tableName}'
           AND column_name IN ('shopify_id', 'store_id')
         GROUP BY table_name
         HAVING COUNT(*) = 2
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.${tableName}
         WHERE shopify_id IS NOT NULL
           AND store_id IS NOT NULL
         GROUP BY shopify_id, store_id
         HAVING COUNT(*) > 1
         LIMIT 1
       ) THEN
      EXECUTE '
        CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
        ON public.${tableName} (shopify_id, store_id)
      ';
    END IF;
  END $$;
`;

const dropIndexSql = (indexName) =>
  `DROP INDEX IF EXISTS public.${indexName};`;

const guardedIndexes = [
  {
    tableName: "orders",
    indexName: "idx_orders_shopify_store_lookup",
    requiredColumns: ["shopify_id", "store_id"],
    definition: "ON public.orders (shopify_id, store_id)",
  },
  {
    tableName: "orders",
    indexName: "idx_orders_shopify_user_lookup",
    requiredColumns: ["shopify_id", "user_id"],
    definition: "ON public.orders (shopify_id, user_id)",
  },
  {
    tableName: "orders",
    indexName: "idx_orders_store_unfulfilled_created_at",
    requiredColumns: ["store_id", "fulfillment_status", "created_at"],
    definition:
      "ON public.orders (store_id, created_at DESC) WHERE fulfillment_status IS NULL OR fulfillment_status <> 'fulfilled'",
  },
  {
    tableName: "orders",
    indexName: "idx_orders_user_unfulfilled_created_at",
    requiredColumns: ["user_id", "fulfillment_status", "created_at"],
    definition:
      "ON public.orders (user_id, created_at DESC) WHERE fulfillment_status IS NULL OR fulfillment_status <> 'fulfilled'",
  },
  {
    tableName: "orders",
    indexName: "idx_orders_store_updated_at",
    requiredColumns: ["store_id", "updated_at"],
    definition: "ON public.orders (store_id, updated_at DESC)",
  },
  {
    tableName: "orders",
    indexName: "idx_orders_user_updated_at",
    requiredColumns: ["user_id", "updated_at"],
    definition: "ON public.orders (user_id, updated_at DESC)",
  },
  {
    tableName: "products",
    indexName: "idx_products_shopify_store_lookup",
    requiredColumns: ["shopify_id", "store_id"],
    definition: "ON public.products (shopify_id, store_id)",
  },
  {
    tableName: "products",
    indexName: "idx_products_shopify_user_lookup",
    requiredColumns: ["shopify_id", "user_id"],
    definition: "ON public.products (shopify_id, user_id)",
  },
  {
    tableName: "customers",
    indexName: "idx_customers_shopify_store_lookup",
    requiredColumns: ["shopify_id", "store_id"],
    definition: "ON public.customers (shopify_id, store_id)",
  },
  {
    tableName: "customers",
    indexName: "idx_customers_shopify_user_lookup",
    requiredColumns: ["shopify_id", "user_id"],
    definition: "ON public.customers (shopify_id, user_id)",
  },
  {
    tableName: "order_comments",
    indexName: "idx_order_comments_order_created_at",
    requiredColumns: ["order_id", "created_at"],
    definition: "ON public.order_comments (order_id, created_at ASC)",
  },
  {
    tableName: "sync_operations",
    indexName: "idx_sync_operations_type_created_at",
    requiredColumns: ["operation_type", "created_at"],
    definition: "ON public.sync_operations (operation_type, created_at DESC)",
  },
  {
    tableName: "sync_operations",
    indexName: "idx_sync_operations_entity_type_created_at",
    requiredColumns: ["entity_id", "operation_type", "created_at"],
    definition:
      "ON public.sync_operations (entity_id, operation_type, created_at DESC)",
  },
  {
    tableName: "shopify_tokens",
    indexName: "idx_shopify_tokens_shop_updated_at_hot_path",
    requiredColumns: ["shop", "updated_at"],
    definition: "ON public.shopify_tokens (shop, updated_at DESC)",
  },
  {
    tableName: "shopify_credentials",
    indexName: "idx_shopify_credentials_user_id",
    requiredColumns: ["user_id"],
    definition: "ON public.shopify_credentials (user_id)",
  },
  {
    tableName: "stores",
    indexName: "idx_stores_name",
    requiredColumns: ["name"],
    definition: "ON public.stores (name)",
  },
];

const optionalUniqueIndexes = [
  {
    tableName: "orders",
    indexName: "idx_orders_shopify_store_unique",
  },
  {
    tableName: "products",
    indexName: "idx_products_shopify_store_unique",
  },
  {
    tableName: "customers",
    indexName: "idx_customers_shopify_store_unique",
  },
];

exports.up = (pgm) => {
  guardedIndexes.forEach((indexConfig) => {
    pgm.sql(createGuardedIndexSql(indexConfig));
  });

  optionalUniqueIndexes.forEach((indexConfig) => {
    pgm.sql(createOptionalUniqueShopifyStoreIndexSql(indexConfig));
  });
};

exports.down = (pgm) => {
  [...optionalUniqueIndexes]
    .reverse()
    .forEach(({ indexName }) => pgm.sql(dropIndexSql(indexName)));

  [...guardedIndexes]
    .reverse()
    .forEach(({ indexName }) => pgm.sql(dropIndexSql(indexName)));
};
