import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("../supabaseClient.js", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.unstable_mockModule("../helpers/supabaseRetry.js", () => ({
  isTransientSupabaseError: jest.fn(() => false),
  withSupabaseRetry: jest.fn((callback) => callback()),
}));

const { buildPermissionsForRole, normalizePermissions } = await import(
  "./permissions.js"
);

describe("middleware/permissions warehouse access", () => {
  it("falls back warehouse permissions to product permissions when warehouse columns are missing", () => {
    const permissions = normalizePermissions({
      can_view_products: false,
      can_edit_products: true,
    });

    expect(permissions.can_view_products).toBe(false);
    expect(permissions.can_edit_products).toBe(true);
    expect(permissions.can_view_warehouse).toBe(false);
    expect(permissions.can_edit_warehouse).toBe(true);
  });

  it("preserves explicit warehouse permissions when they are present", () => {
    const permissions = normalizePermissions({
      can_view_products: false,
      can_edit_products: true,
      can_view_warehouse: true,
      can_edit_warehouse: false,
    });

    expect(permissions.can_view_warehouse).toBe(true);
    expect(permissions.can_edit_warehouse).toBe(false);
  });

  it("grants warehouse permissions to admins automatically", () => {
    const permissions = buildPermissionsForRole("admin");

    expect(permissions.can_view_warehouse).toBe(true);
    expect(permissions.can_edit_warehouse).toBe(true);
  });
});
