import { describe, expect, it } from "@jest/globals";

import {
  getLineItemBookedAmount,
  getOrderFinancialStatus,
  getOrderRefundedAmount,
  isCancelledOrder,
} from "./orderAnalytics.js";

describe("helpers/orderAnalytics", () => {
  it("prefers Tetiano status over the raw Shopify financial status", () => {
    const order = {
      financial_status: "pending",
      data: {
        note_attributes: [
          {
            name: "tetiano_status",
            value: "partially_refunded",
          },
        ],
      },
    };

    expect(getOrderFinancialStatus(order)).toBe("partially_refunded");
  });

  it("derives refunded amount from current_total_price when explicit refund totals are absent", () => {
    const order = {
      total_price: 200,
      data: {
        current_total_price: 125,
      },
    };

    expect(getOrderRefundedAmount(order)).toBe(75);
  });

  it("treats refunded status without breakdown rows as a full refund", () => {
    const order = {
      total_price: 180,
      financial_status: "refunded",
      data: {},
    };

    expect(getOrderRefundedAmount(order)).toBe(180);
  });

  it("detects cancelled orders from Tetiano status metadata", () => {
    const order = {
      financial_status: "paid",
      data: {
        tags: ["tetiano_status:cancelled"],
      },
    };

    expect(isCancelledOrder(order)).toBe(true);
  });

  it("uses the discounted line total when computing booked item revenue", () => {
    const lineItem = {
      quantity: 2,
      price: "100",
      total_discount: "20",
    };

    expect(getLineItemBookedAmount(lineItem)).toBe(180);
  });
});
