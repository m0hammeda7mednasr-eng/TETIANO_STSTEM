import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  Download,
  Eye,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import OrdersExportPanel from "../components/OrdersExportPanel";
import api from "../utils/api";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import { fetchAllPagesProgressively } from "../utils/pagination";
import { useLocale } from "../context/LocaleContext";
import {
  HEAVY_VIEW_CACHE_FRESH_MS,
  shouldAutoRefreshView,
} from "../utils/refreshPolicy";
import {
  buildStoreScopedCacheKey,
  isCacheFresh,
  peekCachedView,
  readCachedView,
  writeCachedView,
} from "../utils/viewCache";

const LIVE_REFRESH_DEBOUNCE_MS = 450;
const ORDERS_PAGE_SIZE = 100;
const ORDERS_VISIBLE_LIMIT = 4500;
const ORDERS_CACHE_FRESH_MS = HEAVY_VIEW_CACHE_FRESH_MS;
const CURRENCY_LABEL = "LE";

const INITIAL_FILTERS = {
  searchTerm: "",
  dateFrom: "",
  dateTo: "",
  orderNumberFrom: "",
  orderNumberTo: "",
  amountMin: "",
  amountMax: "",
  paymentFilter: "all",
  paymentMethodFilter: "all",
  fulfillmentFilter: "all",
  refundFilter: "all",
  cancelledOnly: false,
  fulfilledOnly: false,
  paidOnly: false,
  sortBy: "newest",
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSearchValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizePhoneSearch = (value) =>
  String(value || "").replace(/\D/g, "");

const normalizeOrderNumberSearch = (value) =>
  String(value || "").replace(/[^\d]/g, "");

const parseLocalDateInput = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const parseOrderDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getNormalizedDateRange = (dateFrom, dateTo) => {
  const from = dateFrom ? startOfDay(dateFrom) : null;
  const to = dateTo ? endOfDay(dateTo) : null;

  if (from && to && from.getTime() > to.getTime()) {
    return {
      from: startOfDay(dateTo),
      to: endOfDay(dateFrom),
      wasSwapped: true,
    };
  }

  return {
    from,
    to,
    wasSwapped: false,
  };
};

const isNumericSearchToken = (value) => /^\d+$/.test(String(value || "").trim());

const isLikelyOrderNumberToken = (value) =>
  /^#?\d{3,6}$/.test(String(value || "").trim());

const splitSearchTokens = (value) =>
  Array.from(
    new Set(
      normalizeSearchValue(value)
        .split(/\s+/)
        .filter(Boolean),
    ),
  );

const parseJsonObject = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const buildOrderSearchIndex = (order) => {
  const parsedData = parseJsonObject(order?.data);
  const lineItems = Array.isArray(parsedData?.line_items) ? parsedData.line_items : [];
  const itemPreviewTitles = Array.isArray(order?.item_previews)
    ? order.item_previews.map((item) => item?.title)
    : [];
  const phoneValues = [
    order?.customer_phone,
    parsedData?.customer?.phone,
    parsedData?.shipping_address?.phone,
    parsedData?.billing_address?.phone,
  ]
    .map(normalizePhoneSearch)
    .filter(Boolean);
  const orderNumberTextValues = [
    order?.order_number,
    parsedData?.order_number,
    parsedData?.name,
  ]
    .map(normalizeSearchValue)
    .filter(Boolean);
  const orderNumberValues = [
    order?.order_number,
    parsedData?.order_number,
    parsedData?.name,
  ]
    .map(normalizeOrderNumberSearch)
    .filter(Boolean);
  const searchValues = [
    order?.customer_name,
    order?.customer_email,
    order?.shopify_id,
    order?.financial_status,
    order?.fulfillment_status,
    order?.payment_method,
    order?.status,
    parsedData?.name,
    parsedData?.tags,
    parsedData?.note,
    parsedData?.customer?.first_name,
    parsedData?.customer?.last_name,
    parsedData?.customer?.email,
    parsedData?.shipping_address?.name,
    parsedData?.shipping_address?.address1,
    parsedData?.shipping_address?.address2,
    parsedData?.shipping_address?.city,
    parsedData?.shipping_address?.province,
    parsedData?.shipping_address?.country,
    parsedData?.shipping_address?.zip,
    parsedData?.billing_address?.name,
    parsedData?.billing_address?.address1,
    parsedData?.billing_address?.address2,
    parsedData?.billing_address?.city,
    parsedData?.billing_address?.province,
    parsedData?.billing_address?.country,
    parsedData?.billing_address?.zip,
    ...itemPreviewTitles,
    ...lineItems.flatMap((item) => [
      item?.title,
      item?.name,
      item?.variant_title,
      item?.sku,
      item?.vendor,
      item?.fulfillment_status,
    ]),
  ]
    .map(normalizeSearchValue)
    .filter(Boolean);

  return {
    textValues: Array.from(new Set([...searchValues, ...orderNumberTextValues])),
    phoneValues: Array.from(new Set(phoneValues)),
    orderNumberValues: Array.from(new Set(orderNumberValues)),
  };
};

const matchesOrderSearch = (searchIndex, searchTerm) => {
  const tokens = splitSearchTokens(searchTerm);
  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => {
    const normalizedPhoneToken = normalizePhoneSearch(token);
    const normalizedOrderToken = normalizeOrderNumberSearch(token);

    if (isLikelyOrderNumberToken(token)) {
      return searchIndex.orderNumberValues.some((value) =>
        value.includes(normalizedOrderToken),
      );
    }

    if (isNumericSearchToken(token) && normalizedPhoneToken.length >= 7) {
      return (
        searchIndex.phoneValues.some((value) =>
          value.includes(normalizedPhoneToken),
        ) ||
        searchIndex.orderNumberValues.some((value) =>
          value.includes(normalizedPhoneToken),
        )
      );
    }

    return (
      searchIndex.textValues.some((value) => value.includes(token)) ||
      (normalizedPhoneToken.length >= 7 &&
        searchIndex.phoneValues.some((value) =>
          value.includes(normalizedPhoneToken),
        )) ||
      (token.startsWith("#") &&
        normalizedOrderToken &&
        searchIndex.orderNumberValues.some((value) =>
          value.includes(normalizedOrderToken),
        ))
    );
  });
};

