import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  User,
  Users,
} from "lucide-react";
import api from "../utils/api";
import {
  ProgressiveLoadBanner,
  ProgressiveTableSkeleton,
} from "../components/ProgressiveLoadState";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { subscribeToSharedDataUpdates } from "../utils/realtime";
import { fetchAllPagesProgressively } from "../utils/pagination";
import {
  buildStoreScopedCacheKey,
  isCacheFresh,
  readCachedView,
  writeCachedView,
} from "../utils/viewCache";

const CUSTOMERS_PAGE_SIZE = 200;
const ORDERS_PAGE_SIZE = 200;
const CUSTOMER_ORDER_SCAN_PAGES = 4;
const CUSTOMERS_CACHE_FRESH_MS = 2 * 60 * 60 * 1000;
const CUSTOMERS_BACKGROUND_REFRESH_MS = 2 * 60 * 60 * 1000;
const CURRENCY_LABEL = "LE";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => `${toNumber(value).toFixed(2)} ${CURRENCY_LABEL}`;

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getOrderCustomerId = (order) =>
  String(order?.customer_shopify_id || order?.customer_id || "");

const getOrderFinancialStatus = (order) => {
  return String(
    order?.financial_status || order?.status || "",
  )
    .toLowerCase()
    .trim();
};

