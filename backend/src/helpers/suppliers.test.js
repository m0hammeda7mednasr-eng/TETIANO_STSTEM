import { describe, expect, it } from "@jest/globals";

import {
  buildSupplierDetail,
  buildSupplierList,
  sanitizeDeliveryPayload,
  sanitizePaymentPayload,
  sanitizeSupplierPayload,
} from "./suppliers.js";

describe("helpers/suppliers", () => {
  it("normalizes supplier fields and opening balance", () => {
    expect(
      sanitizeSupplierPayload({
        name: "  Modern Supplier  ",
        code: "  MOD-1 ",
        opening_balance: "125.456",
      }),
    ).toEqual(
      expect.objectContaining({
        name: "Modern Supplier",
        code: "MOD-1",
        opening_balance: 125.46,
      }),
    );
  });

  it("builds delivery payload items and amount from line totals", () => {
    expect(
      sanitizeDeliveryPayload({
        items: [
          {
            product_name: "Black Dress",
            sku: "BLK-01",
            material: "Cotton",
            quantity: 2,
            unit_cost: 150,
          },
          {
            product_name: "Red Dress",
            sku: "RED-02",
            material: "Linen",
            quantity: 1,
            unit_cost: 90,
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        amount: 390,
        items: [
          expect.objectContaining({ total_cost: 300 }),
          expect.objectContaining({ total_cost: 90 }),
        ],
      }),
    );
  });

  it("normalizes payment payload amount and method", () => {
    expect(
      sanitizePaymentPayload({
        amount: "500",
        payment_method: " wallet ",
      }),
    ).toEqual(
      expect.objectContaining({
        amount: 500,
        payment_method: "wallet",
      }),
    );
  });

  it("computes supplier balances, payments, and received items", () => {
    const supplier = {
      id: "supplier-1",
      name: "Modern Supplier",
      opening_balance: 100,
      is_active: true,
    };
    const entries = [
      {
        id: "delivery-1",
        supplier_id: "supplier-1",
        entry_type: "delivery",
        entry_date: "2026-03-05",
        amount: 300,
        items: [
          {
            product_name: "Black Dress",
            sku: "BLK-01",
            material: "Cotton",
            quantity: 2,
            unit_cost: 150,
            total_cost: 300,
          },
        ],
      },
      {
        id: "payment-1",
        supplier_id: "supplier-1",
        entry_type: "payment",
        entry_date: "2026-03-06",
        amount: 180,
      },
    ];

    const detail = buildSupplierDetail(supplier, entries);

    expect(detail.total_deliveries).toBe(300);
    expect(detail.total_payments).toBe(180);
    expect(detail.outstanding_balance).toBe(220);
    expect(detail.received_items_count).toBe(1);
    expect(detail.received_quantity).toBe(2);
    expect(detail.last_payment_at).toBe("2026-03-06");
  });

  it("builds a sorted supplier list with summaries", () => {
    const suppliers = [
      { id: "supplier-2", name: "Beta", is_active: false, opening_balance: 0 },
      { id: "supplier-1", name: "Alpha", is_active: true, opening_balance: 0 },
    ];
    const entries = [
      {
        id: "payment-1",
        supplier_id: "supplier-1",
        entry_type: "payment",
        entry_date: "2026-03-06",
        amount: 80,
      },
    ];

    const list = buildSupplierList(suppliers, entries);

    expect(list[0].name).toBe("Alpha");
    expect(list[0].payments_count).toBe(1);
    expect(list[1].name).toBe("Beta");
  });
});
