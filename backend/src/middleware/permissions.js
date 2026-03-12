import { supabase } from "../supabaseClient.js";

export const PERMISSION_KEYS = [
  "can_view_dashboard",
  "can_view_products",
  "can_edit_products",
  "can_view_orders",
  "can_edit_orders",
  "can_view_customers",
  "can_edit_customers",
  "can_manage_users",
  "can_manage_settings",
  "can_view_profits",
  "can_manage_tasks",
  "can_view_all_reports",
  "can_view_activity_log",
];

export const DEFAULT_PERMISSIONS = {
  can_view_dashboard: true,
  can_view_products: true,
  can_edit_products: false,
  can_view_orders: true,
  can_edit_orders: false,
  can_view_customers: true,
  can_edit_customers: false,
  can_manage_users: false,
  can_manage_settings: false,
  can_view_profits: false,
  can_manage_tasks: false,
  can_view_all_reports: false,
  can_view_activity_log: false,
};

export const normalizePermissions = (permissionsRow = null) => {
  const normalized = { ...DEFAULT_PERMISSIONS };

  if (!permissionsRow) {
    return normalized;
  }

  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(permissionsRow, key)) {
      normalized[key] = Boolean(permissionsRow[key]);
    }
  }

  return normalized;
};

export const normalizeRole = (role) => {
  if (typeof role !== "string") {
    return "user";
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === "admin") {
    return "admin";
  }

  return "user";
};

export const getUserRole = async (userId) => {
  if (!userId) {
    return null;
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (!user?.role) {
    return null;
  }

  return normalizeRole(user.role);
};

export const getUserPermissions = async (userId) => {
  if (!userId) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return normalizePermissions(permissions);
};

export const requireAdminRole = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user?.role || (await getUserRole(req.user?.id)));

    if (role !== "admin") {
      return res.status(403).json({
        error: "Access denied: admin access required",
      });
    }

    req.user.role = "admin";
    req.user.isAdmin = true;
    next();
  } catch (error) {
    console.error("Admin role check error:", error);
    res.status(500).json({ error: "Failed to validate user role" });
  }
};

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const role = normalizeRole(
        req.user?.role || (await getUserRole(req.user?.id)),
      );

      if (role === "admin") {
        req.user.role = "admin";
        req.user.isAdmin = true;
        return next();
      }

      const permissions = await getUserPermissions(req.user?.id);

      if (!permissions[permissionName]) {
        return res.status(403).json({
          error: "Access denied: insufficient permissions",
        });
      }

      req.user.role = role || "user";
      req.user.isAdmin = false;
      req.user.permissions = permissions;
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ error: "Failed to validate permissions" });
    }
  };
};

// Backward compatible aliases
export const checkPermission = requirePermission;
export const isAdmin = requireAdminRole;
