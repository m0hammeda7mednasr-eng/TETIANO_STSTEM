import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_SHIPPING_ISSUE_REASON,
  applyOrderLocalMetadata,
  extractOrderLocalMetadata,
  mergeOrderLocalMetadata,
} from "./orderLocalMetadata.js";

describe("helpers/orderLocalMetadata", () => {
  it("extracts and preserves shipping issue metadata", () => {
    const orderData = {
      _tetiano_local_order: {
        shipping_issue: {
          reason: "courier_issue",
          updated_by_name: "Ops",
        },
      },
    };

    const metadata = extractOrderLocalMetadata(orderData);
    const applied = applyOrderLocalMetadata(orderData);

    expect(metadata.shipping_issue).toEqual(
      expect.objectContaining({
        reason: "courier_issue",
        updated_by_name: "Ops",
      }),
    );
    expect(applied._tetiano_local_order.shipping_issue.reason).toBe(
      "courier_issue",
    );
  });

  it("normalizes invalid shipping issue reasons to the default bucket", () => {
    const updated = mergeOrderLocalMetadata(
      {},
      {
        shipping_issue: {
          reason: "unknown_reason",
        },
      },
      {
        updatedAt: "2026-03-28T10:00:00.000Z",
        updatedBy: "user-1",
        updatedByName: "Ops",
      },
    );

    expect(extractOrderLocalMetadata(updated).shipping_issue).toEqual(
      expect.objectContaining({
        reason: DEFAULT_SHIPPING_ISSUE_REASON,
        updated_at: "2026-03-28T10:00:00.000Z",
        updated_by: "user-1",
        updated_by_name: "Ops",
      }),
    );
  });

  it("clears shipping issue metadata when requested", () => {
    const withIssue = mergeOrderLocalMetadata({}, {
      shipping_issue: {
        reason: "order_lost",
      },
    });
    const cleared = mergeOrderLocalMetadata(withIssue, {
      shipping_issue: null,
    });

    expect(extractOrderLocalMetadata(cleared).shipping_issue).toBeNull();
    expect(cleared._tetiano_local_order).toBeUndefined();
  });
});
