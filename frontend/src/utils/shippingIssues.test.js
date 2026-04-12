import { isShippingIssueActive } from "./shippingIssues";

describe("utils/shippingIssues", () => {
  it("treats shipping issues as active by default", () => {
    expect(
      isShippingIssueActive({
        shipping_issue: {
          reason: "issue",
        },
      }),
    ).toBe(true);
  });

  it("treats shipping issues with active=false as inactive", () => {
    expect(
      isShippingIssueActive({
        shipping_issue: {
          active: false,
          reason: "cancel",
        },
        shipping_issue_reason: "cancel",
      }),
    ).toBe(false);
  });

  it("falls back to the flat reason when shipping issue metadata is missing", () => {
    expect(
      isShippingIssueActive({
        shipping_issue_reason: "issue",
      }),
    ).toBe(true);
  });
});
