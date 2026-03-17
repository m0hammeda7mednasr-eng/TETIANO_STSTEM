export const INITIAL_ORDER_SCOPE_FILTERS = {
  dateFrom: "",
  dateTo: "",
  paymentFilter: "all",
  fulfillmentFilter: "all",
  refundFilter: "all",
};

export const ORDER_SCOPE_PRESETS = [
  {
    id: "all",
    label: "كل الطلبات",
    description: "عرض كامل بدون أي تقييد.",
    filters: { ...INITIAL_ORDER_SCOPE_FILTERS },
  },
  {
    id: "paid",
    label: "المبيعات المدفوعة",
    description: "الطلبات المدفوعة أو المدفوعة جزئيًا.",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      paymentFilter: "paid_or_partial",
    },
  },
  {
    id: "pending",
    label: "قيد التحصيل",
    description: "الطلبات المعلقة أو المصرح بها.",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      paymentFilter: "pending_or_authorized",
    },
  },
  {
    id: "fulfilled",
    label: "تم تسليمه",
    description: "الطلبات التي تم تسليمها فعليًا.",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      fulfillmentFilter: "fulfilled",
    },
  },
  {
    id: "refunds",
    label: "مرتجعات",
    description: "أي طلب يحتوي على استرجاع.",
    filters: {
      ...INITIAL_ORDER_SCOPE_FILTERS,
      refundFilter: "any",
    },
  },
];

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

  const matchingPreset = ORDER_SCOPE_PRESETS.find((preset) =>
    shallowMatch(normalized, preset.filters),
  );

  return matchingPreset?.id || null;
};

export const getOrderScopeSummary = (filters = {}) => {
  const parts = [];

  if (hasValue(filters.dateFrom) || hasValue(filters.dateTo)) {
    const from = filters.dateFrom || "البداية";
    const to = filters.dateTo || "الآن";
    parts.push(`الفترة: ${from} إلى ${to}`);
  }

  if (String(filters.paymentFilter || "all") !== "all") {
    const labelMap = {
      paid_or_partial: "مدفوع + مدفوع جزئيًا",
      pending_or_authorized: "معلق + مصرح به",
      paid: "مدفوع",
      partially_paid: "مدفوع جزئيًا",
      pending: "معلق",
      authorized: "مصرح به",
      refunded: "مسترد",
      partially_refunded: "استرداد جزئي",
      voided: "ملغي",
    };
    parts.push(`الدفع: ${labelMap[filters.paymentFilter] || filters.paymentFilter}`);
  }

  if (String(filters.fulfillmentFilter || "all") !== "all") {
    const labelMap = {
      fulfilled: "تم التسليم",
      partial: "تسليم جزئي",
      unfulfilled: "غير مسلّم",
    };
    parts.push(
      `التسليم: ${labelMap[filters.fulfillmentFilter] || filters.fulfillmentFilter}`,
    );
  }

  if (String(filters.refundFilter || "all") !== "all") {
    const labelMap = {
      any: "يوجد استرجاع",
      partial: "استرجاع جزئي",
      full: "استرجاع كامل",
      none: "بدون استرجاع",
    };
    parts.push(`الاسترجاع: ${labelMap[filters.refundFilter] || filters.refundFilter}`);
  }

  return parts;
};
