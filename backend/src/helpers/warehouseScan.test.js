import { describe, expect, it } from "@jest/globals";

import {
  buildMirroredInventoryRow,
  calculateScannedQuantity,
  resolveTrackedWarehouseQuantity,
} from "./warehouseScan.js";

describe("helpers/warehouseScan", () => {
  it("calculates stock in and stock out quantities", () => {
    expect(
      calculateScannedQuantity({
        currentQuantity: 4,
        movementType: "in",
        quantity: 3,
      }),
    ).toBe(7);

    expect(
      calculateScannedQuantity({
        currentQuantity: 9,
        movementType: "out",
        quantity: 2,
      }),
    ).toBe(7);
  });

  it("falls back to live product inventory when tracked warehouse stock would go negative", () => {
    expect(
      resolveTrackedWarehouseQuantity({
        currentWarehouseQuantity: 0,
        movementType: "out",
        quantity: 1,
        fallbackQuantity: 6,
      }),
    ).toBe(6);
  });

  it("builds a mirrored inventory row for product-only scanner mode", () => {
    expect(
      buildMirroredInventoryRow({
        product: {
          store_id: "store-1",
          product_id: "product-1",
          warehouse_code: "SKU-1",
        },
        quantity: 8,
        scannedAt: "2026-03-22T10:00:00.000Z",
        movementType: "in",
        movementQuantity: 2,
      }),
    ).toEqual({
      id: null,
      store_id: "store-1",
      product_id: "product-1",
      sku: "SKU-1",
      quantity: 8,
      last_scanned_at: "2026-03-22T10:00:00.000Z",
      last_movement_type: "in",
      last_movement_quantity: 2,
      created_at: null,
      updated_at: null,
    });
  });
});
