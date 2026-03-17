import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock3,
  Package,
  RefreshCw,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { warehouseAPI } from "../utils/api";
import { formatDateTime } from "../utils/helpers";
import { extractArray } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isWarehouseEvent = (event) =>
  String(event?.source || "").toLowerCase().includes("/warehouse");

export default function WarehouseScanner() {
  const { user } = useAuth();
  const inputRef = useRef(null);

  const [movementType, setMovementType] = useState("in");
  const [scanCode, setScanCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingScans, setLoadingScans] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recentScans, setRecentScans] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const fetchRecentScans = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingScans(true);
    }

    try {
      const response = await warehouseAPI.getScans({
        limit: 20,
        offset: 0,
      });
      const rows = extractArray(response?.data);
      setRecentScans(rows);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Error fetching recent scans:", requestError);
      setError(
        requestError?.response?.data?.error || "فشل تحميل سجل السكان",
      );
    } finally {
      setLoadingScans(false);
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    fetchRecentScans();
  }, [fetchRecentScans]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (!isWarehouseEvent(event)) {
        return;
      }

      fetchRecentScans({ silent: true });
    });

    return () => unsubscribe();
  }, [fetchRecentScans]);

  const quantityNumber = useMemo(
    () => Math.max(1, parseInt(quantity, 10) || 1),
    [quantity],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await warehouseAPI.scan({
        code: scanCode,
        movement_type: movementType,
        quantity: quantityNumber,
        note,
      });

      const payload = response?.data || {};
      const inventory = payload?.inventory || null;
      const product = payload?.product || null;

      setSuccess(
        movementType === "in"
          ? `تمت إضافة ${quantityNumber.toLocaleString("ar-EG")} وحدة إلى ${product?.title || product?.sku || scanCode}`
          : `تم خصم ${quantityNumber.toLocaleString("ar-EG")} وحدة من ${product?.title || product?.sku || scanCode}`,
      );
      setLastResult({
        ...payload,
        inventory,
        product,
      });
      setScanCode("");
      setNote("");
      setQuantity("1");
      await fetchRecentScans({ silent: true });
      inputRef.current?.focus();
    } catch (requestError) {
      console.error("Error applying warehouse scan:", requestError);
      setError(
        requestError?.response?.data?.error || "فشل تسجيل عملية السكان",
      );
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const modeClassName =
    movementType === "in"
      ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
      : "bg-rose-600 hover:bg-rose-700 border-rose-600";

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">السكانر</h1>
                <p className="text-slate-600 mt-1">
                  اختر داخل أو خارج، ثم اسكان الـ SKU ليتم تحديث رصيد المخزن مباشرة.
                </p>
                {lastUpdatedAt && (
                  <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Clock3 size={12} />
                    آخر تحديث {formatDateTime(lastUpdatedAt)}
                  </div>
                )}
              </div>

              <button
                onClick={() => fetchRecentScans()}
                className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <RefreshCw size={18} />
                تحديث السجل
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-6">
            <section className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex flex-wrap gap-3">
                  <ToggleButton
                    active={movementType === "in"}
                    label="داخل"
                    icon={ArrowDown}
                    onClick={() => setMovementType("in")}
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  />
                  <ToggleButton
                    active={movementType === "out"}
                    label="خارج"
                    icon={ArrowUp}
                    onClick={() => setMovementType("out")}
                    className="border-rose-200 bg-rose-50 text-rose-700"
                  />
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      كود السكان / SKU
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={scanCode}
                      onChange={(event) => setScanCode(event.target.value)}
                      placeholder="اسكان أو اكتب SKU هنا"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-lg"
                      autoComplete="off"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        الكمية
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        ملاحظة
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="اختياري: مرتجع، تحويل، جرد..."
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !scanCode.trim()}
                    className={`w-full text-white px-4 py-3 rounded-xl border flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${modeClassName}`}
                  >
                    {movementType === "in" ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
                    {submitting
                      ? "جارٍ حفظ العملية..."
                      : movementType === "in"
                        ? "تسجيل حركة داخل"
                        : "تسجيل حركة خارج"}
                  </button>
                </form>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-2 text-emerald-700">
                  <CheckCircle size={18} />
                  {success}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="bg-slate-900 text-white rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-slate-300 text-sm">الوضع الحالي</p>
                    <h2 className="text-2xl font-bold mt-1">
                      {movementType === "in" ? "حركة داخل" : "حركة خارج"}
                    </h2>
                  </div>
                  <div
                    className={`rounded-2xl p-3 ${
                      movementType === "in" ? "bg-emerald-500/20" : "bg-rose-500/20"
                    }`}
                  >
                    {movementType === "in" ? <ArrowDown size={24} /> : <ArrowUp size={24} />}
                  </div>
                </div>
                <p className="text-slate-300 text-sm mt-4 leading-6">
                  {movementType === "in"
                    ? "كل سكانة في هذا الوضع ستزيد رصيد المخزن للمنتج مباشرة."
                    : "كل سكانة في هذا الوضع ستخصم من رصيد المخزن ولن تسمح بالنزول تحت الصفر."}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  آخر عملية
                </h2>

                {lastResult?.inventory ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <div className="font-semibold text-slate-900">
                        {lastResult?.product?.title || "-"}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        SKU: {lastResult?.product?.sku || "-"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <InfoTile
                        label="رصيد المخزن الآن"
                        value={toNumber(
                          lastResult.inventory.warehouse_quantity,
                        ).toLocaleString("ar-EG")}
                      />
                      <InfoTile
                        label="رصيد Shopify"
                        value={toNumber(
                          lastResult.inventory.shopify_inventory_quantity,
                        ).toLocaleString("ar-EG")}
                      />
                      <InfoTile
                        label="الفرق"
                        value={toNumber(
                          lastResult.inventory.stock_difference,
                        ).toLocaleString("ar-EG")}
                      />
                      <InfoTile
                        label="وقت الحركة"
                        value={formatDateTime(lastResult.scan?.created_at)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                    لا توجد عملية مسجلة في هذه الجلسة بعد.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  سجل السكان الأخير
                </h2>
                <p className="text-sm text-slate-500">
                  كل حركة محفوظة باليوم والساعة ويمكن الرجوع لها وقت الجرد أو المراجعة.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 border border-slate-200">
                <Package size={14} />
                المستخدم الحالي {user?.name || "مستخدم"}
              </div>
            </div>

            {loadingScans ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                جاري تحميل سجل السكان...
              </div>
            ) : recentScans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                لا توجد عمليات سكان مسجلة حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-right">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-4 py-3 font-semibold">الوقت</th>
                      <th className="px-4 py-3 font-semibold">الحركة</th>
                      <th className="px-4 py-3 font-semibold">المنتج</th>
                      <th className="px-4 py-3 font-semibold">SKU</th>
                      <th className="px-4 py-3 font-semibold">الكمية</th>
                      <th className="px-4 py-3 font-semibold">المنفذ</th>
                      <th className="px-4 py-3 font-semibold">الملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentScans.map((scan) => (
                      <tr key={scan.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-700">
                          {formatDateTime(scan.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                              scan.movement_type === "in"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            {scan.movement_type === "in" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                            {scan.movement_type === "in" ? "داخل" : "خارج"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {scan?.product?.title || "-"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {scan?.product?.vendor || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {scan?.product?.sku || scan?.sku || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {toNumber(scan.quantity).toLocaleString("ar-EG")}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {scan?.user?.name || scan?.user?.email || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {scan.note || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ToggleButton({ active, label, icon: Icon, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        active ? className : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-2">{value}</div>
    </div>
  );
}
