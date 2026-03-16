import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import api from "../utils/api";

const AuthContext = createContext(null);
const AUTH_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MIN_AUTH_REFRESH_GAP_MS = 5000;
const DEFAULT_CLIENT_PERMISSIONS = {
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

const readJsonFromStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const buildCachedPermissions = (cachedUser, cachedPermissions) => {
  if (cachedUser?.role === "admin") {
    return Object.keys(DEFAULT_CLIENT_PERMISSIONS).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  }

  return cachedPermissions || { ...DEFAULT_CLIENT_PERMISSIONS };
};

export const AuthProvider = ({ children }) => {
  const cachedUser = readJsonFromStorage("user");
  const [user, setUser] = useState(cachedUser);
  const [permissions, setPermissions] = useState(() =>
    buildCachedPermissions(cachedUser, readJsonFromStorage("permissions")),
  );
  const [loading, setLoading] = useState(!cachedUser);
  const [isAdmin, setIsAdmin] = useState(cachedUser?.role === "admin");

  const authRefreshInFlight = useRef(false);
  const lastAuthRefreshAt = useRef(0);

  const resetAuthState = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("permissions");
    setUser(null);
    setPermissions({});
    setIsAdmin(false);
  }, []);

  const applyAuthState = useCallback((nextUser, nextPermissions) => {
    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem("permissions", JSON.stringify(nextPermissions));
    setUser(nextUser);
    setPermissions(nextPermissions);
    setIsAdmin(nextUser?.role === "admin");
  }, []);

  const loadAuthState = useCallback(
    async ({ silent = false } = {}) => {
      if (authRefreshInFlight.current) {
        return;
      }

      const now = Date.now();
      if (now - lastAuthRefreshAt.current < MIN_AUTH_REFRESH_GAP_MS) {
        return;
      }

      const token = localStorage.getItem("token");

      if (!token) {
        resetAuthState();
        if (!silent) {
          setLoading(false);
        }
        return;
      }

      try {
        authRefreshInFlight.current = true;
        lastAuthRefreshAt.current = now;

        const { data: userData } = await api.get("/users/me");

        let perms = userData?.permissions;
        if (!perms) {
          const permissionsResponse = await api.get("/users/me/permissions");
          perms = permissionsResponse.data;
        }

        const resolvedRole = String(userData?.role || "user").toLowerCase();
        const nextUser = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: resolvedRole,
        };

        applyAuthState(
          nextUser,
          perms || buildCachedPermissions(nextUser, readJsonFromStorage("permissions")),
        );
      } catch (error) {
        console.error("Failed to refresh auth state", error);

        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          resetAuthState();

          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        } else {
          const fallbackUser = readJsonFromStorage("user");
          if (fallbackUser) {
            applyAuthState(
              fallbackUser,
              buildCachedPermissions(
                fallbackUser,
                readJsonFromStorage("permissions"),
              ),
            );
          }
        }
      } finally {
        authRefreshInFlight.current = false;
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [applyAuthState, resetAuthState],
  );

  useEffect(() => {
    loadAuthState();

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      loadAuthState({ silent: true });
    }, AUTH_REFRESH_INTERVAL_MS);

    const onFocus = () => {
      loadAuthState({ silent: true });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAuthState]);

  const logout = () => {
    localStorage.removeItem("token");
    resetAuthState();
    window.location.href = "/login";
  };

  const hasPermission = (permissionName) => {
    if (isAdmin) return true;
    return Boolean(permissions[permissionName]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAdmin,
        loading,
        logout,
        hasPermission,
        refreshAuth: () => loadAuthState({ silent: true }),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
