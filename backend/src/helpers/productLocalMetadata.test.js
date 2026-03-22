import { describe, expect, it } from "@jest/globals";

import {
  applyProductWarehouseInventorySnapshot,
  getProductWarehouseInventorySnapshot,
  preserveProductWarehouseData,
} from "./productLocalMetadata.js";

describe("helpers/productLocalMetadata warehouse separation", () => {
  it("keeps Shopify inventory as received while initializing local warehouse stock to zero", () => {
    const result = preserveProductWarehouseData(
      {
        inventory_quantity: 14,
        variants: [
          { id: "v-1", inventory_quantity: 9 },
          { id: "v-2", inventory_quantity: 5 },
        ],
      },
      {},
    );

    expect(result.inventory_quantity).toBe(14);
    expect(result.variants).toEqual([
      expect.objectContaining({
        id: "v-1",
        inventory_quantity: 9,
        _tetiano_warehouse_quantity: 0,
      }),
      expect.objectContaining({
        id: "v-2",
        inventory_quantity: 5,
        _tetiano_warehouse_quantity: 0,
      }),
    ]);
  });

  it("preserves local warehouse quantities when Shopify product data refreshes", () => {
    const result = preserveProductWarehouseData(
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
          {
            id: "v-1",
            inventory_quantity: 2,
            sku: "SKU-1",
            _tetiano_warehouse_quantity: 12,
          },
          {
            id: "v-2",
            inventory_quantity: 5,
            sku: "SKU-2",
            _tetiano_warehouse_quantity: 4,
          },
        ],
      },
    );

    expect(result.inventory_quantity).toBe(99);
    expect(result.variants).toEqual([
      expect.objectContaining({
        id: "v-1",
        inventory_quantity: 40,
        _tetiano_warehouse_quantity: 12,
      }),
      expect.objectContaining({
        id: "v-2",
        inventory_quantity: 59,
        _tetiano_warehouse_quantity: 4,
      }),
      expect.objectContaining({
        id: "v-3",
        inventory_quantity: 10,
        _tetiano_warehouse_quantity: 0,
      }),
    ]);
  });

  it("updates only the selected variant local warehouse stock", () => {
    const nextData = applyProductWarehouseInventorySnapshot(
      {
        variants: [
          { id: "v-1", sku: "SKU-1", inventory_quantity: 9 },
          { id: "v-2", sku: "SKU-2", inventory_quantity: 5 },
        ],
      },
      { variantId: "v-2", sku: "SKU-2" },
      {
        quantity: 7,
        last_scanned_at: "2026-03-23T10:00:00.000Z",
        last_movement_type: "in",
        last_movement_quantity: 3,
      },
    );

    expect(nextData.variants[0]).toEqual(
      expect.objectContaining({
        id: "v-1",
        inventory_quantity: 9,
      }),
    );
    expect(nextData.variants[0]).not.toHaveProperty("_tetiano_warehouse_quantity");
    expect(nextData.variants[1]).toEqual(
      expect.objectContaining({
        id: "v-2",
        inventory_quantity: 5,
        _tetiano_warehouse_quantity: 7,
        _tetiano_warehouse_last_scanned_at: "2026-03-23T10:00:00.000Z",
        _tetiano_warehouse_last_movement_type: "in",
        _tetiano_warehouse_last_movement_quantity: 3,
      }),
    );

    expect(
      getProductWarehouseInventorySnapshot(nextData, { variantId: "v-2" }),
    ).toEqual({
      quantity: 7,
      last_scanned_at: "2026-03-23T10:00:00.000Z",
      last_movement_type: "in",
      last_movement_quantity: 3,
      created_at: null,
      updated_at: "2026-03-23T10:00:00.000Z",
    });
  });
});
