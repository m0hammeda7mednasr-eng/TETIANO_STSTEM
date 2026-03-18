import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  X,
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";

export function LoadingSpinner({ label = "" }) {
  const { select } = useLocale();
  const message = label || select("جاري التحميل...", "Loading...");

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="animate-spin text-sky-600" size={40} />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function InlineAlert({
  message,
  onClose,
  icon: Icon,
  tone = "red",
  closeLabel,
}) {
  const toneClasses = {
    red: "border-rose-200 bg-rose-50 text-rose-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  const iconClasses = {
    red: "text-rose-600",
    green: "text-emerald-600",
  };

  return (
    <div
      className={`mb-6 flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-sm ${
        toneClasses[tone] || toneClasses.red
      }`}
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className={`mt-0.5 shrink-0 ${iconClasses[tone] || iconClasses.red}`}
          size={20}
        />
        <p className="text-sm font-medium leading-6">{message}</p>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={`rounded-full p-1 transition hover:bg-white/70 ${
            iconClasses[tone] || iconClasses.red
          }`}
          aria-label={closeLabel}
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function ErrorAlert({ message, onClose }) {
  const { select } = useLocale();

  return (
    <InlineAlert
      message={message}
      onClose={onClose}
      icon={AlertCircle}
      tone="red"
      closeLabel={select("إغلاق التنبيه", "Dismiss alert")}
    />
  );
}

export function SuccessAlert({ message, onClose }) {
  const { select } = useLocale();

  return (
    <InlineAlert
      message={message}
      onClose={onClose}
      icon={CheckCircle2}
      tone="green"
      closeLabel={select("إغلاق الرسالة", "Dismiss message")}
    />
  );
}

export function EmptyState({
  icon: Icon = Package,
  title,
  message = "",
}) {
  const { select } = useLocale();
  const resolvedTitle = title || select("لا توجد بيانات", "No data found");

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={30} />
      </div>
      <p className="mb-2 text-base font-semibold text-slate-800">
        {resolvedTitle}
      </p>
      {message ? <p className="text-sm text-slate-500">{message}</p> : null}
    </div>
  );
}

export function Pagination({ page, totalPages, onPageChange }) {
  const { isRTL, select } = useLocale();
  const previousIcon = isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />;
  const nextIcon = isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />;

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        {select("الصفحة", "Page")} {page} {select("من", "of")} {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previousIcon}
          <span>{select("السابق", "Previous")}</span>
        </button>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{select("التالي", "Next")}</span>
          {nextIcon}
        </button>
      </div>
    </div>
  );
}
