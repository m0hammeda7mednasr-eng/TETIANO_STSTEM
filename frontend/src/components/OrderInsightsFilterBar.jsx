import {
  CalendarRange,
  Filter,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import {
  getActiveOrderScopePresetId,
  getOrderScopePresets,
  getOrderScopeSummary,
  hasActiveOrderScopeFilters,
} from "../utils/orderScope";

export default function OrderInsightsFilterBar({
  filters,
  onChange,
  onReset,
  title,
  description,
}) {
  const { locale, t } = useLocale();
  const presets = getOrderScopePresets(locale);
  const activePresetId = getActiveOrderScopePresetId(filters);
  const activeSummary = getOrderScopeSummary(filters, locale);
  const hasActiveFilters = hasActiveOrderScopeFilters(filters);
  const resolvedTitle = title || t("orderFilterBar.title", "Analysis Filters");
  const resolvedDescription =
    description ||
    t(
      "orderFilterBar.description",
      "The same filter scope will be applied to the figures and tables shown on this page.",
    );

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
              {resolvedTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{resolvedDescription}</p>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            {t("orderFilterBar.reset", "Reset")}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
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
          <Field
            label={t("orderFilterBar.fromDate", "From Date")}
            icon={CalendarRange}
          >
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateField("dateFrom", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </Field>

          <Field
            label={t("orderFilterBar.toDate", "To Date")}
            icon={CalendarRange}
          >
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateField("dateTo", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </Field>

          <Field
            label={t("orderFilterBar.paymentStatus", "Payment Status")}
            icon={ShieldCheck}
          >
            <select
              value={filters.paymentFilter}
              onChange={(event) => updateField("paymentFilter", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">
                {locale === "ar" ? "كل الحالات" : "All statuses"}
              </option>
              <option value="paid_or_partial">
                {locale === "ar" ? "مدفوع + مدفوع جزئيًا" : "Paid + Partially Paid"}
              </option>
              <option value="pending_or_authorized">
                {locale === "ar" ? "معلق + مصرح به" : "Pending + Authorized"}
              </option>
              <option value="paid">{locale === "ar" ? "مدفوع" : "Paid"}</option>
              <option value="partially_paid">
                {locale === "ar" ? "مدفوع جزئيًا" : "Partially Paid"}
              </option>
              <option value="pending">
                {locale === "ar" ? "معلق" : "Pending"}
              </option>
              <option value="authorized">
                {locale === "ar" ? "مصرح به" : "Authorized"}
              </option>
              <option value="partially_refunded">
                {locale === "ar" ? "استرداد جزئي" : "Partially Refunded"}
              </option>
              <option value="refunded">
                {locale === "ar" ? "مسترد" : "Refunded"}
              </option>
              <option value="voided">
                {locale === "ar" ? "ملغي" : "Voided"}
              </option>
            </select>
          </Field>

          <Field
            label={t("orderFilterBar.fulfillmentStatus", "Fulfillment Status")}
            icon={ShieldCheck}
          >
            <select
              value={filters.fulfillmentFilter}
              onChange={(event) =>
                updateField("fulfillmentFilter", event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">
                {locale === "ar" ? "كل الحالات" : "All statuses"}
              </option>
              <option value="fulfilled">
                {locale === "ar" ? "تم التسليم" : "Fulfilled"}
              </option>
              <option value="partial">
                {locale === "ar" ? "تسليم جزئي" : "Partially Fulfilled"}
              </option>
              <option value="unfulfilled">
                {locale === "ar" ? "غير مسلّم" : "Unfulfilled"}
              </option>
            </select>
          </Field>

          <Field label={t("orderFilterBar.refund", "Refund")} icon={ShieldCheck}>
            <select
              value={filters.refundFilter}
              onChange={(event) => updateField("refundFilter", event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">
                {locale === "ar" ? "كل الحالات" : "All statuses"}
              </option>
              <option value="any">
                {locale === "ar" ? "يوجد استرجاع" : "Has refund"}
              </option>
              <option value="partial">
                {locale === "ar" ? "استرجاع جزئي" : "Partial refund"}
              </option>
              <option value="full">
                {locale === "ar" ? "استرجاع كامل" : "Full refund"}
              </option>
              <option value="none">
                {locale === "ar" ? "بدون استرجاع" : "No refund"}
              </option>
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
            t(
              "orderFilterBar.noFilters",
              "No active filters right now. The full available scope for the current store is being shown.",
            )
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
