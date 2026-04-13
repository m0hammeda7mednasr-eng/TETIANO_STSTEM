import { supabase } from "../supabaseClient.js";
import {
  isTransientSupabaseError,
  withSupabaseRetry,
} from "../helpers/supabaseRetry.js";
import { runSupabaseQueryWithTimeout } from "../helpers/supabaseQueryTimeout.js";

export const PERMISSION_KEYS = [
  "can_view_dashboard",
  "can_view_products",
  "can_edit_products",
  "can_view_warehouse",
  "can_edit_warehouse",
  "can_view_suppliers",
  "can_edit_suppliers",
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
  "can_print_barcode_labels",
];

export const DEFAULT_PERMISSIONS = {
  can_view_dashboard: true,
  can_view_products: true,
  can_edit_products: false,
  can_view_warehouse: true,
  can_edit_warehouse: false,
  can_view_suppliers: false,
  can_edit_suppliers: false,
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
  can_print_barcode_labels: true,
};

const PERMISSION_FALLBACK_KEYS = {
  can_view_warehouse: ["can_view_products"],
  can_edit_warehouse: ["can_edit_products"],
};

const USER_ACCESS_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS = Math.max(
  500,
  Number(process.env.ACCESS_CONTEXT_QUERY_TIMEOUT_MS) || 1500,
);
const userAccessCache = new Map();

const getUserAccessCacheKey = (userId) => String(userId || "").trim();

const getCachedUserAccessContext = (userId) => {
  const cacheKey = getUserAccessCacheKey(userId);
  if (!cacheKey) {
    return null;
  }

  const cachedEntry = userAccessCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.updatedAt > USER_ACCESS_CACHE_TTL_MS) {
    userAccessCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
};

const rememberUserAccessContext = (userId, nextValue = {}) => {
  const cacheKey = getUserAccessCacheKey(userId);
  if (!cacheKey) {
    return null;
  }

  const previousValue = getCachedUserAccessContext(cacheKey) || {};
  const value = {
    ...previousValue,
    ...nextValue,
  };

  userAccessCache.set(cacheKey, {
    value,
    updatedAt: Date.now(),
  });

  return value;
};

export const primeUserAccessContext = (userId, nextValue = {}) =>
  rememberUserAccessContext(userId, nextValue);

export const clearUserAccessContextCache = () => {
  userAccessCache.clear();
};

export const normalizePermissions = (permissionsRow = null) => {
  const normalized = { ...DEFAULT_PERMISSIONS };

  if (!permissionsRow) {
    return normalized;
  }

  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(permissionsRow, key)) {
      normalized[key] = Boolean(permissionsRow[key]);
      continue;
    }

    const fallbackKeys = PERMISSION_FALLBACK_KEYS[key] || [];
    const fallbackKey = fallbackKeys.find((candidateKey) =>
      Object.prototype.hasOwnProperty.call(permissionsRow, candidateKey),
    );

    if (fallbackKey) {
      normalized[key] = Boolean(permissionsRow[fallbackKey]);
    }
  }

  return normalized;
};

