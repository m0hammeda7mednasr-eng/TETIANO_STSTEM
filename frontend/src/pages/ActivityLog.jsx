import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import Sidebar from "../components/Sidebar";
import { Clock, User, List } from "lucide-react";
import { format } from "date-fns";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const POLLING_INTERVAL_MS = 30000;

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [filters, setFilters] = useState({ entity_type: "" });

  const fetchLogs = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        }

        const response = await api.get("/activity-log", { params: filters });
        setLogs(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        if (!silent) {
          console.error("Error fetching activity log:", err);
          setMessage({
            type: "error",
            text: err.response?.data?.error || "Failed to load activity log",
          });
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchLogs();

    const interval = setInterval(() => {
      fetchLogs({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchLogs({ silent: true });
    });

    const onFocus = () => fetchLogs({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchLogs]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Activity Log</h1>
          <p className="text-gray-600">Track system changes across entities.</p>
        </div>

        {message.text && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "error"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-green-50 text-green-800 border border-green-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <List size={20} className="text-gray-600" />
            <select
              name="entity_type"
              value={filters.entity_type}
              onChange={handleFilterChange}
              className="flex-1 px-4 py-2 border rounded-lg"
            >
              <option value="">All entities</option>
              <option value="product">Product</option>
              <option value="order">Order</option>
              <option value="customer">Customer</option>
              <option value="operational_cost">Operational Cost</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Clock size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No records found</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    Date
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    User
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    Action
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(new Date(log.created_at), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-gray-500" />
                        <div>
                          <p className="font-medium">{log.user?.name || log.user?.email}</p>
                          <p className="text-xs text-gray-400">{log.user_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          log.action === "product_update"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <p>
                        <strong className="font-semibold">{log.entity_type}:</strong>{" "}
                        {log.entity_name || log.entity_id}
                      </p>
                      {log.details && (
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
