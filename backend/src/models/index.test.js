import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let tableData = {};
let executedQueries = [];
let queryFailures = [];

const matchesFilters = (row, filters = []) =>
  filters.every((filter) => {
    if (filter.type === "eq") {
      return row?.[filter.column] === filter.value;
    }

    if (filter.type === "in") {
      return filter.values.includes(row?.[filter.column]);
    }

    if (filter.type === "not") {
      if (filter.operator === "is" && filter.value === null) {
        return row?.[filter.column] !== null && row?.[filter.column] !== undefined;
      }
    }

    return true;
  });

const resolveRows = (table, filters = []) => {
  const rows = tableData[table] || [];
  return rows.filter((row) => matchesFilters(row, filters));
};

const findMatchingFailure = (table, filters = [], mode) =>
  queryFailures.find((failure) => {
    if (failure.table !== table) {
      return false;
    }

    if (failure.mode && failure.mode !== mode) {
      return false;
    }

    return (failure.filters || []).every((expectedFilter) =>
      filters.some(
        (actualFilter) =>
          actualFilter.type === expectedFilter.type &&
          actualFilter.column === expectedFilter.column,
      ),
    );
  });

const createQueryBuilder = (table) => {
  const state = {
    table,
    filters: [],
    orderBy: null,
  };

  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn((column, options) => {
      state.orderBy = { column, options };
      return builder;
    }),
    limit: jest.fn(() => builder),
    eq: jest.fn((column, value) => {
      state.filters.push({ type: "eq", column, value });
      return builder;
    }),
    in: jest.fn((column, values) => {
      state.filters.push({ type: "in", column, values });
      return builder;
    }),
    not: jest.fn((column, operator, value) => {
      state.filters.push({ type: "not", column, operator, value });
      return builder;
    }),
    maybeSingle: jest.fn(async () => {
      executedQueries.push({
        table: state.table,
        filters: [...state.filters],
        orderBy: state.orderBy,
        mode: "maybeSingle",
      });
      const failure = findMatchingFailure(
        state.table,
        state.filters,
        "maybeSingle",
      );
      if (failure) {
        return { data: null, error: failure.error };
      }
      const rows = resolveRows(state.table, state.filters);
      return { data: rows[0] || null, error: null };
    }),
    then: (resolve, reject) => {
      executedQueries.push({
        table: state.table,
        filters: [...state.filters],
        orderBy: state.orderBy,
        mode: "list",
      });
      const failure = findMatchingFailure(state.table, state.filters, "list");
      if (failure) {
        return Promise.resolve({
          data: null,
          error: failure.error,
        }).then(resolve, reject);
      }
      return Promise.resolve({
        data: resolveRows(state.table, state.filters),
        error: null,
      }).then(resolve, reject);
    },
  };

  return builder;
};

const supabaseMock = {
  from: jest.fn((table) => createQueryBuilder(table)),
};

jest.unstable_mockModule("../supabaseClient.js", () => ({
  supabase: supabaseMock,
}));

const { Product, getAccessibleStoreIds } = await import("./index.js");

