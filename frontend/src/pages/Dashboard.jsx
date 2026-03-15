import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  FileText,
  Package,
  RefreshCw,
  Shield,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import api, { getErrorMessage, shopifyAPI } from "../utils/api";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { extractArray, extractObject } from "../utils/response";
import {
  markSharedDataUpdated,
  subscribeToSharedDataUpdates,
} from "../utils/realtime";
import {
  buildStoreScopedCacheKey,
  readCachedView,
  writeCachedView,
} from "../utils/viewCache";

const CURRENCY_LABEL = "LE";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) =>
  `${toNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${CURRENCY_LABEL}`;

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatOrderTotal = (amount) =>
  `${toNumber(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${CURRENCY_LABEL}`;

const getOrderFinancialStatus = (order) => {
  return String(order.financial_status || order.status || "")
    .toLowerCase()
    .trim();
};

const PAYMENT_STATUS_STYLE = {
  paid: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  authorized: "bg-sky-100 text-sky-700 border border-sky-200",
  refunded: "bg-rose-100 text-rose-700 border border-rose-200",
  partially_refunded: "bg-orange-100 text-orange-700 border border-orange-200",
  failed: "bg-rose-100 text-rose-700 border border-rose-200",
};

const getPaymentStatusClassName = (status) => {
  const normalized = String(status || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return PAYMENT_STATUS_STYLE[normalized] || "bg-slate-100 text-slate-700 border border-slate-200";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, hasPermission, loading: authLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const canManageSettings = hasPermission("can_manage_settings");
  const canViewOrders = hasPermission("can_view_orders");
  const canManageUsers = hasPermission("can_manage_users");
  const canViewAllReports = hasPermission("can_view_all_reports");

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [stats, setStats] = useState({
    total_sales: 0,
    total_order_value: 0,
    pending_order_value: 0,
    total_orders: 0,
    total_products: 0,
    total_customers: 0,
    avg_order_value: 0,
  });
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const cacheKey = useMemo(
    () => buildStoreScopedCacheKey("dashboard:summary"),
    [],
  );

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        if (!silent) {
          setError("");
        }

        const statsPromise = api.get("/dashboard/stats");
        const ordersPromise = canViewOrders
          ? api.get(
              "/shopify/orders?limit=6&sort_by=created_at&sort_dir=desc&sync_recent=false",
            )
          : Promise.resolve({ data: [] });
        const requestsPromise =
          isAdmin || canManageUsers
            ? api.get("/access-requests/all")
            : Promise.resolve({ data: [] });
        const reportsPromise =
          isAdmin || canViewAllReports
            ? api.get("/daily-reports/all")
            : Promise.resolve({ data: [] });

        const [statsResult, ordersResult, requestsResult, reportsResult] =
          await Promise.allSettled([
            statsPromise,
            ordersPromise,
            requestsPromise,
            reportsPromise,
          ]);

        if (statsResult.status === "fulfilled") {
          setStats(extractObject(statsResult.value.data));
        } else {
          setStats({
            total_sales: 0,
            total_order_value: 0,
            pending_order_value: 0,
            total_orders: 0,
            total_products: 0,
            total_customers: 0,
            avg_order_value: 0,
          });
        }

        const ordersData =
          ordersResult.status === "fulfilled"
            ? extractArray(ordersResult.value.data)
            : [];
        const sortedOrders = [...ordersData].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        );
        setRecentOrders(sortedOrders.slice(0, 6));

        const requestsData =
          requestsResult.status === "fulfilled"
            ? extractArray(requestsResult.value.data)
            : [];
        setPendingRequests(
          requestsData.filter((item) => String(item.status) === "pending"),
        );

        const reportsData =
          reportsResult.status === "fulfilled"
            ? extractArray(reportsResult.value.data)
            : [];
        setRecentReports(
          reportsData
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5),
        );
        await writeCachedView(cacheKey, {
          stats:
            statsResult.status === "fulfilled"
              ? extractObject(statsResult.value.data)
              : {
                  total_sales: 0,
                  total_order_value: 0,
                  pending_order_value: 0,
                  total_orders: 0,
                  total_products: 0,
                  total_customers: 0,
                  avg_order_value: 0,
                },
          recentOrders: sortedOrders.slice(0, 6),
          pendingRequests: requestsData.filter(
            (item) => String(item.status) === "pending",
          ),
          recentReports: reportsData
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5),
        });

        if (!silent) {
          const firstFailure = [statsResult, ordersResult, requestsResult, reportsResult]
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason)[0];
          if (firstFailure) {
            setError(getErrorMessage(firstFailure));
          }
        }

        setLastUpdatedAt(new Date());
      } catch (requestError) {
        if (!silent) {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [cacheKey, canManageUsers, canViewAllReports, canViewOrders, isAdmin],
  );

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    (async () => {
      const cached = await readCachedView(cacheKey);
      const snapshot = cached?.value;

      if (active && snapshot) {
        setStats(snapshot.stats || {
          total_sales: 0,
          total_order_value: 0,
          pending_order_value: 0,
          total_orders: 0,
          total_products: 0,
          total_customers: 0,
          avg_order_value: 0,
        });
        setRecentOrders(Array.isArray(snapshot.recentOrders) ? snapshot.recentOrders : []);
        setPendingRequests(
          Array.isArray(snapshot.pendingRequests) ? snapshot.pendingRequests : [],
        );
        setRecentReports(Array.isArray(snapshot.recentReports) ? snapshot.recentReports : []);
        setLastUpdatedAt(
          cached?.updatedAt ? new Date(cached.updatedAt) : new Date(),
        );
        setLoading(false);
      }

      if (!active) {
        return;
      }

      await loadData({ silent: Boolean(snapshot) });
    })();

    return () => {
      active = false;
    };
  }, [authLoading, cacheKey, loadData]);

  useEffect(() => {
    if (authLoading) return;

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      loadData({ silent: true });
    });

    const onFocus = () => {
      loadData({ silent: true });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, loadData]);

  const shortcuts = useMemo(() => {
    const items = [
      {
        id: "products",
        label: "Products",
        description: "Browse and update product catalog",
        icon: Package,
        path: "/products",
        visible: hasPermission("can_view_products"),
        className: "from-indigo-500 to-indigo-700",
      },
      {
        id: "orders",
        label: "Orders",
        description: "Track payment, fulfillment, and refunds",
        icon: ShoppingCart,
        path: "/orders",
        visible: hasPermission("can_view_orders"),
        className: "from-sky-500 to-sky-700",
      },
      {
        id: "customers",
        label: "Customers",
        description: "Customer profiles, spend, and history",
        icon: Users,
        path: "/customers",
        visible: hasPermission("can_view_customers"),
        className: "from-emerald-500 to-emerald-700",
      },
      {
        id: "my-tasks",
        label: "My Tasks",
        description: "Your assigned work and follow-ups",
        icon: FileText,
        path: "/my-tasks",
        visible: !isAdmin,
        className: "from-orange-500 to-orange-700",
      },
      {
        id: "manage-team",
        label: "Team Management",
        description: "Users, roles, and permissions",
        icon: Shield,
        path: "/users?tab=users",
        visible: isAdmin || canManageUsers,
        className: "from-fuchsia-600 to-fuchsia-800",
      },
      {
        id: "access-requests",
        label: "Access Requests",
        description: `Pending now: ${pendingRequests.length}`,
        icon: UserCheck,
        path: "/users?tab=requests",
        visible: isAdmin || canManageUsers,
        className: "from-amber-500 to-amber-700",
      },
    ];

    return items.filter((item) => item.visible);
  }, [canManageUsers, hasPermission, isAdmin, pendingRequests.length]);

  const handleSync = async () => {
    if (!canManageSettings) return;

    try {
      setSyncing(true);
      setError("");
      await shopifyAPI.sync();
      markSharedDataUpdated();
      await loadData({ silent: true });
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      const backendCode = requestError.response?.data?.code;
      const backendMessage = String(requestError.response?.data?.error || "");
      const notConnected =
        backendCode === "SHOPIFY_NOT_CONNECTED" ||
        backendMessage.toLowerCase().includes("not connected");

      if (notConnected) {
        setError(
          "Shopify is not connected for this account/store. Open Settings and connect the store first.",
        );
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 p-8">Loading dashboard...</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-slate-600 mt-1">
                {isAdmin
                  ? "Central operations for users, reports, and requests"
                  : "Your shortcuts, key metrics, and latest shared updates"}
              </p>
              {lastUpdatedAt && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Clock3 size={12} />
                  Last refresh: {lastUpdatedAt.toLocaleTimeString("ar-EG")}
                </p>
              )}
            </div>

            {canManageSettings && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-sky-700 hover:bg-sky-800 text-white px-5 py-2 rounded-lg disabled:opacity-60"
              >
                <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing..." : "Sync Shopify"}
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <StatCard
              title="Net Sales"
              value={formatCurrency(stats.total_sales)}
              subtitle="Paid after refunds"
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-700"
            />
            <StatCard
              title="Order Value"
              value={formatCurrency(stats.total_order_value)}
              subtitle="All synced orders"
              icon={TrendingUp}
              color="from-amber-500 to-amber-700"
            />
            <StatCard
              title="Orders"
              value={toNumber(stats.total_orders).toLocaleString()}
              icon={ShoppingCart}
              color="from-blue-500 to-blue-700"
            />
            <StatCard
              title="Products"
              value={toNumber(stats.total_products).toLocaleString()}
              icon={Package}
              color="from-indigo-500 to-indigo-700"
            />
            <StatCard
              title="Customers"
              value={toNumber(stats.total_customers).toLocaleString()}
              icon={Users}
              color="from-cyan-500 to-cyan-700"
            />
            <StatCard
              title="Avg Order"
              value={formatCurrency(stats.avg_order_value)}
              subtitle="Net sales average"
              icon={TrendingUp}
              color="from-violet-500 to-violet-700"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shortcuts.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`bg-gradient-to-r ${item.className} rounded-xl text-white p-6 text-left hover:shadow-xl transition`}
              >
                <item.icon size={28} className="mb-3" />
                <p className="font-bold text-lg">{item.label}</p>
                <p className="text-sm text-white/90 mt-1">{item.description}</p>
              </button>
            ))}
          </div>

          {canViewOrders && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Latest Orders</h2>
                <button
                  onClick={() => navigate("/orders")}
                  className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                >
                  Open Orders
                </button>
              </div>

              {recentOrders.length === 0 ? (
                <p className="px-5 py-6 text-slate-500">No recent orders found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table w-full min-w-[720px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3">Order</th>
                        <th className="px-5 py-3">Customer</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Payment</th>
                        <th className="px-5 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50 cursor-pointer transition"
                          onClick={() => navigate(`/orders/${order.id}`)}
                        >
                          <td className="px-5 py-3.5 text-sm font-semibold text-slate-900">
                            #{order.order_number || order.shopify_id}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-700">
                            {order.customer_name || "Unknown customer"}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                            {formatOrderTotal(order.total_price)}
                          </td>
                          <td className="px-5 py-3.5 text-sm">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getPaymentStatusClassName(
                                getOrderFinancialStatus(order),
                              )}`}
                            >
                              {getOrderFinancialStatus(order) || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-600">
                            {formatDate(order.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {(isAdmin || canManageUsers || canViewAllReports) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(isAdmin || canManageUsers) && (
                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Pending Access Requests</h2>
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                      {pendingRequests.length}
                    </span>
                  </div>

                  {pendingRequests.length === 0 ? (
                    <p className="text-slate-500">No pending access requests now.</p>
                  ) : (
                    <div className="space-y-2">
                      {pendingRequests.slice(0, 4).map((item) => (
                        <div key={item.id} className="border rounded-lg px-3 py-2 text-sm">
                          <p className="font-medium text-slate-800">
                            {item.users?.name || item.user_name || "User"}
                          </p>
                          <p className="text-slate-500">{item.permission_requested}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => navigate("/users?tab=requests")}
                    className="mt-4 text-sm text-sky-700 hover:text-sky-900 font-semibold"
                  >
                    Open requests manager
                  </button>
                </div>
              )}

              {(isAdmin || canViewAllReports) && (
                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Recent Employee Reports</h2>
                    <button
                      onClick={() => navigate("/reports")}
                      className="text-sky-700 text-sm hover:text-sky-900"
                    >
                      View all
                    </button>
                  </div>

                  {recentReports.length === 0 ? (
                    <p className="text-slate-500">No recent reports.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentReports.map((item) => (
                        <div key={item.id} className="border rounded-lg px-3 py-2 text-sm">
                          <p className="font-medium text-slate-800">{item.title}</p>
                          <p className="text-slate-500">
                            {item.users?.name || item.user_name || "Employee"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(isAdmin || canManageUsers) && (
                    <button
                      onClick={() => navigate("/users?tab=users")}
                      className="mt-4 text-sm text-fuchsia-700 hover:text-fuchsia-900 font-semibold"
                    >
                      Open users and permissions
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, subtitle = "", icon: Icon, color }) {
  return (
    <div className={`bg-gradient-to-r ${color} rounded-xl text-white p-5`}>
      <div className="flex justify-between items-center gap-3">
        <div>
          <p className="text-sm text-white/90">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {subtitle ? (
            <p className="text-xs text-white/80 mt-1">{subtitle}</p>
          ) : null}
        </div>
        <Icon size={28} />
      </div>
    </div>
  );
}