const formatAmount = (value) => `${toNumber(value).toFixed(2)} ${CURRENCY_LABEL}`;

const PAYMENT_METHOD_LABELS = {
  shopify: "Shopify",
  instapay: "InstaPay",
  wallet: "Wallet",
  none: "None",
};
const PAID_LIKE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);
const normalizeOrderState = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();
const isOrdersRelatedSharedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return (
    source.includes("/shopify/orders") ||
    source.includes("/orders/") ||
    source.includes("/order-comments")
  );
};

const getOrderMeta = (order) => {
  const paymentStatus = normalizeOrderState(
    order.financial_status || order.status,
  );
  const fulfillmentStatus = normalizeOrderState(order.fulfillment_status);
  const totalPrice = toNumber(order.total_price);
  const refundedAmount = Math.max(
    toNumber(order.refunded_amount),
    toNumber(order.total_refunded),
  );
  const isCancelled =
    Boolean(order.is_cancelled) ||
    paymentStatus === "voided" ||
    paymentStatus === "cancelled";
  const hasAnyRefund = Boolean(order.has_any_refund) || refundedAmount > 0;
  const isPartialRefund =
    Boolean(order.is_partial_refund) ||
    (hasAnyRefund && refundedAmount > 0 && refundedAmount < totalPrice);
  const isFullRefund =
    Boolean(order.is_full_refund) ||
    (hasAnyRefund && totalPrice > 0 && refundedAmount >= totalPrice);
  const isPaid = Boolean(order.is_paid);
  const isPaidLike = Boolean(order.is_paid_like) || PAID_LIKE_STATUSES.has(paymentStatus);
  const isFulfilled = Boolean(order.is_fulfilled) || fulfillmentStatus === "fulfilled";
  const paymentMethod = normalizeOrderState(order.payment_method || "none") || "none";
  const netSalesAmount =
    order.net_sales_amount !== undefined && order.net_sales_amount !== null
      ? toNumber(order.net_sales_amount)
      : isCancelled || !isPaidLike
        ? 0
        : Math.max(0, totalPrice - refundedAmount);

  return {
    paymentStatus,
    fulfillmentStatus,
    refundedAmount,
    totalPrice,
    isCancelled,
    hasAnyRefund,
    isPartialRefund,
    isFullRefund,
    isPaid,
    isPaidLike,
    isFulfilled,
    paymentMethod,
    netSalesAmount,
    orderNumberNumeric: toNumber(order.order_number),
    createdAtDate: parseOrderDate(order.created_at),
  };
};

