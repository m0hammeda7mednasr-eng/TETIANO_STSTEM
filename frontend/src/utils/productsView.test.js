import {
  buildCatalogCounts,
  buildVariantRows,
  getNormalizedDateRange,
  getStockState,
} from "./productsView";

describe("productsView", () => {
  test("getNormalizedDateRange swaps reversed date ranges", () => {
    const result = getNormalizedDateRange("2026-03-20", "2026-03-18");

    expect(result.wasSwapped).toBe(true);
    expect(result.from.getFullYear()).toBe(2026);
    expect(result.from.getMonth()).toBe(2);
    expect(result.from.getDate()).toBe(18);
    expect(result.to.getDate()).toBe(20);
  });

  test("getStockState applies thresholds consistently", () => {
    expect(getStockState(0)).toBe("out_of_stock");
    expect(getStockState(5)).toBe("low_stock");
    expect(getStockState(10)).toBe("in_stock");
  });

  test("buildVariantRows creates a default variant row when variants are missing", () => {
    const rows = buildVariantRows(
      [
        {
          id: "product-1",
          title: "Basic Tee",
          sku: "TEE-1",
          price: 250,
          inventory_quantity: 7,
        },
      ],
      true,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].product_title).toBe("Basic Tee");
    expect(rows[0].variant_title).toBe("Default Variant");
    expect(rows[0]._meta.stockState).toBe("low_stock");
  });

  test("buildCatalogCounts keeps product totals separate from variant totals", () => {
    const variantRows = buildVariantRows(
      [
        {
          id: "product-1",
          title: "Set A",
          variants: [
            { id: "v-1", title: "Red", price: 100, inventory_quantity: 3 },
            { id: "v-2", title: "Blue", price: 100, inventory_quantity: 6 },
          ],
        },
        {
          id: "product-2",
          title: "Set B",
          variants: [{ id: "v-3", title: "Black", price: 120, inventory_quantity: 12 }],
        },
      ],
      false,
    );

    const counts = buildCatalogCounts(variantRows, variantRows.slice(0, 2));

    expect(counts.totalProducts).toBe(2);
    expect(counts.totalVariants).toBe(3);
    expect(counts.filteredProducts).toBe(1);
    expect(counts.filteredVariants).toBe(2);
  });
});
