import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../utils/api";
import {
  getPermissionDescription,
  getPermissionLabel,
} from "../utils/permissionLabels";
import { extractArray } from "../utils/response";
import Sidebar from "../components/Sidebar";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  Shield,
  CheckCircle,
  XCircle,
  Save,
  X,
  FileText,
} from "lucide-react";

const POLLING_INTERVAL_MS = 30000;

const ALL_PERMISSION_KEYS = [
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

const DEFAULT_PERMISSION_STATE = {
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

const getTabFromQuery = (value) => {
  if (["users", "requests", "reports"].includes(value)) return value;
  return "users";
};

const normalizePermissions = (rawPermissions) => {
  const source = Array.isArray(rawPermissions)
    ? rawPermissions[0] || {}
    : rawPermissions || {};

  return ALL_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] =
      source[key] !== undefined ? Boolean(source[key]) : DEFAULT_PERMISSION_STATE[key];
    return acc;
  }, {});
};

const formatPermissionLabel = (key) => getPermissionLabel(key);
const formatPermissionDescription = (key) => getPermissionDescription(key);

export default function Users() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [activeTab, setActiveTab] = useState(getTabFromQuery(searchParams.get("tab")));

  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "user",
  });

  const [permissions, setPermissions] = useState({ ...DEFAULT_PERMISSION_STATE });
  const [editRole, setEditRole] = useState("user");

  const tabQueryValue = useMemo(() => getTabFromQuery(searchParams.get("tab")), [searchParams]);

  useEffect(() => {
    fetchUsers();
    fetchAccessRequests();
    fetchDailyReports();

    const interval = setInterval(() => {
      fetchUsers();
      fetchAccessRequests();
      fetchDailyReports();
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchUsers();
      fetchAccessRequests();
      fetchDailyReports();
    });

    const onFocus = () => {
      fetchUsers();
      fetchAccessRequests();
      fetchDailyReports();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    setActiveTab(tabQueryValue);
  }, [tabQueryValue]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  const fetchUsers = async () => {
    try {

      const response = await api.get("/users");


      setUsers(extractArray(response.data));
    } catch (err) {
      console.error("Error fetching users:", err);
      setMessage({
        type: "error",
        text: "فشل تحميل المستخدمين: " + getErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessRequests = async () => {
    try {
      const response = await api.get("/access-requests/all");
      setAccessRequests(extractArray(response.data));
    } catch (err) {
      console.error("Error fetching access requests:", err);
      setMessage({ type: "error", text: getErrorMessage(err) });
    }
  };

  const fetchDailyReports = async () => {
    try {
      const response = await api.get("/daily-reports/all");
      setDailyReports(extractArray(response.data));
    } catch (err) {
      console.error("Error fetching daily reports:", err);
      setMessage({ type: "error", text: getErrorMessage(err) });
    }
  };

  const handleApproveRequest = async (requestId, status, notes = "") => {
    try {
      await api.put(`/access-requests/${requestId}`, {
        status,
        admin_notes: notes,
      });
      setMessage({
        type: "success",
        text: status === "approved" ? "تم الموافقة على الطلب" : "تم رفض الطلب",
      });
      fetchAccessRequests();
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: getErrorMessage(err),
      });
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users/create", { ...newUser, permissions });
      setMessage({ type: "success", text: "تم إضافة المستخدم بنجاح" });
      setShowAddModal(false);
      setNewUser({ email: "", password: "", name: "", role: "user" });
      setPermissions({ ...DEFAULT_PERMISSION_STATE });
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: getErrorMessage(err),
      });
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${selectedUser.id}`, {
        permissions,
        role: editRole,
      });
      setMessage({ type: "success", text: "تم تحديث المستخدم بنجاح" });
      setShowEditModal(false);
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: getErrorMessage(err),
      });
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;

    try {
      await api.delete(`/users/${userId}`);
      setMessage({ type: "success", text: "تم حذف المستخدم بنجاح" });
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: getErrorMessage(err),
      });
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setPermissions(normalizePermissions(user.permissions));
    setEditRole(user.role);
    setShowEditModal(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 overflow-auto p-8">
          <div className="text-center">جاري التحميل...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                إدارة المستخدمين
              </h1>
              <p className="text-gray-600">إضافة وإدارة صلاحيات المستخدمين</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
            >
              <UserPlus size={20} />
              إضافة مستخدم جديد
            </button>
          </div>

          {/* Message */}
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

          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex gap-8">
                <button
                  onClick={() => handleTabChange("users")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "users"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UsersIcon size={18} />
                    المستخدمين ({users.length})
                  </div>
                </button>
                <button
                  onClick={() => handleTabChange("requests")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "requests"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield size={18} />
                    طلبات الصلاحيات (
                    {
                      accessRequests.filter((r) => r.status === "pending")
                        .length
                    }
                    )
                  </div>
                </button>
                <button
                  onClick={() => handleTabChange("reports")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "reports"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={18} />
                    التقارير اليومية ({dailyReports.length})
                  </div>
                </button>
              </nav>
            </div>
          </div>

          {/* Users Table */}
          {activeTab === "users" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <table className="data-table w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الاسم
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      البريد الإلكتروني
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الدور
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الحالة
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الإجراءات
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <UsersIcon size={18} className="text-gray-400" />
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {user.role === "admin" ? "مدير" : "مستخدم"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.is_active ? (
                          <CheckCircle className="text-green-600" size={20} />
                        ) : (
                          <XCircle className="text-red-600" size={20} />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded"
                          >
                            <Shield size={18} />
                          </button>
                          {user.role !== "admin" && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Access Requests Table */}
          {activeTab === "requests" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <table className="data-table w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      المستخدم
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الصلاحية المطلوبة
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      السبب
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      التاريخ
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الحالة
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      الإجراءات
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accessRequests.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        <Shield
                          size={48}
                          className="mx-auto mb-4 text-gray-300"
                        />
                        <p>لا توجد طلبات صلاحيات</p>
                      </td>
                    </tr>
                  ) : (
                    accessRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium">
                              {request.users?.name || "غير معروف"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {request.users?.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">
                              {formatPermissionLabel(request.permission_requested)}
                            </span>
                            <p className="max-w-sm text-xs leading-5 text-gray-500">
                              {formatPermissionDescription(
                                request.permission_requested,
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {request.reason}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(request.created_at).toLocaleDateString(
                            "ar-EG",
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm ${
                              request.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : request.status === "approved"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {request.status === "pending"
                              ? "قيد المراجعة"
                              : request.status === "approved"
                                ? "موافق عليه"
                                : "مرفوض"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {request.status === "pending" && (
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  handleApproveRequest(request.id, "approved")
                                }
                                className="text-green-600 hover:text-green-800 p-2 hover:bg-green-50 rounded flex items-center gap-1"
                                title="موافقة"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button
                                onClick={() =>
                                  handleApproveRequest(request.id, "rejected")
                                }
                                className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded flex items-center gap-1"
                                title="رفض"
                              >
                                <XCircle size={18} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Daily Reports Table */}
          {activeTab === "reports" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <table className="data-table w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      المستخدم
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      العنوان
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      المحتوى
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      التاريخ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dailyReports.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        <FileText
                          size={48}
                          className="mx-auto mb-4 text-gray-300"
                        />
                        <p>لا توجد تقارير يومية</p>
                      </td>
                    </tr>
                  ) : (
                    dailyReports.map((report) => (
                      <tr key={report.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium">
                              {report.users?.name || "غير معروف"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {report.users?.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-800">
                          {report.title}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-md">
                          <div className="line-clamp-2">{report.content}</div>
                          {report.attachments &&
                            report.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {report.attachments.map((file, idx) => (
                                  <a
                                    key={idx}
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1"
                                  >
                                    <FileText size={12} />
                                    {file.fileName}
                                  </a>
                                ))}
                              </div>
                            )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(report.created_at).toLocaleDateString(
                            "ar-EG",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            },
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">إضافة مستخدم جديد</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">الاسم</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  autoComplete="username"
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  autoComplete="new-password"
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">الدور</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="user">مستخدم</option>
                  <option value="admin">مدير</option>
                </select>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">الصلاحيات</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Object.keys(permissions).map((key) => (
                    <PermissionToggleCard
                      key={key}
                      label={formatPermissionLabel(key)}
                      description={formatPermissionDescription(key)}
                      checked={permissions[key]}
                      onChange={(checked) =>
                        setPermissions({
                          ...permissions,
                          [key]: checked,
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-lg"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                تعديل صلاحيات: {selectedUser.name}
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">الدور</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="user">مستخدم</option>
                  <option value="admin">مدير</option>
                </select>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">الصلاحيات</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Object.keys(permissions).map((key) => (
                    <PermissionToggleCard
                      key={key}
                      label={formatPermissionLabel(key)}
                      description={formatPermissionDescription(key)}
                      checked={permissions[key]}
                      onChange={(checked) =>
                        setPermissions({
                          ...permissions,
                          [key]: checked,
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  حفظ التغييرات
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-lg"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionToggleCard({ checked, description, label, onChange }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
        checked
          ? "border-blue-300 bg-blue-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs leading-5 text-gray-500">
          {description}
        </span>
      </span>
    </label>
  );
}