describe("models/index Shopify scoping", () => {
  beforeEach(() => {
    tableData = {
      stores: [],
      users: [],
      user_stores: [],
      shopify_tokens: [],
      products: [],
      orders: [],
      customers: [],
    };
    executedQueries = [];
    queryFailures = [];
    supabaseMock.from.mockClear();
  });

  it("falls back to user-scoped product lists only when no shared store scope can be discovered", async () => {
    tableData.products = [
      { id: "product-1", shopify_id: "shopify-1", user_id: "owner-1" },
      { id: "product-2", shopify_id: "shopify-2", user_id: "owner-2" },
    ];

    const result = await Product.findByUser("employee-1");

    expect(result).toEqual({ data: [], error: null });

    const productQueries = executedQueries.filter(
      (query) => query.table === "products",
    );

    expect(productQueries.length).toBeGreaterThan(0);
    expect(
      productQueries.some((query) =>
        query.filters.some(
          (filter) =>
            filter.type === "eq" &&
            filter.column === "user_id" &&
            filter.value === "employee-1",
        ),
      ),
    ).toBe(true);
    expect(
      productQueries.some((query) => query.filters.length === 0),
    ).toBe(false);
  });

  it("does not fall back to unscoped Shopify product lookup by id", async () => {
    tableData.products = [
      { id: "product-1", shopify_id: "shopify-1", user_id: "owner-1" },
    ];

    const result = await Product.findByIdForUser("employee-1", "product-1");

    expect(result).toEqual({ data: null, error: null });

    const productQueries = executedQueries.filter(
      (query) => query.table === "products",
    );

    const lookupQuery = productQueries.find(
      (query) => query.mode === "maybeSingle",
    );

    expect(lookupQuery).toBeDefined();
    expect(lookupQuery.filters).toEqual(
      expect.arrayContaining([
        { type: "eq", column: "id", value: "product-1" },
        { type: "eq", column: "user_id", value: "employee-1" },
      ]),
    );
    expect(
      productQueries.some(
        (query) =>
          query.mode === "maybeSingle" &&
          query.filters.length === 1 &&
          query.filters[0].column === "id",
      ),
    ).toBe(false);
  });

  it("falls back to legacy user-scoped product lists when store-scoped queries fail", async () => {
    tableData.user_stores = [
      { user_id: "employee-1", store_id: "store-1" },
    ];
    tableData.products = [
      { id: "legacy-product", shopify_id: "legacy-1", user_id: "employee-1" },
    ];
    queryFailures = [
      {
        table: "products",
        mode: "list",
        filters: [{ type: "in", column: "store_id" }],
        error: { message: "statement timeout" },
      },
    ];

    const result = await Product.findByUser("employee-1");

    expect(result).toEqual({
      data: [
        { id: "legacy-product", shopify_id: "legacy-1", user_id: "employee-1" },
      ],
      error: null,
    });
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "list" &&
          query.filters.some(
            (filter) =>
              filter.type === "in" && filter.column === "store_id",
          ),
      ),
    ).toBe(true);
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "list" &&
          query.filters.some(
            (filter) =>
              filter.type === "eq" &&
              filter.column === "user_id" &&
              filter.value === "employee-1",
          ),
      ),
    ).toBe(true);
  });

  it("falls back to legacy user-scoped product lookup when store-scoped lookup fails", async () => {
    tableData.user_stores = [
      { user_id: "employee-1", store_id: "store-1" },
    ];
    tableData.products = [
      { id: "legacy-product", shopify_id: "legacy-1", user_id: "employee-1" },
    ];
    queryFailures = [
      {
        table: "products",
        mode: "maybeSingle",
        filters: [{ type: "in", column: "store_id" }],
        error: { message: "statement timeout" },
      },
    ];

    const result = await Product.findByIdForUser("employee-1", "legacy-product");

    expect(result).toEqual({
      data: { id: "legacy-product", shopify_id: "legacy-1", user_id: "employee-1" },
      error: null,
    });
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "maybeSingle" &&
          query.filters.some(
            (filter) =>
              filter.type === "eq" &&
              filter.column === "user_id" &&
              filter.value === "employee-1",
          ),
      ),
    ).toBe(true);
  });

  it("inherits store access from the creator account when explicit user-store mappings are missing", async () => {
    tableData.users = [
      { id: "employee-1", created_by: "admin-1" },
      { id: "admin-1", created_by: null },
    ];
    tableData.user_stores = [{ user_id: "admin-1", store_id: "store-1" }];

    const storeIds = await getAccessibleStoreIds("employee-1");

    expect(storeIds).toEqual(["store-1"]);
  });

  it("falls back to the single shared store when no explicit mapping exists", async () => {
    tableData.stores = [{ id: "store-1" }];

    const storeIds = await getAccessibleStoreIds("shared-store-user");

    expect(storeIds).toEqual(["store-1"]);
  });

  it("does not guess a store when multiple shared stores exist", async () => {
    tableData.stores = [{ id: "store-1" }, { id: "store-2" }];

    const storeIds = await getAccessibleStoreIds("multi-store-user");

    expect(storeIds).toEqual([]);
  });

  it("returns creator store products for employees without leaking unrelated legacy rows", async () => {
    tableData.users = [
      { id: "employee-1", created_by: "admin-1" },
      { id: "admin-1", created_by: null },
    ];
    tableData.user_stores = [{ user_id: "admin-1", store_id: "store-1" }];
    tableData.products = [
      {
        id: "shared-product",
        shopify_id: "shared-1",
        store_id: "store-1",
        user_id: "owner-1",
      },
      {
        id: "legacy-product",
        shopify_id: "legacy-1",
        user_id: "employee-1",
      },
    ];

    const result = await Product.findByUser("employee-1");

    expect(result).toEqual({
      data: [
        {
          id: "shared-product",
          shopify_id: "shared-1",
          store_id: "store-1",
          user_id: "owner-1",
        },
      ],
      error: null,
    });
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "list" &&
          query.filters.some(
            (filter) =>
              filter.type === "in" &&
              filter.column === "store_id" &&
              filter.values.includes("store-1"),
          ),
      ),
    ).toBe(true);
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "list" &&
          query.filters.some(
            (filter) =>
              filter.type === "eq" &&
              filter.column === "user_id" &&
              filter.value === "employee-1",
          ),
      ),
    ).toBe(false);
  });

  it("returns shared-store products for unmapped users when the deployment has exactly one store", async () => {
    tableData.stores = [{ id: "store-1" }];
    tableData.products = [
      {
        id: "shared-product",
        shopify_id: "shared-1",
        store_id: "store-1",
        user_id: "owner-1",
      },
    ];

    const result = await Product.findByUser("shared-store-products-user");

    expect(result).toEqual({
      data: [
        {
          id: "shared-product",
          shopify_id: "shared-1",
          store_id: "store-1",
          user_id: "owner-1",
        },
      ],
      error: null,
    });
  });

  it("does not fall back to legacy user-scoped rows when store access exists but the store has no matching products", async () => {
    tableData.users = [
      { id: "employee-1", created_by: "admin-1" },
      { id: "admin-1", created_by: null },
    ];
    tableData.user_stores = [{ user_id: "admin-1", store_id: "store-1" }];
    tableData.products = [
      {
        id: "legacy-product",
        shopify_id: "legacy-1",
        user_id: "employee-1",
      },
    ];

    const result = await Product.findByUser("employee-1");

    expect(result).toEqual({ data: [], error: null });
    expect(
      executedQueries.some(
        (query) =>
          query.table === "products" &&
          query.mode === "list" &&
          query.filters.some(
            (filter) =>
              filter.type === "eq" &&
              filter.column === "user_id" &&
              filter.value === "employee-1",
          ),
      ),
    ).toBe(false);
  });
});
