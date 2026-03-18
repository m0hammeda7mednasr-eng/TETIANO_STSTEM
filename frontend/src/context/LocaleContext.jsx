import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getNestedLocaleValue } from "../i18n/appStrings";

const LOCALE_STORAGE_KEY = "tetiano_locale";
const LOCALE_TO_LANGUAGE_TAG = {
  ar: "ar-EG",
  en: "en-US",
};

const LocaleContext = createContext(null);

const getInitialLocale = () => {
  if (typeof window === "undefined") {
    return "ar";
  }

  const cachedLocale = String(localStorage.getItem(LOCALE_STORAGE_KEY) || "")
    .trim()
    .toLowerCase();
  if (cachedLocale === "ar" || cachedLocale === "en") {
    return cachedLocale;
  }

  const browserLanguage = String(
    window.navigator?.language || window.navigator?.languages?.[0] || "",
  )
    .trim()
    .toLowerCase();

  return browserLanguage.startsWith("ar") ? "ar" : "en";
};

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }

    const root = document.documentElement;
    const direction = locale === "ar" ? "rtl" : "ltr";

    root.lang = locale;
    root.dir = direction;
    document.body.dir = direction;
    document.body.dataset.locale = locale;
  }, [locale]);

  const value = useMemo(() => {
    const isArabic = locale === "ar";
    const direction = isArabic ? "rtl" : "ltr";
    const languageTag = LOCALE_TO_LANGUAGE_TAG[locale] || "en-US";

    return {
      locale,
      direction,
      languageTag,
      isArabic,
      isRTL: isArabic,
      setLocale: (nextLocale) => {
        const normalized = String(nextLocale || "").trim().toLowerCase();
        setLocaleState(normalized === "ar" ? "ar" : "en");
      },
      toggleLocale: () => {
        setLocaleState((current) => (current === "ar" ? "en" : "ar"));
      },
      t: (key, fallback = "") => {
        const resolved = getNestedLocaleValue(locale, key);
        return resolved === undefined ? fallback : resolved;
      },
      select: (arabicValue, englishValue) =>
        isArabic ? arabicValue : englishValue,
      formatDateTime: (value, options = {}) => {
        if (!value) {
          return "-";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return "-";
        }

        return date.toLocaleString(languageTag, options);
      },
      formatDate: (value, options = {}) => {
        if (!value) {
          return "-";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return "-";
        }

        return date.toLocaleDateString(languageTag, options);
      },
    };
  }, [locale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return context;
}
