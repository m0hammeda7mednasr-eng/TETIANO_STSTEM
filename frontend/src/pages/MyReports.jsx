import { useCallback, useEffect, useState } from "react";
import { Calendar, Edit, Paperclip, Plus, Save, Trash2, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import api, { getErrorMessage } from "../utils/api";
import { extractArray } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const DEFAULT_FORM = {
  title: "",
  description: "",
  tasks_completed: "",
  notes: "",
  report_date: new Date().toISOString().split("T")[0],
};

const POLLING_INTERVAL_MS = 30000;
const MIN_REPORTS_FETCH_GAP_MS = 5000;

let reportsFetchInFlight = false;
let lastReportsFetchAt = 0;

const getAttachmentUrl = (file) => file?.url || file?.file_url || "";
const getAttachmentName = (file) =>
  file?.fileName || file?.file_name || file?.name || "attachment";
const normalizeAttachment = (file) => ({
  fileName: getAttachmentName(file),
  url: getAttachmentUrl(file),
  storagePath: file?.storagePath || file?.storage_path || null,
  size: Number(file?.size ?? file?.size_bytes ?? 0) || 0,
  mimeType: file?.mimeType || file?.mime_type || file?.type || "",
});
const normalizeAttachments = (attachments) =>
  Array.isArray(attachments)
    ? attachments
        .map((file) => normalizeAttachment(file))
        .filter((file) => Boolean(file.url))
    : [];

export default function MyReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });

  const fetchReports = useCallback(async ({ silent = false } = {}) => {
    if (reportsFetchInFlight) {
      return;
    }

    const now = Date.now();
    if (now - lastReportsFetchAt < MIN_REPORTS_FETCH_GAP_MS) {
      return;
    }

    try {
      reportsFetchInFlight = true;
      lastReportsFetchAt = now;

      if (!silent) {
        setLoading(true);
      }

      const response = await api.get("/daily-reports/my-reports");
      setReports(extractArray(response.data));
    } catch (error) {
      if (!silent) {
        setMessage({ type: "error", text: getErrorMessage(error) });
      }
    } finally {
      reportsFetchInFlight = false;
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchReports();

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      fetchReports({ silent: true });
    }, POLLING_INTERVAL_MS);

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchReports({ silent: true });
    });

    const onFocus = () => fetchReports({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchReports]);

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setExistingAttachments([]);
    setNewFiles([]);
    setEditingReport(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (report) => {
    setEditingReport(report);
    setFormData({
      title: report.title || "",
      description: report.description || "",
      tasks_completed: report.tasks_completed || "",
      notes: report.notes || "",
      report_date: report.report_date
        ? report.report_date.split("T")[0]
        : DEFAULT_FORM.report_date,
    });
    setExistingAttachments(normalizeAttachments(report.attachments));
    setNewFiles([]);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = new FormData();
      payload.append("title", formData.title);
      payload.append("description", formData.description);
      payload.append("tasks_completed", formData.tasks_completed);
      payload.append("notes", formData.notes);
      payload.append("report_date", formData.report_date);
      payload.append(
        "existing_attachments",
        JSON.stringify(normalizeAttachments(existingAttachments)),
      );

      newFiles.forEach((file) => payload.append("files", file));

      if (editingReport) {
        await api.put(`/daily-reports/${editingReport.id}`, payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setMessage({ type: "success", text: "تم تحديث التقرير بنجاح" });
      } else {
        await api.post("/daily-reports", payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setMessage({ type: "success", text: "تم إرسال التقرير بنجاح" });
      }

      setShowModal(false);
      resetForm();
      await fetchReports();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm("هل أنت متأكد من حذف التقرير؟")) return;
    try {
      await api.delete(`/daily-reports/${reportId}`);
      setMessage({ type: "success", text: "تم حذف التقرير بنجاح" });
      await fetchReports();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    }
  };

  const removeExistingAttachment = (index) => {
    setExistingAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const removeNewFile = (index) => {
    setNewFiles((prev) => prev.filter((_, idx) => idx !== index));
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
            <h1 className="text-3xl font-bold text-slate-900">
              تقاريري اليومية
            </h1>
            <p className="text-slate-600 mt-1">
              سجّل إنجازاتك وأرفق الملفات المطلوبة
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-sky-700 hover:bg-sky-800 text-white px-5 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} />
            تقرير جديد
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl shadow">
              لا توجد تقارير بعد
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-xl shadow p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(
                      report.report_date || report.created_at,
                    ).toLocaleDateString("ar-EG")}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                    {report.status || "submitted"}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900">{report.title}</h3>
                {report.description && (
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {report.description}
                  </p>
                )}

                {Array.isArray(report.attachments) &&
                  report.attachments.length > 0 && (
                    <div className="border-t pt-2">
                      <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                        <Paperclip size={12} />
                        المرفقات ({report.attachments.length})
                      </p>
                      <div className="mt-1 space-y-1">
                        {normalizeAttachments(report.attachments)
                          .slice(0, 3)
                          .map((file, index) => (
                            <a
                              key={`${report.id}-${index}`}
                              href={getAttachmentUrl(file)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-sky-700 hover:text-sky-900 block"
                            >
                              {getAttachmentName(file)}
                            </a>
                          ))}
                      </div>
                    </div>
                  )}

                <div className="flex gap-2 border-t pt-3">
                  <button
                    onClick={() => openEditModal(report)}
                    className="flex-1 bg-sky-50 text-sky-700 hover:bg-sky-100 py-2 rounded flex items-center justify-center gap-1"
                  >
                    <Edit size={14} />
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteReport(report.id)}
                    className="flex-1 bg-red-50 text-red-700 hover:bg-red-100 py-2 rounded flex items-center justify-center gap-1"
                  >
                    <Trash2 size={14} />
                    حذف
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingReport ? "تعديل التقرير" : "تقرير يومي جديد"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  التاريخ
                </label>
                <input
                  type="date"
                  value={formData.report_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      report_date: e.target.value,
                    }))
                  }
                  required
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  العنوان
                </label>
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

              <div>
                <label className="block text-sm font-medium mb-1">
                  المهام المنجزة
                </label>
                <textarea
                  value={formData.tasks_completed}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      tasks_completed: e.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  ملاحظات
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  مرفقات التقرير
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
                  onChange={(e) =>
                    setNewFiles(Array.from(e.target.files || []))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />

                {existingAttachments.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">
                      المرفقات الحالية
                    </p>
                    <div className="space-y-1">
                      {existingAttachments.map((item, index) => (
                        <div
                          key={`existing-${index}`}
                          className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded"
                        >
                          <span className="text-sm">
                            {getAttachmentName(item)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeExistingAttachment(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">
                      ملفات جديدة
                    </p>
                    <div className="space-y-1">
                      {newFiles.map((file, index) => (
                        <div
                          key={`new-${index}`}
                          className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded"
                        >
                          <span className="text-sm">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeNewFile(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
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
