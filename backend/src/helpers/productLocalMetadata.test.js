import { describe, expect, it } from "@jest/globals";

import {
  preserveProductInventoryData,
  zeroProductInventoryData,
} from "./productLocalMetadata.js";

describe("helpers/productLocalMetadata inventory control", () => {
  it("initializes incoming Shopify product inventory to zero", () => {
    const result = zeroProductInventoryData({
      inventory_quantity: 14,
      variants: [
        { id: "v-1", inventory_quantity: 9 },
        { id: "v-2", inventory_quantity: 5 },
      ],
    });

    expect(result.inventory_quantity).toBe(0);
    expect(result.variants).toEqual([
      expect.objectContaining({ id: "v-1", inventory_quantity: 0 }),
      expect.objectContaining({ id: "v-2", inventory_quantity: 0 }),
    ]);
  });

  it("preserves local inventory quantities when Shopify product data refreshes", () => {
    const result = preserveProductInventoryData(
      {
        inventory_quantity: 99,
        variants: [
          { id: "v-1", inventory_quantity: 40, sku: "SKU-1" },
          { id: "v-2", inventory_quantity: 59, sku: "SKU-2" },
          { id: "v-3", inventory_quantity: 10, sku: "SKU-3" },
        ],
      },
      {
        inventory_quantity: 7,
        variants: [
          { id: "v-1", inventory_quantity: 2, sku: "SKU-1" },
          { id: "v-2", inventory_quantity: 5, sku: "SKU-2" },
        ],
      },
    );

    expect(result.inventory_quantity).toBe(7);
    expect(result.variants).toEqual([
      expect.objectContaining({ id: "v-1", inventory_quantity: 2 }),
      expect.objectContaining({ id: "v-2", inventory_quantity: 5 }),
      expect.objectContaining({ id: "v-3", inventory_quantity: 0 }),
    ]);
  });
});