export default function Customers() {
  const { hasPermission } = useAuth();
  const canViewOrders = hasPermission("can_view_orders");

  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [relatedOrdersLoading, setRelatedOrdersLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [loadStatus, setLoadStatus] = useState({
    active: false,
    message: "",
  });
  const fetchPromiseRef = useRef(null);
  const customersRef = useRef([]);
  const cacheKey = useMemo(
    () => buildStoreScopedCacheKey("customers:list"),
    [],
  );

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    let active = true;

    readCachedView(cacheKey).then((cached) => {
      const cachedCustomers = Array.isArray(cached?.value?.customers)
        ? cached.value.customers
        : [];

      if (!active || cachedCustomers.length === 0) {
        return;
      }

      setCustomers(cachedCustomers);
      setOrders([]);
      setLastUpdatedAt(
        cached?.updatedAt ? new Date(cached.updatedAt) : new Date(),
      );
      setLoadStatus({
        active: false,
        message: `Showing ${cachedCustomers.length.toLocaleString()} cached customers`,
      });
    });

    return () => {
      active = false;
    };
  }, [cacheKey, canViewOrders]);

  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      if (fetchPromiseRef.current) {
        return fetchPromiseRef.current;
      }

      const request = (async () => {
        const hasVisibleCustomers = customersRef.current.length > 0;

        if (!silent) {
          setLoading(!hasVisibleCustomers);
          setError("");
        }

        setLoadStatus({
          active: true,
          message: "Loading customers in batches...",
        });

        try {
          const customersData = await fetchAllPagesProgressively(
            ({ limit, offset }) =>
              api.get("/shopify/customers", {
                params: {
                  limit,
                  offset,
                  sort_by: "created_at",
                  sort_dir: "desc",
                },
              }),
            {
              limit: CUSTOMERS_PAGE_SIZE,
              onPage: ({ rows: accumulatedRows, hasMore }) => {
                setCustomers(accumulatedRows);
                setLastUpdatedAt(new Date());
                setLoadStatus({
                  active: hasMore,
                  message: hasMore
                    ? `Loaded ${accumulatedRows.length.toLocaleString()} customers so far...`
                    : `Loaded ${accumulatedRows.length.toLocaleString()} customers`,
                });
                if (!silent) {
                  setLoading(false);
                }
              },
            },
          );

          setCustomers(customersData);
          setOrders([]);
          setLastUpdatedAt(new Date());
          setLoadStatus({
            active: false,
            message:
              customersData.length > 0
                ? `Loaded ${customersData.length.toLocaleString()} customers`
                : "No customers found",
          });
          await writeCachedView(cacheKey, {
            customers: customersData,
          });
        } catch (requestError) {
          console.error("Failed to fetch customers:", requestError);
          if (!silent) {
            if (customersRef.current.length === 0) {
              setCustomers([]);
              setOrders([]);
              setError("Failed to load customers");
            } else {
              setError("Showing saved customers while refresh failed");
            }
          }
          setLoadStatus((current) =>
            current.message && customersRef.current.length > 0
              ? { active: false, message: current.message }
              : { active: false, message: "" },
          );
        } finally {
          if (!silent) {
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
    },
    [cacheKey],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await readCachedView(cacheKey);
      if (!active) {
        return;
      }

      if (!isCacheFresh(cached, CUSTOMERS_CACHE_FRESH_MS)) {
        await fetchData({ silent: Boolean(cached?.value?.customers?.length) });
      }
    })();

    const unsubscribe = subscribeToSharedDataUpdates(() => {
      fetchData({ silent: true });
    });

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      fetchData({ silent: true });
    }, CUSTOMERS_BACKGROUND_REFRESH_MS);

    const onFocus = async () => {
      const cached = await readCachedView(cacheKey);
      if (isCacheFresh(cached, CUSTOMERS_CACHE_FRESH_MS)) {
        return;
      }

      fetchData({ silent: true });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [cacheKey, fetchData]);

  const loadSelectedCustomerOrders = useCallback(
    async (customer) => {
      if (!canViewOrders || !customer) {
        setOrders([]);
        setRelatedOrdersLoading(false);
        return;
      }

      const customerId = String(customer.shopify_id || "").trim();
      const customerEmail = normalizeText(customer.email);
      const matchedOrders = [];
      const seenOrderIds = new Set();

      setRelatedOrdersLoading(true);
      setOrders([]);

      try {
        await fetchAllPagesProgressively(
          ({ limit, offset }) =>
            api.get("/shopify/orders", {
              params: {
                limit,
                offset,
                sort_by: "created_at",
                sort_dir: "desc",
                sync_recent: "false",
              },
            }),
          {
            limit: ORDERS_PAGE_SIZE,
            maxPages: CUSTOMER_ORDER_SCAN_PAGES,
            onPage: ({ batch, pageIndex }) => {
              batch.forEach((order) => {
                const byEmail =
                  customerEmail &&
                  normalizeText(order.customer_email) === customerEmail;
                const byId = customerId && getOrderCustomerId(order) === customerId;
                if (!byEmail && !byId) {
                  return;
                }

                const orderId = String(order.id || order.shopify_id || "");
                if (!orderId || seenOrderIds.has(orderId)) {
                  return;
                }

                seenOrderIds.add(orderId);
                matchedOrders.push(order);
              });

              matchedOrders.sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at),
              );
              setOrders([...matchedOrders].slice(0, 8));

              return matchedOrders.length < 8 && pageIndex + 1 < CUSTOMER_ORDER_SCAN_PAGES;
            },
          },
        );
      } catch (requestError) {
        console.error("Failed to fetch related customer orders:", requestError);
      } finally {
        setRelatedOrdersLoading(false);
      }
    },
    [canViewOrders],
  );

  useEffect(() => {
    if (!selectedCustomer) {
      setOrders([]);
      setRelatedOrdersLoading(false);
      return;
    }

    loadSelectedCustomerOrders(selectedCustomer);
  }, [loadSelectedCustomerOrders, selectedCustomer]);

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          customers
            .map((customer) => String(customer.city || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [customers],
  );

  const countryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          customers
            .map((customer) => String(customer.country || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (searchTerm.trim()) {
      const query = normalizeText(searchTerm);
      result = result.filter((customer) => {
        const name = normalizeText(customer.name);
        const email = normalizeText(customer.email);
        const phone = normalizeText(customer.phone);
        return (
          name.includes(query) || email.includes(query) || phone.includes(query)
        );
      });
    }

    if (cityFilter !== "all") {
      result = result.filter(
        (customer) => normalizeText(customer.city) === normalizeText(cityFilter),
      );
    }

    if (countryFilter !== "all") {
      result = result.filter(
        (customer) =>
          normalizeText(customer.country) === normalizeText(countryFilter),
      );
    }

    result.sort((a, b) => toNumber(b.total_spent) - toNumber(a.total_spent));
    return result;
  }, [cityFilter, countryFilter, customers, searchTerm]);

  const summary = useMemo(() => {
    const totalCustomers = filteredCustomers.length;
    const totalOrders = filteredCustomers.reduce(
      (sum, customer) => sum + toNumber(customer.orders_count),
      0,
    );
    const totalSpent = filteredCustomers.reduce(
      (sum, customer) => sum + toNumber(customer.total_spent),
      0,
    );
    const avgSpent = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

    return {
      totalCustomers,
      totalOrders,
      totalSpent,
      avgSpent,
    };
  }, [filteredCustomers]);

  const selectedCustomerMeta = useMemo(() => {
    if (!selectedCustomer) return null;
    const data = parseJson(selectedCustomer.data);

    return {
      data,
      relatedOrders: canViewOrders ? orders.slice(0, 8) : [],
      tags: Array.isArray(data.tags)
        ? data.tags
        : String(data.tags || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      lastOrderName: data.last_order_name || data.last_order?.name || "",
      defaultAddress: data.default_address || {},
    };
  }, [canViewOrders, orders, selectedCustomer]);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
              <p className="text-slate-600">
                Detailed customer profiles with spend, location, and order activity.
              </p>
              {lastUpdatedAt && (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                  <Clock3 size={12} />
                  Last refresh: {lastUpdatedAt.toLocaleTimeString("ar-EG")}
                </p>
              )}
            </div>
            <button
              onClick={() => fetchData()}
              disabled={loading || loadStatus.active}
              className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw
                size={18}
                className={loading || loadStatus.active ? "animate-spin" : ""}
              />
              {loading || loadStatus.active ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          <ProgressiveLoadBanner
            active={loadStatus.active}
            loadedCount={customers.length}
            batchSize={CUSTOMERS_PAGE_SIZE}
            itemLabel="customers"
            message={loadStatus.message}
            lastUpdatedAt={lastUpdatedAt}
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={Users}
              label="Customers"
              value={summary.totalCustomers.toLocaleString()}
            />
            <SummaryCard
              icon={ShoppingCart}
              label="Orders"
              value={summary.totalOrders.toLocaleString()}
            />
            <SummaryCard
              icon={ShoppingCart}
              label="Total Spent"
              value={formatAmount(summary.totalSpent)}
            />
            <SummaryCard
              icon={User}
              label="Avg Spend"
              value={formatAmount(summary.avgSpent)}
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Name, email, phone..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">City</label>
                <select
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Country</label>
                <select
                  value={countryFilter}
                  onChange={(event) => setCountryFilter(event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  {countryOptions.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading && customers.length === 0 ? (
            <ProgressiveTableSkeleton rows={8} columns={5} />
          ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[980px]">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Total Spent
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && customers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-10 text-center text-slate-500">
                        Loading customers...
                      </td>
                    </tr>
                  ) : filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className={`border-b hover:bg-slate-50 transition cursor-pointer ${
                          selectedCustomer?.id === customer.id ? "bg-sky-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">
                          {customer.name || "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {customer.email || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {customer.phone || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {[customer.city, customer.country].filter(Boolean).join(", ") || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {toNumber(customer.orders_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          {formatAmount(customer.total_spent)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {customer.created_at
                            ? new Date(customer.created_at).toLocaleDateString("ar-EG")
                            : "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-10 text-center text-slate-500">
                        No customers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {selectedCustomer && selectedCustomerMeta && (
            <div className="bg-white rounded-xl shadow p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  Customer Details: {selectedCustomer.name || "Unknown"}
                </h2>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <InfoItem icon={Mail} label="Email" value={selectedCustomer.email || "-"} />
                <InfoItem icon={Phone} label="Phone" value={selectedCustomer.phone || "-"} />
                <InfoItem
                  icon={MapPin}
                  label="Location"
                  value={
                    [
                      selectedCustomer.city || selectedCustomerMeta.defaultAddress?.city,
                      selectedCustomer.country ||
                        selectedCustomerMeta.defaultAddress?.country,
                    ]
                      .filter(Boolean)
                      .join(", ") || "-"
                  }
                />
                <InfoItem
                  icon={ShoppingCart}
                  label="Orders / Spent"
                  value={`${toNumber(selectedCustomer.orders_count)} / ${formatAmount(
                    selectedCustomer.total_spent,
                  )}`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">Address</h3>
                  <p className="text-sm text-slate-600">
                    {selectedCustomer.default_address ||
                      selectedCustomerMeta.defaultAddress?.address1 ||
                      "No address provided"}
                  </p>
                  <p className="text-sm text-slate-600">
                    {selectedCustomerMeta.defaultAddress?.zip || ""}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">Profile</h3>
                  <p className="text-sm text-slate-600">
                    Last order: {selectedCustomerMeta.lastOrderName || "-"}
                  </p>
                  <p className="text-sm text-slate-600">
                    Joined:{" "}
                    {selectedCustomer.created_at
                      ? new Date(selectedCustomer.created_at).toLocaleDateString("ar-EG")
                      : "-"}
                  </p>
                  <p className="text-sm text-slate-600">
                    Tags:{" "}
                    {selectedCustomerMeta.tags.length > 0
                      ? selectedCustomerMeta.tags.join(", ")
                      : "-"}
                  </p>
                </div>
              </div>

              {canViewOrders ? (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Recent Orders</h3>
                  {relatedOrdersLoading ? (
                    <p className="text-sm text-slate-500">
                      Loading recent orders for this customer...
                    </p>
                  ) : selectedCustomerMeta.relatedOrders.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No related orders found in the scanned order batches.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data-table w-full min-w-[760px]">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b">
                            <th className="py-2">Order</th>
                            <th className="py-2">Date</th>
                            <th className="py-2">Total</th>
                            <th className="py-2">Payment</th>
                            <th className="py-2">Fulfillment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCustomerMeta.relatedOrders.map((order) => (
                            <tr key={order.id} className="border-b last:border-b-0">
                              <td className="py-2 text-sm text-slate-800">
                                #{order.order_number || order.shopify_id}
                              </td>
                              <td className="py-2 text-sm text-slate-600">
                                {order.created_at
                                  ? new Date(order.created_at).toLocaleDateString("ar-EG")
                                  : "-"}
                              </td>
                              <td className="py-2 text-sm text-slate-700">
                                {formatAmount(order.total_price)}
                              </td>
                              <td className="py-2 text-sm text-slate-600">
                                {getOrderFinancialStatus(order) || "-"}
                              </td>
                              <td className="py-2 text-sm text-slate-600">
                                {order.fulfillment_status || "unfulfilled"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Order list is hidden because this account does not have order-view access.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <Icon size={22} className="text-sky-600" />
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500 flex items-center gap-1">
        <Icon size={12} />
        {label}
      </p>
      <p className="text-sm font-medium text-slate-800 mt-1 break-words">{value}</p>
    </div>
  );
}