export const buildPermissionsForRole = (role, permissionsRow = null) => {
  const normalizedRole = normalizeRole(role);
  const normalizedPermissions = normalizePermissions(permissionsRow);

  if (normalizedRole !== "admin") {
    return normalizedPermissions;
  }

  for (const key of PERMISSION_KEYS) {
    normalizedPermissions[key] = true;
  }

  return normalizedPermissions;
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

const runAccessContextQuery = (
  query,
  {
    timeoutMs = DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS,
    code = "ACCESS_CONTEXT_QUERY_TIMEOUT",
  } = {},
) =>
  runSupabaseQueryWithTimeout(query, {
    timeoutMs,
    code,
  });

export const getUserRole = async (
  userId,
  { retryOptions = undefined, timeoutMs = DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS } = {},
) => {
  if (!userId) {
    return null;
  }

  const cachedContext = getCachedUserAccessContext(userId);
  if (cachedContext?.role) {
    return cachedContext.role;
  }

  const { data: user, error } = await withSupabaseRetry(
    () =>
      runAccessContextQuery(
        supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .limit(1)
          .maybeSingle(),
        {
          timeoutMs,
          code: "USER_ROLE_QUERY_TIMEOUT",
        },
      ),
    retryOptions,
  );

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (!user?.role) {
    return null;
  }

  const normalizedRole = normalizeRole(user.role);
  rememberUserAccessContext(userId, { role: normalizedRole });
  return normalizedRole;
};

export const getUserPermissions = async (
  userId,
  { retryOptions = undefined, timeoutMs = DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS } = {},
) => {
  if (!userId) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const cachedContext = getCachedUserAccessContext(userId);
  if (cachedContext?.permissions) {
    return cachedContext.permissions;
  }

  const { data: permissions, error } = await withSupabaseRetry(
    () =>
      runAccessContextQuery(
        supabase
          .from("permissions")
          .select("*")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle(),
        {
          timeoutMs,
          code: "USER_PERMISSIONS_QUERY_TIMEOUT",
        },
      ),
    retryOptions,
  );

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const normalizedPermissions = normalizePermissions(permissions);
  rememberUserAccessContext(userId, { permissions: normalizedPermissions });
  return normalizedPermissions;
};

export const requireAdminRole = async (req, res, next) => {
  try {
    const role = normalizeRole(
      req.user?.role || (await getUserRole(req.user?.id)),
    );

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
    res.status(isTransientSupabaseError(error) ? 503 : 500).json({
      error: isTransientSupabaseError(error)
        ? "User role validation is temporarily unavailable"
        : "Failed to validate user role",
    });
  }
};

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(
        String(req.method || "").toUpperCase(),
      );
      const retryOptions = isSafeMethod
        ? { attempts: 1 }
        : { attempts: 2, baseDelayMs: 150 };
      const timeoutMs = isSafeMethod
        ? DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS
        : Math.max(DEFAULT_ACCESS_CONTEXT_QUERY_TIMEOUT_MS, 3000);
      const role = normalizeRole(
        req.user?.role ||
          (await getUserRole(req.user?.id, {
            retryOptions,
            timeoutMs,
          })),
      );

      if (role === "admin") {
        const adminPermissions = buildPermissionsForRole("admin");
        req.user.role = "admin";
        req.user.isAdmin = true;
        req.user.permissions = adminPermissions;
        primeUserAccessContext(req.user?.id, {
          role: "admin",
          permissions: adminPermissions,
        });
        return next();
      }

      const permissions = await getUserPermissions(req.user?.id, {
        retryOptions,
        timeoutMs,
      });

      if (!permissions[permissionName]) {
        return res.status(403).json({
          error: "Access denied: insufficient permissions",
        });
      }

      req.user.role = role || "user";
      req.user.isAdmin = false;
      req.user.permissions = permissions;
      primeUserAccessContext(req.user?.id, {
        role: role || "user",
        permissions,
      });
      next();
    } catch (error) {
      const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(
        String(req.method || "").toUpperCase(),
      );
      if (isSafeMethod && isTransientSupabaseError(error)) {
        const fallbackRole = normalizeRole(req.user?.role || "user");
        const fallbackPermissions = buildPermissionsForRole(fallbackRole);

        if (!fallbackPermissions[permissionName]) {
          return res.status(403).json({
            error: "Access denied: insufficient permissions",
          });
        }

        req.user.role = fallbackRole;
        req.user.isAdmin = fallbackRole === "admin";
        req.user.permissions = fallbackPermissions;
        primeUserAccessContext(req.user?.id, {
          role: fallbackRole,
          permissions: fallbackPermissions,
        });
        return next();
      }

      console.error("Permission check error:", error);
      res.status(isTransientSupabaseError(error) ? 503 : 500).json({
        error: isTransientSupabaseError(error)
          ? "Permission validation is temporarily unavailable"
          : "Failed to validate permissions",
      });
    }
  };
};

// Backward compatible aliases
export const checkPermission = requirePermission;
export const isAdmin = requireAdminRole;
