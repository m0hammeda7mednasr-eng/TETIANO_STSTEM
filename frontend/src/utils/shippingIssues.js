export const DEFAULT_SHIPPING_ISSUE_REASON = "unspecified";

const SHIPPING_ISSUE_REASON_OPTIONS = [
  {
    value: DEFAULT_SHIPPING_ISSUE_REASON,
    ar: "بدون تحديد",
    en: "Unspecified",
  },
  {
    value: "delivery_status",
    ar: "الشحنة اتوصلت ولا لا",
    en: "Delivery status unclear",
  },
  {
    value: "customer_issue",
    ar: "مشكلة في العميل",
    en: "Customer issue",
  },
  {
    value: "courier_issue",
    ar: "مشكلة في المندوب",
    en: "Courier issue",
  },
  {
    value: "order_lost",
    ar: "الأوردر ضاع",
    en: "Order lost",
  },
  {
    value: "delivery_delay",
    ar: "مشكلة في معاد التسليم",
    en: "Delivery delay",
  },
  {
    value: "customer_data_issue",
    ar: "مشكلة في بيانات العميل",
    en: "Customer data issue",
  },
  {
    value: "customer_cancelled",
    ar: "العميل لغى",
    en: "Customer cancelled",
  },
];

const SHIPPING_ISSUE_REASON_SET = new Set(
  SHIPPING_ISSUE_REASON_OPTIONS.map((option) => option.value),
);

export const normalizeShippingIssueReason = (
  value,
  fallback = DEFAULT_SHIPPING_ISSUE_REASON,
) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return SHIPPING_ISSUE_REASON_SET.has(normalized) ? normalized : fallback;
};

export const getShippingIssueReasonOptions = (select) =>
  SHIPPING_ISSUE_REASON_OPTIONS.map((option) => ({
    value: option.value,
    label: select(option.ar, option.en),
  }));

export const getShippingIssueReasonLabel = (reason, select) => {
  const normalized = normalizeShippingIssueReason(reason);
  const option =
    SHIPPING_ISSUE_REASON_OPTIONS.find((entry) => entry.value === normalized) ||
    SHIPPING_ISSUE_REASON_OPTIONS[0];

  return select(option.ar, option.en);
};

export const isShippingIssueActive = (order) =>
  Boolean(order?.shipping_issue || order?.shipping_issue_reason);

export const getShippingIssueBadgeClassName = (reason) => {
  switch (normalizeShippingIssueReason(reason)) {
    case "customer_cancelled":
      return "bg-rose-100 text-rose-800 border border-rose-200";
    case "order_lost":
      return "bg-red-100 text-red-800 border border-red-200";
    case "courier_issue":
    case "delivery_delay":
    case "delivery_status":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "customer_issue":
    case "customer_data_issue":
      return "bg-sky-100 text-sky-800 border border-sky-200";
    default:
      return "bg-violet-100 text-violet-800 border border-violet-200";
  }
};
