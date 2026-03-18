import { Languages } from "lucide-react";
import { useLocale } from "../context/LocaleContext";

export default function LanguageToggle({ className = "" }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur ${className}`.trim()}
      aria-label={t("language.switcherLabel", "Interface language")}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Languages size={16} />
      </div>
      <div className="inline-flex items-center rounded-xl bg-slate-100 p-1">
        <ToggleButton
          label="AR"
          title={t("language.arabic", "Arabic")}
          isActive={locale === "ar"}
          onClick={() => setLocale("ar")}
        />
        <ToggleButton
          label="EN"
          title={t("language.english", "English")}
          isActive={locale === "en"}
          onClick={() => setLocale("en")}
        />
      </div>
    </div>
  );
}

function ToggleButton({ label, title, isActive, onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        isActive
          ? "bg-sky-700 text-white shadow-sm"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}
