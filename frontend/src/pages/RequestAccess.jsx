import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  Shield,
  XCircle,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import api, { getErrorMessage } from "../utils/api";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const REQUESTABLE_PERMISSIONS = [
  { value: "can_view_products", label: "عرض المنتجات" },
  { value: "can_edit_products", label: "تعديل المنتجات" },
  { value: "can_view_orders", label: "عرض الطلبات" },
  { value: "can_edit_orders", label: "تعديل الطلبات" },
  { value: "can_view_customers", label: "عرض العملاء" },
  { value: "can_edit_customers", label: "تعديل العملاء" },
  { value: "can_manage_settings", label: "إدارة الإعدادات" },
  { value: "can_manage_tasks", label: "إدارة المهام" },
  { value: "can_view_all_reports", label: "عرض جميع التقارير" },
  { value: "can_view_activity_log", label: "عرض سجل النشاط" },
];

const POLLING_INTERVAL_MS = 30000;

export default function RequestAccess() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [formData, setFormData] = useState({
    permission_requested: "",
    reason: "",
  });

  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const response = await api.get("/access-requests/my-requests");
      setRequests(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      if (!silent) {
        setMessage({ type: "error", text: getErrorMessage(error) });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchRequests();

    const interval = setInterval(() => {
      fetchRequests({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchRequests({ silent: true });
    });

    const onFocus = () => fetchRequests({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchRequests]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/access-requests", formData);
      setMessage({
        type: "success",
        text: "تم إرسال طلب الصلاحية بنجاح",
      });
      setFormData({ permission_requested: "", reason: "" });
      await fetchRequests();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 p-8">جاري التحميل...</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">طلب صلاحية</h1>
          <p className="text-slate-600 mt-1">أرسل طلب الصلاحية وسيتم مراجعته من الإدارة</p>
        </div>

        {message.text && (
          <div
            className={`px-4 py-3 rounded-lg ${
              message.type === "error"
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-emerald-50 border border-emerald-200 text-emerald-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield size={18} />
              طلب جديد
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">الصلاحية المطلوبة</label>
                <select
                  value={formData.permission_requested}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      permission_requested: e.target.value,
                    }))
                  }
                  required
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">اختر الصلاحية</option>
                  {REQUESTABLE_PERMISSIONS.map((perm) => (
                    <option key={perm.value} value={perm.value}>
                      {perm.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">سبب الطلب</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  required
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-sky-700 hover:bg-sky-800 text-white py-3 rounded-lg flex items-center justify-center gap-2"
              >
                <Send size={16} />
                إرسال الطلب
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold mb-4">طلبات سابقة</h2>
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="text-slate-500 text-center py-6">لا توجد طلبات بعد</div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium">
                        {
                          REQUESTABLE_PERMISSIONS.find(
                            (perm) => perm.value === request.permission_requested,
                          )?.label || request.permission_requested
                        }
                      </p>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-sm text-slate-600">{request.reason}</p>
                    {request.admin_notes && (
                      <p className="text-xs text-slate-500 mt-2">
                        ملاحظة الإدارة: {request.admin_notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: {
      label: "قيد المراجعة",
      icon: Clock,
      className: "bg-yellow-100 text-yellow-800",
    },
    approved: {
      label: "موافق عليه",
      icon: CheckCircle,
      className: "bg-emerald-100 text-emerald-800",
    },
    rejected: {
      label: "مرفوض",
      icon: XCircle,
      className: "bg-red-100 text-red-800",
    },
  };

  const value = map[status] || {
    label: status || "unknown",
    icon: AlertCircle,
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${value.className}`}>
      <value.icon size={12} />
      {value.label}
    </span>
  );
}
