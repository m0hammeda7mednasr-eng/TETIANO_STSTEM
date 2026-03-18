const DEFAULT_LOCALE = "en";

export const INITIAL_ORDER_SCOPE_FILTERS = {
  dateFrom: "",
  dateTo: "",
  paymentFilter: "all",
  fulfillmentFilter: "all",
  refundFilter: "all",
};

const ORDER_SCOPE_PRESET_DEFINITIONS = [
  {
    id: "all",
    labelKey: "all",
    filters: { ...INITIAL_ORDER_SCOPE_FILTERS },
  },
  {
    id: "paid",
    labelKey: "paid",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      paymentFilter: "paid_or_partial",
    },
  },
  {
    id: "pending",
    labelKey: "pending",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      paymentFilter: "pending_or_authorized",
    },
  },
  {
    id: "fulfilled",
    labelKey: "fulfilled",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      fulfillmentFilter: "fulfilled",
    },
  },
  {
    id: "refunds",
    labelKey: "refunds",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      refundFilter: "any",
    },
  },
];

const ORDER_SCOPE_TRANSLATIONS = {
  ar: {
    presets: {
      all: {
        label: "كل الطلبات",
        description: "عرض كامل بدون أي تقييد.",
      },
      paid: {
        label: "المبيعات المدفوعة",
        description: "الطلبات المدفوعة أو المدفوعة جزئيًا.",
      },
      pending: {
        label: "قيد التحصيل",
        description: "الطلبات المعلقة أو المصرح بها.",
      },
      fulfilled: {
        label: "تم تسليمه",
        description: "الطلبات التي تم تسليمها فعليًا.",
      },
      refunds: {
        label: "مرتجعات",
        description: "أي طلب يحتوي على استرجاع.",
      },
    },
    labels: {
      start: "البداية",
      now: "الآن",
      period: "الفترة",
      payment: "الدفع",
      fulfillment: "التسليم",
      refund: "الاسترجاع",
      paid_or_partial: "مدفوع + مدفوع جزئيًا",
      pending_or_authorized: "معلق + مصرح به",
      paid: "مدفوع",
      partially_paid: "مدفوع جزئيًا",
      pending: "معلق",
      authorized: "مصرح به",
      refunded: "مسترد",
      partially_refunded: "استرداد جزئي",
      voided: "ملغي",
      fulfilled: "تم التسليم",
      partial: "تسليم جزئي",
      unfulfilled: "غير مسلّم",
      any: "يوجد استرجاع",
      full: "استرجاع كامل",
      none: "بدون استرجاع",
    },
  },
  en: {
    presets: {
      all: {
        label: "All Orders",
        description: "Full view with no restrictions.",
      },
      paid: {
        label: "Paid Sales",
        description: "Paid and partially paid orders.",
      },
      pending: {
        label: "Pending Collection",
        description: "Pending and authorized orders.",
      },
      fulfilled: {
        label: "Fulfilled",
        description: "Orders that have been fulfilled.",
      },
      refunds: {
        label: "Refunds",
        description: "Any order containing a refund.",
      },
    },
    labels: {
      start: "Start",
      now: "Now",
      period: "Period",
      payment: "Payment",
      fulfillment: "Fulfillment",
      refund: "Refund",
      paid_or_partial: "Paid + Partially Paid",
      pending_or_authorized: "Pending + Authorized",
      paid: "Paid",
      partially_paid: "Partially Paid",
      pending: "Pending",
      authorized: "Authorized",
      refunded: "Refunded",
      partially_refunded: "Partially Refunded",
      voided: "Voided",
      fulfilled: "Fulfilled",
      partial: "Partially Fulfilled",
      unfulfilled: "Unfulfilled",
      any: "Has refund",
      full: "Full refund",
      none: "No refund",
    },
  },
};

const getOrderScopeTranslations = (locale = DEFAULT_LOCALE) =>
  ORDER_SCOPE_TRANSLATIONS[locale] || ORDER_SCOPE_TRANSLATIONS.en;

export const getOrderScopePresets = (locale = DEFAULT_LOCALE) => {
  const translations = getOrderScopeTranslations(locale);

  return ORDER_SCOPE_PRESET_DEFINITIONS.map((preset) => ({
    id: preset.id,
    filters: { ...preset.filters },
    label: translations.presets[preset.labelKey].label,
    description: translations.presets[preset.labelKey].description,
  }));
};

const hasValue = (value) => String(value || "").trim().length > 0;

export const hasActiveOrderScopeFilters = (filters = {}) =>
  hasValue(filters.dateFrom) ||
  hasValue(filters.dateTo) ||
  String(filters.paymentFilter || "all") !== "all" ||
  String(filters.fulfillmentFilter || "all") !== "all" ||
  String(filters.refundFilter || "all") !== "all";

export const buildOrderScopeApiParams = (filters = {}) => {
  const params = {};

  if (hasValue(filters.dateFrom)) {
    params.date_from = filters.dateFrom;
  }
  if (hasValue(filters.dateTo)) {
    params.date_to = filters.dateTo;
  }
  if (String(filters.paymentFilter || "all") !== "all") {
    params.payment_status = filters.paymentFilter;
  }
  if (String(filters.fulfillmentFilter || "all") !== "all") {
    params.fulfillment_status = filters.fulfillmentFilter;
  }
  if (String(filters.refundFilter || "all") !== "all") {
    params.refund_filter = filters.refundFilter;
  }

  return params;
};

const shallowMatch = (filters = {}, candidate = {}) =>
  Object.entries(candidate).every(
    ([key, value]) => String(filters?.[key] || "") === String(value || ""),
  );

export const getActiveOrderScopePresetId = (filters = {}) => {
  const normalized = {
    ...INITIAL_ORDER_SCOPE_FILTERS,
    ...filters,
  };

  const matchingPreset = ORDER_SCOPE_PRESET_DEFINITIONS.find((preset) =>
    shallowMatch(normalized, preset.filters),
  );

  return matchingPreset?.id || null;
};

export const getOrderScopeSummary = (
  filters = {},
  locale = DEFAULT_LOCALE,
) => {
  const parts = [];
  const translations = getOrderScopeTranslations(locale).labels;

  if (hasValue(filters.dateFrom) || hasValue(filters.dateTo)) {
    const from = filters.dateFrom || translations.start;
    const to = filters.dateTo || translations.now;
    parts.push(`${translations.period}: ${from} → ${to}`);
  }

  if (String(filters.paymentFilter || "all") !== "all") {
    parts.push(
      `${translations.payment}: ${
        translations[filters.paymentFilter] || filters.paymentFilter
      }`,
    );
  }

  if (String(filters.fulfillmentFilter || "all") !== "all") {
    parts.push(
      `${translations.fulfillment}: ${
        translations[filters.fulfillmentFilter] || filters.fulfillmentFilter
      }`,
    );
  }

  if (String(filters.refundFilter || "all") !== "all") {
    parts.push(
      `${translations.refund}: ${
        translations[filters.refundFilter] || filters.refundFilter
      }`,
    );
  }

  return parts;
};