const startOfDay = (dateString) => {
  const date = parseLocalDateInput(dateString);
  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (dateString) => {
  const date = parseLocalDateInput(dateString);
  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
};

export default function Orders() {
  const navigate = useNavigate();
  const { locale, select, isRTL } = useLocale();
  const tableHeaderAlignClass = isRTL ? "text-right" : "text-left";
  const cacheKey = useMemo(() => buildStoreScopedCacheKey("orders:list"), []);
  const initialCachedSnapshot = useMemo(() => {
    const cached = peekCachedView(cacheKey);
    return {
      rows: Array.isArray(cached?.value?.rows)
        ? cached.value.rows.slice(0, ORDERS_VISIBLE_LIMIT)
        : [],
      updatedAt: cached?.updatedAt ? new Date(cached.updatedAt) : null,
    };
  }, [cacheKey]);
  const [orders, setOrders] = useState(() => initialCachedSnapshot.rows);
  const [missingOrderIds, setMissingOrderIds] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false);
  const [, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(
    () => initialCachedSnapshot.updatedAt,
  );
  const [lastLiveEventAt, setLastLiveEventAt] = useState(null);
  const [loadStatus, setLoadStatus] = useState({
    active: false,
    message: "",
  });
  const deferredSearchTerm = useDeferredValue(filters.searchTerm);
  const refreshTimeoutRef = useRef(null);
  const fetchPromiseRef = useRef(null);
  const missingFetchPromiseRef = useRef(null);
  const ordersRef = useRef([]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    let active = true;

    readCachedView(cacheKey).then((cached) => {
      const cachedRows = Array.isArray(cached?.value?.rows)
        ? cached.value.rows.slice(0, ORDERS_VISIBLE_LIMIT)
        : [];
      if (!active || cachedRows.length === 0 || cachedRows.length <= ordersRef.current.length) {
        return;
      }

      setOrders(cachedRows);
      setLastUpdatedAt(
        cached?.updatedAt ? new Date(cached.updatedAt) : new Date(),
      );
      setLoadStatus({
        active: false,
        message: `Showing ${cachedRows.length.toLocaleString()} cached orders`,
      });
    });

    return () => {
      active = false;
    };
  }, [cacheKey]);

  const fetchMissingOrderIds = useCallback(async () => {
    if (missingFetchPromiseRef.current) {
      return missingFetchPromiseRef.current;
    }

    const request = (async () => {
      try {
        const rows = await fetchAllPagesProgressively(
          ({ limit, offset }) =>
            api.get("/shopify/orders/missing", {
              params: {
                limit,
                offset,
              },
            }),
          {
            limit: ORDERS_PAGE_SIZE,
          },
        );

        setMissingOrderIds(
          rows
            .map((order) => String(order?.id || "").trim())
            .filter(Boolean),
        );
      } catch (missingError) {
        console.error("Error fetching missing orders:", missingError);
      }
    })();

    missingFetchPromiseRef.current = request;

    try {
      await request;
    } finally {
      missingFetchPromiseRef.current = null;
    }
  }, []);

  const fetchOrders = useCallback(async ({ silent = false, forceSync = false } = {}) => {
    if (fetchPromiseRef.current) {
      return fetchPromiseRef.current;
    }

    const request = (async () => {
      if (!silent) {
        setLoading(Boolean(forceSync));
        setError("");
      }

      setLoadStatus({
        active: true,
        message: forceSync
          ? `Refreshing Shopify orders and loading the latest ${ORDERS_VISIBLE_LIMIT.toLocaleString()} orders...`
          : `Loading the latest ${ORDERS_VISIBLE_LIMIT.toLocaleString()} orders...`,
      });

      try {
        const [ordersResponse] = await Promise.all([
          api.get("/shopify/orders", {
            params: {
              limit: ORDERS_VISIBLE_LIMIT,
              offset: 0,
              sort_by: "created_at",
              sort_dir: "desc",
              sync_recent: forceSync ? "force" : "false",
            },
          }),
          fetchMissingOrderIds(),
        ]);

        const rows = Array.isArray(ordersResponse?.data?.data)
          ? ordersResponse.data.data.slice(0, ORDERS_VISIBLE_LIMIT)
          : [];

        setOrders(rows);
        setLastUpdatedAt(new Date());
        setLoadStatus({
          active: false,
          message:
            rows.length > 0
              ? `Loaded ${rows.length.toLocaleString()} recent orders`
              : "No orders found",
        });
        await writeCachedView(cacheKey, {
          rows: rows.slice(0, ORDERS_VISIBLE_LIMIT),
        });
      } catch (requestError) {
        console.error("Error fetching orders:", requestError);
        if (!silent) {
          if (ordersRef.current.length === 0) {
            setOrders([]);
            setError("Failed to load orders");
          } else {
            setError("Showing saved orders while refresh failed");
          }
        }
        setLoadStatus((current) =>
          current.message && ordersRef.current.length > 0
            ? { active: false, message: current.message }
            : { active: false, message: "" },
        );
      } finally {
        if (!silent && forceSync) {
          setLoading(false);
        }
      }
    })();

    fetchPromiseRef.current = request;

    try {
      await request;
    } finally {
      fetchPromiseRef.current = null;
    }
  }, [cacheKey, fetchMissingOrderIds]);

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      return;
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      fetchOrders({ silent: true });
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, [fetchOrders]);

  useEffect(
    () => () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await readCachedView(cacheKey);
      if (!active) {
        return;
      }

      void fetchMissingOrderIds();

      const hasCachedRows = Array.isArray(cached?.value?.rows) && cached.value.rows.length > 0;
      if (!hasCachedRows && !isCacheFresh(cached, ORDERS_CACHE_FRESH_MS)) {
        await fetchOrders({ silent: true });
      }
    })();

    let unsubscribe = () => {};
    let onFocus = null;
    let interval = null;

    if (shouldAutoRefreshView()) {
      unsubscribe = subscribeToSharedDataUpdates((event) => {
        if (!isOrdersRelatedSharedUpdate(event)) {
          return;
        }

        setLastLiveEventAt(new Date());
        scheduleSilentRefresh();
      });

      interval = setInterval(() => {
        if (document.visibilityState !== "visible") {
          return;
        }

        scheduleSilentRefresh();
      }, ORDERS_CACHE_FRESH_MS);

      onFocus = async () => {
        const cached = await readCachedView(cacheKey);
        if (isCacheFresh(cached, ORDERS_CACHE_FRESH_MS)) {
          return;
        }

        scheduleSilentRefresh();
      };
      window.addEventListener("focus", onFocus);
    }

    return () => {
      active = false;
      if (interval) {
        clearInterval(interval);
      }
      unsubscribe();
      if (onFocus) {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [cacheKey, fetchMissingOrderIds, fetchOrders, scheduleSilentRefresh]);

  const missingOrderIdSet = useMemo(
    () => new Set(missingOrderIds),
    [missingOrderIds],
  );

  const selectedOrderIdSet = useMemo(
    () => new Set(selectedOrderIds),
    [selectedOrderIds],
  );

  const ordersWithMeta = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        _meta: getOrderMeta(order),
        _searchIndex: buildOrderSearchIndex(order),
      })),
    [orders],
  );

  const normalizedDateRange = useMemo(
    () => getNormalizedDateRange(filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.dateTo],
  );

  const filteredOrders = useMemo(() => {
    let result = ordersWithMeta.filter(
      (order) => !missingOrderIdSet.has(String(order?.id || "").trim()),
    );

    if (deferredSearchTerm.trim()) {
      result = result.filter((order) => {
        return matchesOrderSearch(order._searchIndex, deferredSearchTerm);
      });
    }

    if (normalizedDateRange.from) {
      result = result.filter((order) => {
        const orderDate = order._meta.createdAtDate;
        return orderDate && orderDate >= normalizedDateRange.from;
      });
    }

    if (normalizedDateRange.to) {
      result = result.filter((order) => {
        const orderDate = order._meta.createdAtDate;
        return orderDate && orderDate <= normalizedDateRange.to;
      });
    }

    if (filters.orderNumberFrom) {
      const minOrderNumber = toNumber(filters.orderNumberFrom);
      result = result.filter(
        (order) => order._meta.orderNumberNumeric >= minOrderNumber,
      );
    }

    if (filters.orderNumberTo) {
      const maxOrderNumber = toNumber(filters.orderNumberTo);
      result = result.filter(
        (order) => order._meta.orderNumberNumeric <= maxOrderNumber,
      );
    }

    if (filters.amountMin) {
      const minAmount = toNumber(filters.amountMin);
      result = result.filter((order) => order._meta.totalPrice >= minAmount);
    }

    if (filters.amountMax) {
      const maxAmount = toNumber(filters.amountMax);
      result = result.filter((order) => order._meta.totalPrice <= maxAmount);
    }

    if (filters.paymentFilter !== "all") {
      result = result.filter((order) => {
        const status = order._meta.paymentStatus;
        if (filters.paymentFilter === "pending_or_authorized") {
          return status === "pending" || status === "authorized";
        }
        if (filters.paymentFilter === "paid_or_partial") {
          return status === "paid" || status === "partially_paid";
        }
        return status === filters.paymentFilter;
      });
    }

    if (filters.paymentMethodFilter !== "all") {
      result = result.filter(
        (order) => order._meta.paymentMethod === filters.paymentMethodFilter,
      );
    }

    if (filters.fulfillmentFilter !== "all") {
      result = result.filter((order) => {
        const status = order._meta.fulfillmentStatus;
        if (filters.fulfillmentFilter === "unfulfilled") {
          return !status || status === "unfulfilled" || status === "null";
        }
        return status === filters.fulfillmentFilter;
      });
    }

    if (filters.refundFilter !== "all") {
      result = result.filter((order) => {
        if (filters.refundFilter === "any") return order._meta.hasAnyRefund;
        if (filters.refundFilter === "partial") return order._meta.isPartialRefund;
        if (filters.refundFilter === "full") return order._meta.isFullRefund;
        if (filters.refundFilter === "none") return !order._meta.hasAnyRefund;
        return true;
      });
    }

    if (filters.cancelledOnly) {
      result = result.filter((order) => order._meta.isCancelled);
    }

    if (filters.fulfilledOnly) {
      result = result.filter((order) => order._meta.isFulfilled);
    }

    if (filters.paidOnly) {
      result = result.filter((order) => order._meta.isPaid);
    }

    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "amount_desc":
          return b._meta.totalPrice - a._meta.totalPrice;
        case "amount_asc":
          return a._meta.totalPrice - b._meta.totalPrice;
        case "order_desc":
          return b._meta.orderNumberNumeric - a._meta.orderNumberNumeric;
        case "order_asc":
          return a._meta.orderNumberNumeric - b._meta.orderNumberNumeric;
        case "newest":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });

    return result;
  }, [deferredSearchTerm, filters, missingOrderIdSet, normalizedDateRange, ordersWithMeta]);

  const selectableOrders = useMemo(
    () =>
      ordersWithMeta.filter(
        (order) => !missingOrderIdSet.has(String(order?.id || "").trim()),
      ),
    [missingOrderIdSet, ordersWithMeta],
  );

  const selectedOrders = useMemo(
    () =>
      selectableOrders.filter((order) =>
        selectedOrderIdSet.has(String(order?.id || "").trim()),
      ),
    [selectableOrders, selectedOrderIdSet],
  );

  useEffect(() => {
    const selectableOrderIds = new Set(
      selectableOrders
        .map((order) => String(order?.id || "").trim())
        .filter(Boolean),
    );

    setSelectedOrderIds((current) =>
      current.filter((orderId) => selectableOrderIds.has(orderId)),
    );
  }, [selectableOrders]);

  const allFilteredOrdersSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) =>
      selectedOrderIdSet.has(String(order?.id || "").trim()),
    );

  const summary = useMemo(() => {
    const totalOrderValue = filteredOrders.reduce(
      (sum, order) => sum + order._meta.totalPrice,
      0,
    );
    const netSales = filteredOrders.reduce(
      (sum, order) => sum + order._meta.netSalesAmount,
      0,
    );
    const paidCount = filteredOrders.filter((order) => order._meta.isPaid).length;
    const fulfilledCount = filteredOrders.filter(
      (order) => order._meta.isFulfilled,
    ).length;
    const refundedCount = filteredOrders.filter(
      (order) => order._meta.hasAnyRefund,
    ).length;

    return {
      totalOrders: filteredOrders.length,
      totalOrderValue,
      netSales,
      paidCount,
      fulfilledCount,
      refundedCount,
    };
  }, [filteredOrders]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const toggleOrderSelection = (orderId) => {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) {
      return;
    }

    setSelectedOrderIds((current) =>
      current.includes(normalizedOrderId)
        ? current.filter((value) => value !== normalizedOrderId)
        : [...current, normalizedOrderId],
    );
  };

  const clearSelectedOrders = () => {
    setSelectedOrderIds([]);
  };

  const toggleSelectAllFilteredOrders = () => {
    const filteredOrderIds = filteredOrders
      .map((order) => String(order?.id || "").trim())
      .filter(Boolean);

    if (filteredOrderIds.length === 0) {
      return;
    }

    if (allFilteredOrdersSelected) {
      setSelectedOrderIds((current) =>
        current.filter((orderId) => !filteredOrderIds.includes(orderId)),
      );
      return;
    }

    setSelectedOrderIds((current) =>
      Array.from(new Set([...current, ...filteredOrderIds])),
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "paid" || normalized === "completed") {
      return "bg-green-100 text-green-800";
    }
    if (normalized === "pending" || normalized === "authorized") {
      return "bg-yellow-100 text-yellow-800";
    }
    if (normalized === "partially_paid" || normalized === "partially_refunded") {
      return "bg-blue-100 text-blue-800";
    }
    if (normalized === "refunded" || normalized === "voided") {
      return "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const getFulfillmentColor = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "fulfilled") return "bg-green-100 text-green-800";
    if (normalized === "partial") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  const getPaymentMethodColor = (method) => {
    const normalized = String(method || "").toLowerCase();
    if (normalized === "shopify") return "bg-emerald-100 text-emerald-800";
    if (normalized === "instapay") return "bg-blue-100 text-blue-800";
    if (normalized === "wallet") return "bg-violet-100 text-violet-800";
    return "bg-slate-100 text-slate-700";
  };

  const renderOrderItemPreview = (order) => {
    const previews = Array.isArray(order?.item_previews)
      ? order.item_previews.filter(
          (item) =>
            item &&
            (String(item.image_url || "").trim() || String(item.title || "").trim()),
        )
      : [];

    if (previews.length === 0) {
      return (
        <span className="text-sm text-slate-700">
          {toNumber(order.items_count).toLocaleString()}
        </span>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {previews.slice(0, 3).map((item, index) => (
            <div
              key={`${item.id || item.title || "item"}-${index}`}
              className="h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-sm"
              title={item.title || "Order item"}
            >
              {String(item.image_url || "").trim() ? (
                <img
                  src={item.image_url}
                  alt={item.title || "Order item"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <Package size={16} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {toNumber(order.items_count).toLocaleString()} item(s)
          </p>
          <p className="truncate text-xs text-slate-500">
            {previews
              .slice(0, 2)
              .map((item) => item.title)
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Orders</h1>
                <p className="text-slate-600">
                  Live order feed with advanced filtering by status, payment, fulfillment, and refunds.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Sync Active
                  </span>
                  {lastUpdatedAt && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      <Clock3 size={12} />
                      {select("آخر تحديث", "Last refresh")}{" "}
                      {lastUpdatedAt.toLocaleTimeString(
                        locale === "ar" ? "ar-EG" : "en-US",
                      )}
                    </span>
                  )}
                  {lastLiveEventAt && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                      {select("آخر حدث", "Event")}{" "}
                      {lastLiveEventAt.toLocaleTimeString(
                        locale === "ar" ? "ar-EG" : "en-US",
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fetchOrders({ forceSync: true })}
                  className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw size={18} />
                  Refresh
                </button>
                <button
                  onClick={() => setIsExportPanelOpen((current) => !current)}
                  className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Download size={18} />
                  {isExportPanelOpen ? "Hide Export" : "Export"}
                </button>
              </div>
            </div>
          </div>

          <OrdersExportPanel
            isOpen={isExportPanelOpen}
            filteredOrders={filteredOrders}
            selectedOrders={selectedOrders}
            onClearSelectedOrders={clearSelectedOrders}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {missingOrderIds.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle size={18} className="mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold">
                    {select(
                      `${missingOrderIds.length.toLocaleString()} طلب خارج قائمة الطلبات الآن`,
                      `${missingOrderIds.length.toLocaleString()} orders are now outside the main orders list`,
                    )}
                  </p>
                  <p className="text-sm text-amber-800">
                    {select(
                      "هذه الطلبات انتقلت إلى صفحة الطلبات المفقودة لأنها لم تحصل على أي أكشن خلال آخر 3 أيام.",
                      "These orders moved to the Missing Orders page because they had no real action during the last 3 days.",
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("/orders/missing")}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
              >
                {select("فتح الطلبات المفقودة", "Open Missing Orders")}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="Orders"
              value={summary.totalOrders.toLocaleString()}
              icon={ShoppingCart}
              color="from-blue-500 to-blue-700"
            />
            <SummaryCard
              label="Order Value"
              value={formatAmount(summary.totalOrderValue)}
              subtitle="All filtered orders"
              icon={TrendingUp}
              color="from-amber-500 to-amber-700"
            />
            <SummaryCard
              label="Net Sales"
              value={formatAmount(summary.netSales)}
              subtitle="Paid after refunds"
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-700"
            />
            <SummaryCard
              label="Paid"
              value={summary.paidCount.toLocaleString()}
              icon={TrendingUp}
              color="from-violet-500 to-violet-700"
            />
            <SummaryCard
              label="Fulfilled"
              value={summary.fulfilledCount.toLocaleString()}
              icon={TrendingUp}
              color="from-teal-500 to-teal-700"
            />
            <SummaryCard
              label="Refunded"
              value={summary.refundedCount.toLocaleString()}
              icon={AlertCircle}
              color="from-rose-500 to-rose-700"
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Order Filters</h2>
              <button
                onClick={resetFilters}
                className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Search</label>
                <div className="relative">
                  <Search
                    className={`absolute top-2.5 text-slate-400 ${
                      isRTL ? "right-3" : "left-3"
                    }`}
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Order #, phone, customer, email, product, SKU..."
                    value={filters.searchTerm}
                    onChange={(event) =>
                      handleFilterChange("searchTerm", event.target.value)
                    }
                    className={`w-full py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      isRTL ? "pr-8 pl-3" : "pl-8 pr-3"
                    }`}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {select(
                    `يعرض آخر ${ORDERS_VISIBLE_LIMIT.toLocaleString()} طلب فقط. لو كتبت رقم أوردر من 3 إلى 6 أرقام هيتفهم كرقم أوردر أولًا. وما زال البحث يدعم أيضًا الفون، الاسم، الإيميل، المنتج، SKU، الدفع، والتنفيذ.`,
                    `Showing the latest ${ORDERS_VISIBLE_LIMIT.toLocaleString()} orders only. If you type a 3 to 6 digit number, it will be treated as an order number first. Search still supports phone, customer name, email, product, SKU, payment, and fulfillment.`,
                  )}
                </p>
                {normalizedDateRange.wasSwapped && (
                  <p className="mt-1 text-xs text-amber-700">
                    {select(
                      "تم تصحيح مدى التاريخ تلقائيًا لأن من تاريخ كان بعد إلى تاريخ.",
                      "Date range was auto-corrected because From Date was later than To Date.",
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">From Date</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => handleFilterChange("dateFrom", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">To Date</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => handleFilterChange("dateTo", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Order # From</label>
                <input
                  type="number"
                  value={filters.orderNumberFrom}
                  onChange={(event) =>
                    handleFilterChange("orderNumberFrom", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Order # To</label>
                <input
                  type="number"
                  value={filters.orderNumberTo}
                  onChange={(event) =>
                    handleFilterChange("orderNumberTo", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount Min</label>
                <input
                  type="number"
                  value={filters.amountMin}
                  onChange={(event) => handleFilterChange("amountMin", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount Max</label>
                <input
                  type="number"
                  value={filters.amountMax}
                  onChange={(event) => handleFilterChange("amountMax", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Status</label>
                <select
                  value={filters.paymentFilter}
                  onChange={(event) =>
                    handleFilterChange("paymentFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="paid_or_partial">Paid + Partial</option>
                  <option value="pending_or_authorized">Pending + Authorized</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="pending">Pending</option>
                  <option value="authorized">Authorized</option>
                  <option value="refunded">Refunded</option>
                  <option value="partially_refunded">Partially Refunded</option>
                  <option value="voided">Voided</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                <select
                  value={filters.paymentMethodFilter}
                  onChange={(event) =>
                    handleFilterChange("paymentMethodFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="shopify">Shopify</option>
                  <option value="instapay">InstaPay</option>
                  <option value="wallet">Wallet</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Fulfillment</label>
                <select
                  value={filters.fulfillmentFilter}
                  onChange={(event) =>
                    handleFilterChange("fulfillmentFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="partial">Partial</option>
                  <option value="unfulfilled">Unfulfilled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Refund Filter</label>
                <select
                  value={filters.refundFilter}
                  onChange={(event) =>
                    handleFilterChange("refundFilter", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="any">Any Refund</option>
                  <option value="partial">Partial Refund</option>
                  <option value="full">Full Refund</option>
                  <option value="none">No Refund</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Sort</label>
                <select
                  value={filters.sortBy}
                  onChange={(event) => handleFilterChange("sortBy", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="amount_desc">Amount (High)</option>
                  <option value="amount_asc">Amount (Low)</option>
                  <option value="order_desc">Order # (High)</option>
                  <option value="order_asc">Order # (Low)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.paidOnly}
                  onChange={(event) => handleFilterChange("paidOnly", event.target.checked)}
                />
                Paid only
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.fulfilledOnly}
                  onChange={(event) =>
                    handleFilterChange("fulfilledOnly", event.target.checked)
                  }
                />
                Fulfilled only
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.cancelledOnly}
                  onChange={(event) =>
                    handleFilterChange("cancelledOnly", event.target.checked)
                  }
                />
                Cancelled only
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Orders Table</p>
                <p className="text-xs text-slate-500">
                  {filteredOrders.length.toLocaleString()} filtered orders,{" "}
                  {selectedOrders.length.toLocaleString()} selected for export.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllFilteredOrders}
                  disabled={filteredOrders.length === 0}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {allFilteredOrdersSelected ? "Unselect filtered" : "Select filtered"}
                </button>
                <button
                  type="button"
                  onClick={clearSelectedOrders}
                  disabled={selectedOrders.length === 0}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear selected
                </button>
              </div>
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="data-table w-full min-w-[1280px]">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      <input
                        type="checkbox"
                        checked={allFilteredOrdersSelected}
                        onChange={toggleSelectAllFilteredOrders}
                      />
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("الطلب", "Order")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("العميل", "Customer")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("العناصر", "Items")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("الإجمالي", "Total")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("الدفع", "Payment")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("طريقة الدفع", "Payment Method")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("التنفيذ", "Fulfillment")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("الاسترداد", "Refund")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("التاريخ", "Date")}
                    </th>
                    <th
                      className={`px-4 py-3 text-sm font-semibold text-slate-700 ${tableHeaderAlignClass}`}
                    >
                      {select("التفاصيل", "Details")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadStatus.active && orders.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="px-6 py-10 text-center text-slate-500">
                        {select(
                          "ستظهر أحدث الطلبات هنا تلقائيًا.",
                          "Latest orders will appear here automatically.",
                        )}
                      </td>
                    </tr>
                  ) : filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedOrderIdSet.has(String(order?.id || "").trim())}
                            onChange={() => toggleOrderSelection(order.id)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          #{order.order_number || order.shopify_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-800">
                            {order.customer_name || "Unknown"}
                          </p>
                          <p className="text-xs text-slate-500">{order.customer_email || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {renderOrderItemPreview(order)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          {formatAmount(order._meta.totalPrice)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                              order._meta.paymentStatus,
                            )}`}
                          >
                            {order._meta.paymentStatus || "n/a"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentMethodColor(
                              order._meta.paymentMethod,
                            )}`}
                          >
                            {PAYMENT_METHOD_LABELS[order._meta.paymentMethod] || "None"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getFulfillmentColor(
                              order._meta.fulfillmentStatus,
                            )}`}
                          >
                            {order._meta.fulfillmentStatus || "unfulfilled"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {order._meta.hasAnyRefund ? (
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                order._meta.isPartialRefund
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {order._meta.isPartialRefund ? "Partial" : "Full"}
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                              None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                            className="text-sky-700 hover:text-sky-900 flex items-center gap-1 text-sm font-medium"
                          >
                            <Eye size={15} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="11" className="px-6 py-12 text-center text-slate-500">
                        <ShoppingCart size={44} className="mx-auto mb-3 text-slate-300" />
                        <p className="font-semibold mb-1">No matching orders found</p>
                        <p className="text-sm">Try adjusting or resetting filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-100">
              {loadStatus.active && orders.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-500">
                  Latest orders will appear here automatically.
                </div>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <article key={order.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">Order</p>
                        <p className="text-base font-semibold text-slate-900">
                          #{order.order_number || order.shopify_id}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="text-sky-700 hover:text-sky-900 flex items-center gap-1 text-sm font-medium"
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedOrderIdSet.has(String(order?.id || "").trim())}
                        onChange={() => toggleOrderSelection(order.id)}
                      />
                      Select for export
                    </label>

                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {order.customer_name || "Unknown"}
                      </p>
                      <p className="text-xs text-slate-500">{order.customer_email || "-"}</p>
                    </div>

                    <div className="space-y-3">
                      <div>{renderOrderItemPreview(order)}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <p className="text-slate-600">
                          Items:{" "}
                          <span className="font-medium text-slate-900">
                            {toNumber(order.items_count).toLocaleString()}
                          </span>
                        </p>
                        <p className="text-slate-600">
                          Total:{" "}
                          <span className="font-medium text-slate-900">
                            {formatAmount(order._meta.totalPrice)}
                          </span>
                        </p>
                        <p className="text-slate-600">
                          Date:{" "}
                          <span className="font-medium text-slate-900">
                            {formatDate(order.created_at)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          order._meta.paymentStatus,
                        )}`}
                      >
                        {order._meta.paymentStatus || "n/a"}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentMethodColor(
                          order._meta.paymentMethod,
                        )}`}
                      >
                        {PAYMENT_METHOD_LABELS[order._meta.paymentMethod] || "None"}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getFulfillmentColor(
                          order._meta.fulfillmentStatus,
                        )}`}
                      >
                        {order._meta.fulfillmentStatus || "unfulfilled"}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="px-5 py-12 text-center text-slate-500">
                  <ShoppingCart size={44} className="mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold mb-1">No matching orders found</p>
                  <p className="text-sm">Try adjusting or resetting filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, subtitle = "", icon: Icon, color }) {
  return (
    <div className={`bg-gradient-to-r ${color} rounded-xl text-white p-4`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-white/90">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle ? (
            <p className="text-xs text-white/80 mt-1">{subtitle}</p>
          ) : null}
        </div>
        <Icon size={24} />
      </div>
    </div>
  );
}
