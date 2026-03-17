import {
  CalendarRange,
  Filter,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  getActiveOrderScopePresetId,
  getOrderScopeSummary,
  hasActiveOrderScopeFilters,
  ORDER_SCOPE_PRESETS,
} from "../utils/orderScope";

export default function OrderInsightsFilterBar({
  filters,
  onChange,
  onReset,
  title = "فلترة التحليل",
  description = "نفس نطاق الفلترة سيطبق على الأرقام والجداول المعروضة في الصفحة.",
}) {
  const activePresetId = getActiveOrderScopePresetId(filters);
  const activeSummary = getOrderScopeSummary(filters);
  const hasActiveFilters = hasActiveOrderScopeFilters(filters);

  const updateField = (key, value) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Filter size={18} className="text-sky-700" />
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            إعادة الضبط
          </button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {ORDER_SCOPE_PRESETS.map((preset) => {
            const isActive = preset.id === activePresetId;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ ...preset.filters })}
                className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title={preset.description}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="من تاريخ" icon={CalendarRange}>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateField("dateFrom", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </Field>

          <Field label="إلى تاريخ" icon={CalendarRange}>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateField("dateTo", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </Field>

          <Field label="حالة الدفع" icon={ShieldCheck}>
            <select
              value={filters.paymentFilter}
              onChange={(event) => updateField("paymentFilter", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">كل الحالات</option>
              <option value="paid_or_partial">مدفوع + مدفوع جزئيًا</option>
              <option value="pending_or_authorized">معلق + مصرح به</option>
              <option value="paid">مدفوع</option>
              <option value="partially_paid">مدفوع جزئيًا</option>
              <option value="pending">معلق</option>
              <option value="authorized">مصرح به</option>
              <option value="partially_refunded">استرداد جزئي</option>
              <option value="refunded">مسترد</option>
              <option value="voided">ملغي</option>
            </select>
          </Field>

          <Field label="حالة التسليم" icon={ShieldCheck}>
            <select
              value={filters.fulfillmentFilter}
              onChange={(event) =>
                updateField("fulfillmentFilter", event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">كل الحالات</option>
              <option value="fulfilled">تم التسليم</option>
              <option value="partial">تسليم جزئي</option>
              <option value="unfulfilled">غير مسلّم</option>
            </select>
          </Field>

          <Field label="الاسترجاع" icon={ShieldCheck}>
            <select
              value={filters.refundFilter}
              onChange={(event) => updateField("refundFilter", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">كل الحالات</option>
              <option value="any">يوجد استرجاع</option>
              <option value="partial">استرجاع جزئي</option>
              <option value="full">استرجاع كامل</option>
              <option value="none">بدون استرجاع</option>
            </select>
          </Field>
        </div>

        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            hasActiveFilters
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {hasActiveFilters ? (
            <div className="flex flex-wrap gap-2">
              {activeSummary.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            "لا توجد فلترة نشطة الآن. يتم عرض كامل النطاق المتاح للمتجر الحالي."
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon size={14} />
        {label}
      </span>
      {children}
    </label>
  );
}
