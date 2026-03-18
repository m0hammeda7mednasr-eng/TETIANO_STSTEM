import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { ProductUpdateService } from "./productUpdateService.js";
import { Product } from "../models/index.js";

describe("ProductUpdateService", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("updates single-variant SKU locally and forwards it to Shopify sync", async () => {
    const product = {
      id: "product-1",
      title: "Classic Dress",
      price: 150,
      cost_price: 90,
      inventory_quantity: 4,
      sku: "OLD-SKU",
      data: {
        variants: [
          {
            id: "variant-1",
            price: "150",
            sku: "OLD-SKU",
            inventory_quantity: 4,
          },
        ],
      },
    };

    const updateSpy = jest
      .spyOn(Product, "update")
      .mockResolvedValue({ error: null });

    jest.spyOn(Product, "findByIdForUser").mockResolvedValue({
      data: product,
      error: null,
    });
    jest
      .spyOn(ProductUpdateService, "syncToShopify")
      .mockResolvedValue({ success: true });
    jest
      .spyOn(ProductUpdateService, "logSyncOperation")
      .mockResolvedValue(undefined);
    jest
      .spyOn(ProductUpdateService, "logActivity")
      .mockImplementation(() => {});

    await ProductUpdateService.updateProduct("user-1", "product-1", {
      price: 175,
      inventory: 7,
      sku: "NEW-SKU",
    });

    expect(updateSpy).toHaveBeenCalledWith(
      "product-1",
      expect.objectContaining({
        price: 175,
        sku: "NEW-SKU",
        inventory_quantity: 7,
        pending_sync: true,
        data: expect.objectContaining({
          variants: [
            expect.objectContaining({
              id: "variant-1",
              price: "175",
              sku: "NEW-SKU",
              inventory_quantity: 7,
            }),
          ],
        }),
      }),
    );

    expect(ProductUpdateService.syncToShopify).toHaveBeenCalledWith(
      "user-1",
      "product-1",
      expect.objectContaining({
        price: 175,
        inventory_quantity: 7,
        sku: "NEW-SKU",
      }),
    );
  });

  it("updates per-variant SKU, price, and inventory for multi-variant products", async () => {
    const product = {
      id: "product-2",
      title: "Modern Shirt",
      price: 250,
      inventory_quantity: 8,
      sku: "BLUE-S",
      data: {
        variants: [
          {
            id: "variant-blue",
            price: "250",
            sku: "BLUE-S",
            inventory_quantity: 5,
          },
          {
            id: "variant-black",
            price: "260",
            sku: "BLACK-M",
            inventory_quantity: 3,
          },
        ],
      },
    };

    const updateSpy = jest
      .spyOn(Product, "update")
      .mockResolvedValue({ error: null });

    jest.spyOn(Product, "findByIdForUser").mockResolvedValue({
      data: product,
      error: null,
    });
    jest
      .spyOn(ProductUpdateService, "syncToShopify")
      .mockResolvedValue({ success: true });
    jest
      .spyOn(ProductUpdateService, "logSyncOperation")
      .mockResolvedValue(undefined);
    jest
      .spyOn(ProductUpdateService, "logActivity")
      .mockImplementation(() => {});

    const variantUpdates = [
      {
        id: "variant-blue",
        price: 275,
        sku: "BLUE-L",
        inventory_quantity: 2,
      },
      {
        id: "variant-black",
        price: 280,
        sku: "BLACK-L",
        inventory_quantity: 1,
      },
    ];

    await ProductUpdateService.updateProduct("user-1", "product-2", {
      variant_updates: variantUpdates,
    });

    expect(updateSpy).toHaveBeenCalledWith(
      "product-2",
      expect.objectContaining({
        price: 275,
        sku: "BLUE-L",
        inventory_quantity: 3,
        pending_sync: true,
        data: expect.objectContaining({
          variants: [
            expect.objectContaining({
              id: "variant-blue",
              price: "275",
              sku: "BLUE-L",
              inventory_quantity: 2,
            }),
            expect.objectContaining({
              id: "variant-black",
              price: "280",
              sku: "BLACK-L",
              inventory_quantity: 1,
            }),
          ],
        }),
      }),
    );

    expect(ProductUpdateService.syncToShopify).toHaveBeenCalledWith(
      "user-1",
      "product-2",
      expect.objectContaining({
        variant_updates: variantUpdates,
      }),
    );
  });

  it("stores supplier phone and location locally without triggering Shopify sync", async () => {
    const product = {
      id: "product-3",
      title: "Soft Linen Shirt",
      price: 180,
      cost_price: 95,
      inventory_quantity: 6,
      sku: "LINEN-001",
      data: {
        variants: [
          {
            id: "variant-3",
            price: "180",
            sku: "LINEN-001",
            inventory_quantity: 6,
          },
        ],
      },
    };

    const updateSpy = jest
      .spyOn(Product, "update")
      .mockResolvedValue({ error: null });

    jest.spyOn(Product, "findByIdForUser").mockResolvedValue({
      data: product,
      error: null,
    });
    jest
      .spyOn(ProductUpdateService, "syncToShopify")
      .mockResolvedValue({ success: true });
    jest
      .spyOn(ProductUpdateService, "logSyncOperation")
      .mockResolvedValue(undefined);
    jest
      .spyOn(ProductUpdateService, "logActivity")
      .mockImplementation(() => {});

    const result = await ProductUpdateService.updateProduct(
      "user-1",
      "product-3",
      {
        supplier_phone: "01012345678",
        supplier_location: "Nasr City Warehouse",
      },
    );

    expect(updateSpy).toHaveBeenCalledWith(
      "product-3",
      expect.objectContaining({
        pending_sync: false,
        sync_error: null,
        data: expect.objectContaining({
          _tetiano_local_product: expect.objectContaining({
            supplier_phone: "01012345678",
            supplier_location: "Nasr City Warehouse",
          }),
        }),
      }),
    );

    expect(ProductUpdateService.syncToShopify).not.toHaveBeenCalled();
    expect(ProductUpdateService.logSyncOperation).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        shopifySync: "not_needed",
        localOnlyFields: expect.arrayContaining([
          "supplier_phone",
          "supplier_location",
        ]),
      }),
    );
  });
});
