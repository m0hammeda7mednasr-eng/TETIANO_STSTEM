import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import api from "../../utils/api";
import { formatDateTime, formatNumber } from "../../utils/helpers";
import { extractArray } from "../../utils/response";
import { subscribeToSharedDataUpdates } from "../../utils/realtime";
import {
  Activity,
  AlertCircle,
  FileText,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";

const POLLING_INTERVAL_MS = 120000;
const ACTIVITY_LOG_PREVIEW_LIMIT = 12;

const getTotalFromResponse = (payload) => {
  const parsed = Number(payload?.total);
  return Number.isFinite(parsed) ? parsed : extractArray(payload).length;
};

const AdminPage = () => {
  const navigate = useNavigate();
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);

  const fetchAdminData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      const [logsResult, requestsResult, usersResult] = await Promise.allSettled([
        api.get("/activity-log", {
          params: {
            limit: ACTIVITY_LOG_PREVIEW_LIMIT,
          },
        }),
        api.get("/access-requests/all", {
          params: {
            status: "pending",
            limit: 1,
            include_count: true,
          },
        }),
        api.get("/users", {
          params: {
            compact: true,
            limit: 1,
            include_count: true,
          },
        }),
      ]);

      if (logsResult.status === "fulfilled") {
        setActivityLogs(extractArray(logsResult.value.data));
      } else if (!silent) {
        setError("Failed to load activity logs");
      }

      if (requestsResult.status === "fulfilled") {
        setPendingRequestsCount(getTotalFromResponse(requestsResult.value.data));
      }

      if (usersResult.status === "fulfilled") {
        setUsersCount(getTotalFromResponse(usersResult.value.data));
      }
    } catch (requestError) {
      if (!silent) {
        console.error("Error fetching admin data:", requestError);
        setError("Failed to load admin dashboard data");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAdminData();

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      fetchAdminData({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchAdminData({ silent: true });
    });

    const onFocus = () => fetchAdminData({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchAdminData]);

  const getActionColor = (action) => {
    switch (action) {
      case "create":
      case "created":
        return "bg-green-100 text-green-800";
      case "update":
      case "updated":
        return "bg-blue-100 text-blue-800";
      case "delete":
      case "deleted":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getActionIcon = (entityType) => {
    switch (entityType) {
      case "user":
        return <Users size={16} />;
      case "task":
      case "report":
        return <FileText size={16} />;
      default:
        return <Activity size={16} />;
    }
  };

  const formatDate = (dateString) =>
    formatDateTime(dateString, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Admin Dashboard</h1>
            <p className="text-slate-600">
              Manage users, permission requests, and activity logs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AdminCard
              title="Users Management"
              value={formatNumber(usersCount, {
                maximumFractionDigits: 0,
              })}
              subtitle="Accounts, roles, and permissions"
              icon={Shield}
              onClick={() => navigate("/users?tab=users")}
              color="from-fuchsia-600 to-fuchsia-800"
            />
            <AdminCard
              title="Access Requests"
              value={formatNumber(pendingRequestsCount, {
                maximumFractionDigits: 0,
              })}
              subtitle="Pending requests"
              icon={UserCheck}
              onClick={() => navigate("/users?tab=requests")}
              color="from-amber-500 to-amber-700"
            />
            <AdminCard
              title="Employee Reports"
              value="-"
              subtitle="Daily report oversight"
              icon={FileText}
              onClick={() => navigate("/reports")}
              color="from-sky-600 to-sky-800"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Activity size={22} className="text-sky-600" />
                Activity Log
              </h2>
              <button
                onClick={() => fetchAdminData()}
                className="text-sm text-sky-700 hover:text-sky-900"
              >
                Refresh
              </button>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="text-center py-10 text-slate-500">Loading...</div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Activity size={46} className="mx-auto text-slate-300 mb-3" />
                  No activity records
                </div>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">{getActionIcon(log.entity_type)}</div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-semibold ${getActionColor(
                                  log.action,
                                )}`}
                              >
                                {log.action}
                              </span>
                              <span className="text-xs text-slate-500">{log.entity_type}</span>
                            </div>
                            <p className="text-slate-800 font-medium">
                              {log.entity_name || "Unknown entity"}
                            </p>
                            {log.details && (
                              <p className="text-sm text-slate-600 mt-1">
                                {typeof log.details === "string"
                                  ? log.details
                                  : JSON.stringify(log.details)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

function AdminCard({ title, value, subtitle, icon: Icon, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-r ${color} rounded-xl p-5 text-right text-white hover:shadow-xl transition`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/90 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <p className="text-xs text-white/90 mt-2">{subtitle}</p>
        </div>
        <Icon size={24} />
      </div>
    </button>
  );
}

export default AdminPage;
