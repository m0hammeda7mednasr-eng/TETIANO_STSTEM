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
import {
  getPermissionDescription,
  getPermissionLabel,
} from "../utils/permissionLabels";
import { extractArray } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const REQUESTABLE_PERMISSIONS = [
  { value: "can_view_products", label: getPermissionLabel("can_view_products") },
  { value: "can_edit_products", label: getPermissionLabel("can_edit_products") },
  { value: "can_view_orders", label: getPermissionLabel("can_view_orders") },
  { value: "can_edit_orders", label: getPermissionLabel("can_edit_orders") },
  { value: "can_view_customers", label: getPermissionLabel("can_view_customers") },
  { value: "can_edit_customers", label: getPermissionLabel("can_edit_customers") },
  { value: "can_manage_settings", label: getPermissionLabel("can_manage_settings") },
  { value: "can_manage_tasks", label: getPermissionLabel("can_manage_tasks") },
  { value: "can_view_all_reports", label: getPermissionLabel("can_view_all_reports") },
  { value: "can_view_activity_log", label: getPermissionLabel("can_view_activity_log") },
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
      setRequests(extractArray(response.data));
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

  const handleSubmit = async (event) => {
    event.preventDefault();

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
      <main className="flex-1 space-y-6 overflow-auto p-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">طلب صلاحية</h1>
          <p className="mt-1 text-slate-600">
            اطلب الصلاحية التي تحتاجها، وسيتم مراجعتها من الإدارة.
          </p>
        </div>

        {message.text ? (
          <div
            className={`rounded-lg border px-4 py-3 ${
              message.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Shield size={18} />
              طلب جديد
            </h2>

            <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-800">
              صلاحيات الموردين ضمن صلاحيات المنتجات. إذا أردت الدخول إلى الموردين أو تعديلهم،
              اختر صلاحية المنتجات المناسبة من القائمة.
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                تفاصيل الصلاحيات
              </p>
              <div className="mt-3 grid gap-3">
                {REQUESTABLE_PERMISSIONS.map((permission) => (
                  <div
                    key={permission.value}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {permission.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {getPermissionDescription(permission.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">الصلاحية المطلوبة</label>
                <select
                  value={formData.permission_requested}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      permission_requested: event.target.value,
                    }))
                  }
                  required
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="">اختر الصلاحية</option>
                  {REQUESTABLE_PERMISSIONS.map((permission) => (
                    <option key={permission.value} value={permission.value}>
                      {permission.label}
                    </option>
                  ))}
                </select>
                {formData.permission_requested ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {getPermissionDescription(formData.permission_requested)}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">سبب الطلب</label>
                <textarea
                  value={formData.reason}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  required
                  rows={4}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 py-3 text-white hover:bg-sky-800"
              >
                <Send size={16} />
                إرسال الطلب
              </button>
            </form>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold">الطلبات السابقة</h2>
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="py-6 text-center text-slate-500">لا توجد طلبات بعد</div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="font-medium">
                        {getPermissionLabel(request.permission_requested)}
                      </p>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-sm text-slate-600">{request.reason}</p>
                    {request.admin_notes ? (
                      <p className="mt-2 text-xs text-slate-500">
                        ملاحظة الإدارة: {request.admin_notes}
                      </p>
                    ) : null}
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
  const styles = {
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

  const value = styles[status] || {
    label: status || "غير معروف",
    icon: AlertCircle,
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${value.className}`}
    >
      <value.icon size={12} />
      {value.label}
    </span>
  );
}
