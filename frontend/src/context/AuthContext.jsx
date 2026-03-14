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
const AUTH_REFRESH_INTERVAL_MS = 120000;
const MIN_AUTH_REFRESH_GAP_MS = 5000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Prevent race conditions using refs instead of outer module variables
  const authRefreshInFlight = useRef(false);
  const lastAuthRefreshAt = useRef(0);

  const resetAuthState = useCallback(() => {
    setUser(null);
    setPermissions({});
    setIsAdmin(false);
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

        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: resolvedRole,
        });
        setIsAdmin(resolvedRole === "admin");
        setPermissions(perms || {});
      } catch (error) {
        console.error("Failed to refresh auth state", error);

        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          resetAuthState();

          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
      } finally {
        authRefreshInFlight.current = false;
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [resetAuthState],
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
