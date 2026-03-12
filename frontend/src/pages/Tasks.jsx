import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import api, { getErrorMessage } from "../utils/api";
import { extractArray } from "../utils/response";
import {
  markSharedDataUpdated,
  subscribeToSharedDataUpdates,
} from "../utils/realtime";

const POLLING_INTERVAL_MS = 30000;
let assigneesEndpointUnsupported = false;
let assigneesProbeInFlight = false;

const EMPTY_FORM = {
  title: "",
  description: "",
  assigned_to: "",
  priority: "medium",
  due_date: "",
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [assigneesEndpointAvailable, setAssigneesEndpointAvailable] = useState(
    !assigneesEndpointUnsupported,
  );

  const loadPageData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const shouldUseAssigneesEndpoint =
        assigneesEndpointAvailable &&
        !assigneesEndpointUnsupported &&
        !assigneesProbeInFlight;

      const assigneesRequest = shouldUseAssigneesEndpoint
        ? (() => {
            assigneesProbeInFlight = true;
            return api
              .get("/tasks/assignees")
              .finally(() => {
                assigneesProbeInFlight = false;
              });
          })()
        : api.get("/users");

      const [tasksResult, assigneesResult] = await Promise.allSettled([
        api.get("/tasks"),
        assigneesRequest,
      ]);

      if (tasksResult.status === "fulfilled") {
        setTasks(extractArray(tasksResult.value.data));
      } else if (!silent) {
        setTasks([]);
        setMessage({ type: "error", text: getErrorMessage(tasksResult.reason) });
      }

      if (assigneesResult.status === "fulfilled") {
        setUsers(extractArray(assigneesResult.value.data));
      } else {
        const status = assigneesResult.reason?.response?.status;

        // Older backend may not have /tasks/assignees yet.
        if (assigneesEndpointAvailable && (status === 404 || status === 500)) {
          assigneesEndpointUnsupported = true;
          setAssigneesEndpointAvailable(false);
          try {
            const fallbackUsersResponse = await api.get("/users");
            setUsers(extractArray(fallbackUsersResponse.data));
          } catch {
            setUsers([]);
          }
        } else {
          setUsers([]);
        }

        if (!silent && status !== 403) {
          setMessage({
            type: "error",
            text: "Unable to load assignable users list",
          });
        }
      }
    } catch (error) {
      if (!silent) {
        setMessage({ type: "error", text: getErrorMessage(error) });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [assigneesEndpointAvailable]);

  useEffect(() => {
    loadPageData();

    const interval = setInterval(() => {
      loadPageData({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      loadPageData({ silent: true });
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [loadPageData]);

  const groupedTasks = useMemo(
    () => ({
      pending: tasks.filter((item) => item.status === "pending"),
      in_progress: tasks.filter((item) => item.status === "in_progress"),
      completed: tasks.filter((item) => item.status === "completed"),
    }),
    [tasks],
  );

  const resetModalState = () => {
    setEditingTask(null);
    setFormData(EMPTY_FORM);
    setFiles([]);
  };

  const openCreateModal = () => {
    resetModalState();
    setShowModal(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title || "",
      description: task.description || "",
      assigned_to: task.assigned_to || "",
      priority: task.priority || "medium",
      due_date: task.due_date ? task.due_date.split("T")[0] : "",
    });
    setFiles([]);
    setShowModal(true);
  };

  const uploadTaskFiles = async (taskId, fileList) => {
    if (!fileList || fileList.length === 0) return;

    const payload = new FormData();
    fileList.forEach((file) => payload.append("files", file));
    await api.post(`/tasks/${taskId}/attachments`, payload, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, formData);
        await uploadTaskFiles(editingTask.id, files);
        setMessage({ type: "success", text: "تم تحديث المهمة بنجاح" });
      } else {
        const { data } = await api.post("/tasks", formData);
        await uploadTaskFiles(data.id, files);
        setMessage({ type: "success", text: "تم إنشاء المهمة بنجاح" });
      }

      setShowModal(false);
      resetModalState();
      markSharedDataUpdated();
      await loadPageData();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("هل أنت متأكد من حذف المهمة؟")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      markSharedDataUpdated();
      setMessage({ type: "success", text: "تم حذف المهمة بنجاح" });
      await loadPageData();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await api.put(`/tasks/${taskId}`, { status });
      markSharedDataUpdated();
      await loadPageData();
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">إدارة المهام</h1>
            <p className="text-slate-600 mt-1">إنشاء المهام وتوزيعها ومتابعة تنفيذها</p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-sky-700 hover:bg-sky-800 text-white px-5 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} />
            مهمة جديدة
          </button>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TaskColumn
            title="قيد الانتظار"
            icon={Clock}
            color="text-yellow-600"
            tasks={groupedTasks.pending}
            onEdit={openEditModal}
            onDelete={handleDeleteTask}
            onStatusChange={handleStatusChange}
          />
          <TaskColumn
            title="قيد التنفيذ"
            icon={AlertCircle}
            color="text-blue-600"
            tasks={groupedTasks.in_progress}
            onEdit={openEditModal}
            onDelete={handleDeleteTask}
            onStatusChange={handleStatusChange}
          />
          <TaskColumn
            title="مكتملة"
            icon={CheckCircle}
            color="text-emerald-600"
            tasks={groupedTasks.completed}
            onEdit={openEditModal}
            onDelete={handleDeleteTask}
            onStatusChange={handleStatusChange}
          />
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingTask ? "تعديل المهمة" : "مهمة جديدة"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">العنوان</label>
                <input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">الوصف</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">المكلّف</label>
                  <select
                    value={formData.assigned_to}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        assigned_to: e.target.value,
                      }))
                    }
                    required
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">اختر مستخدم</option>
                    {users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">الأولوية</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        priority: e.target.value,
                      }))
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                    <option value="urgent">عاجلة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        due_date: e.target.value,
                      }))
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  مرفقات المهمة
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full border rounded-lg px-3 py-2"
                />
                {files.length > 0 && (
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {files.map((file, index) => (
                      <p key={`${file.name}-${index}`}>- {file.name}</p>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg flex items-center justify-center gap-2"
              >
                <Save size={18} />
                حفظ
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskColumn({ title, icon: Icon, color, tasks, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className={`text-lg font-bold mb-3 flex items-center gap-2 ${color}`}>
        <Icon size={18} />
        {title} ({tasks.length})
      </h2>
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const priorityClass = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-sky-100 text-sky-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };

  return (
    <div className="border rounded-lg p-3 bg-slate-50">
      <div className="flex justify-between items-start gap-2">
        <h3 className="font-semibold text-slate-900">{task.title}</h3>
        <span className={`text-xs px-2 py-1 rounded-full ${priorityClass[task.priority] || priorityClass.medium}`}>
          {task.priority}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-slate-600 mt-2 line-clamp-2">{task.description}</p>
      )}

      <div className="text-xs text-slate-600 mt-2 space-y-1">
        <p className="flex items-center gap-1">
          <User size={12} />
          {task.assigned_to_user?.name || "-"}
        </p>
        {task.due_date && (
          <p className="flex items-center gap-1">
            <Calendar size={12} />
            {new Date(task.due_date).toLocaleDateString("ar-EG")}
          </p>
        )}
      </div>

      {Array.isArray(task.attachments) && task.attachments.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
            <Paperclip size={12} />
            المرفقات ({task.attachments.length})
          </p>
          <div className="mt-1 space-y-1">
            {task.attachments.slice(0, 3).map((item) => (
              <a
                key={item.id}
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-700 hover:text-sky-900 flex items-center gap-1"
              >
                <Upload size={11} />
                {item.file_name}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-sm"
        >
          <option value="pending">pending</option>
          <option value="in_progress">in_progress</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </select>

        <button
          onClick={() => onEdit(task)}
          className="px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200"
        >
          <Edit size={14} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
