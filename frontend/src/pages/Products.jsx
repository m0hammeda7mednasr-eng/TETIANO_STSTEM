import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2,
  Eye,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  TrendingUp,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import ProductEditModal from "../components/ProductEditModal";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import {
  markSharedDataUpdated,
  subscribeToSharedDataUpdates,
} from "../utils/realtime";
import { fetchAllPagesProgressively } from "../utils/pagination";
import {
  buildStoreScopedCacheKey,
  isCacheFresh,
  peekCachedView,
  readCachedView,
  writeCachedView,
} from "../utils/viewCache";
import {
  HEAVY_VIEW_CACHE_FRESH_MS,
  shouldAutoRefreshView,
} from "../utils/refreshPolicy";

const PRODUCTS_PAGE_SIZE = 200;
const PRODUCTS_CACHE_FRESH_MS = HEAVY_VIEW_CACHE_FRESH_MS;
const CURRENCY_LABEL = "LE";

const INITIAL_FILTERS = {
  searchTerm: "",
  vendor: "all",
  productType: "all",
  stockStatus: "all",
  syncStatus: "all",
  minPrice: "",
  maxPrice: "",
  minInventory: "",
  maxInventory: "",
  updatedFrom: "",
  updatedTo: "",
  profitability: "all",
  sortBy: "updated_desc",
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => `${toNumber(value).toFixed(2)} ${CURRENCY_LABEL}`;

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (dateString) => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (dateString) => {
  const date = new Date(dateString);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getStockState = (inventoryQuantity) => {
  const quantity = toNumber(inventoryQuantity);
  if (quantity <= 0) return "out_of_stock";
  if (quantity < 10) return "low_stock";
  return "in_stock";
};

const getSyncState = (product) => {
  if (product.pending_sync) return "pending";
  if (product.sync_error) return "failed";
  if (product.last_synced_at) return "synced";
  return "never";
};

const getProfitabilityState = (product) => {
  const hasCost =
    product.cost_price !== null &&
    product.cost_price !== undefined &&
    product.cost_price !== "";
  if (!hasCost) return "no_cost";

  const profit = toNumber(product.price) - toNumber(product.cost_price);
  if (profit > 0) return "profitable";
  if (profit < 0) return "loss";
  return "break_even";
};
const isProductsRelatedSharedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return source.includes("/shopify/products") || source.includes("/products/");
};

export default function Products() {
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const canEditProducts = hasPermission("can_edit_products");
  const cacheKey = useMemo(
    () => buildStoreScopedCacheKey("products:list"),
    [],
  );
  const initialCachedSnapshot = useMemo(() => {
    const cached = peekCachedView(cacheKey);
    return {
      rows: Array.isArray(cached?.value?.rows) ? cached.value.rows : [],
      updatedAt: cached?.updatedAt ? new Date(cached.updatedAt) : null,
    };
  }, [cacheKey]);

  const [products, setProducts] = useState(() => initialCachedSnapshot.rows);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [, setLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(
    () => initialCachedSnapshot.updatedAt,
  );
  const [loadStatus, setLoadStatus] = useState({
    active: false,
    message: "",
  });
  const fetchPromiseRef = useRef(null);
  const productsRef = useRef([]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    let active = true;

    readCachedView(cacheKey).then((cached) => {
      const cachedRows = Array.isArray(cached?.value?.rows) ? cached.value.rows : [];
      if (!active || cachedRows.length === 0 || cachedRows.length <= productsRef.current.length) {
        return;
      }

      setProducts(cachedRows);
      setLastUpdatedAt(
        cached?.updatedAt ? new Date(cached.updatedAt) : new Date(),
      );
      setLoadStatus({
        active: false,
        message: `Showing ${cachedRows.length.toLocaleString()} cached products`,
      });
    });

    return () => {
      active = false;
    };
  }, [cacheKey]);

  const showNotification = useCallback((message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const fetchProducts = useCallback(
    async ({ silent = false } = {}) => {
      if (fetchPromiseRef.current) {
        return fetchPromiseRef.current;
      }

      const request = (async () => {
        if (!silent) {
          setLoading(false);
          setError("");
        }

        setLoadStatus({
          active: true,
          message: "Loading products in batches...",
        });

        try {
          const rows = await fetchAllPagesProgressively(
            ({ limit, offset }) =>
              api.get("/shopify/products", {
                params: {
                  limit,
                  offset,
                  sort_by: "updated_at",
                  sort_dir: "desc",
                },
              }),
            {
              limit: PRODUCTS_PAGE_SIZE,
              onPage: ({ rows: accumulatedRows, hasMore }) => {
                setProducts(accumulatedRows);
                setLastUpdatedAt(new Date());
                setLoadStatus({
                  active: hasMore,
                  message: hasMore
                    ? `Loaded ${accumulatedRows.length.toLocaleString()} products so far...`
                    : `Loaded ${accumulatedRows.length.toLocaleString()} products`,
                });
              },
            },
          );

          setProducts(rows);
          setLastUpdatedAt(new Date());
          setLoadStatus({
            active: false,
            message:
              rows.length > 0
                ? `Loaded ${rows.length.toLocaleString()} products`
                : "No products found",
          });
          await writeCachedView(cacheKey, { rows });
        } catch (requestError) {
          console.error("Error fetching products:", requestError);
          if (!silent) {
            if (productsRef.current.length === 0) {
              setProducts([]);
              setError("Failed to load products");
            } else {
              setError("Showing saved products while refresh failed");
            }
            showNotification("Failed to load products", "error");
          }
          setLoadStatus((current) =>
            current.message && productsRef.current.length > 0
              ? { active: false, message: current.message }
              : { active: false, message: "" },
          );
        } finally {
          setLoading(false);
        }
      })();

      fetchPromiseRef.current = request;

      try {
        await request;
      } finally {
        fetchPromiseRef.current = null;
      }
    },
    [cacheKey, showNotification],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await readCachedView(cacheKey);
      if (!active) {
        return;
      }

      const hasCachedRows = Array.isArray(cached?.value?.rows) && cached.value.rows.length > 0;
      if (!hasCachedRows && !isCacheFresh(cached, PRODUCTS_CACHE_FRESH_MS)) {
        await fetchProducts({ silent: true });
      }
    })();

    let unsubscribe = () => {};
    let onFocus = null;
    let interval = null;

    if (shouldAutoRefreshView()) {
      unsubscribe = subscribeToSharedDataUpdates((event) => {
        if (!isProductsRelatedSharedUpdate(event)) {
          return;
        }

        fetchProducts({ silent: true });
      });

      interval = setInterval(() => {
        if (document.visibilityState !== "visible") {
          return;
        }

        fetchProducts({ silent: true });
      }, PRODUCTS_CACHE_FRESH_MS);

      onFocus = async () => {
        const cached = await readCachedView(cacheKey);
        if (isCacheFresh(cached, PRODUCTS_CACHE_FRESH_MS)) {
          return;
        }

        fetchProducts({ silent: true });
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
  }, [cacheKey, fetchProducts]);

  const productsWithMeta = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        _meta: {
          stockState: getStockState(product.inventory_quantity),
          syncState: getSyncState(product),
          profitabilityState: getProfitabilityState(product),
          updatedAt: normalizeDate(
            product.local_updated_at ||
              product.last_synced_at ||
              product.updated_at ||
              product.created_at,
          ),
        },
      })),
    [products],
  );

  const vendorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.vendor || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.product_type || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let result = [...productsWithMeta];

    if (filters.searchTerm.trim()) {
      const keyword = filters.searchTerm.trim().toLowerCase();
      result = result.filter((product) => {
        const title = String(product.title || "").toLowerCase();
        const vendor = String(product.vendor || "").toLowerCase();
        const sku = String(product.sku || "").toLowerCase();
        const type = String(product.product_type || "").toLowerCase();
        return (
          title.includes(keyword) ||
          vendor.includes(keyword) ||
          sku.includes(keyword) ||
          type.includes(keyword)
        );
      });
    }

    if (filters.vendor !== "all") {
      result = result.filter(
        (product) => String(product.vendor || "") === filters.vendor,
      );
    }

    if (filters.productType !== "all") {
      result = result.filter(
        (product) => String(product.product_type || "") === filters.productType,
      );
    }

    if (filters.stockStatus !== "all") {
      result = result.filter(
        (product) => product._meta.stockState === filters.stockStatus,
      );
    }

    if (filters.syncStatus !== "all") {
      result = result.filter((product) => product._meta.syncState === filters.syncStatus);
    }

    if (filters.minPrice) {
      const minPrice = toNumber(filters.minPrice);
      result = result.filter((product) => toNumber(product.price) >= minPrice);
    }

    if (filters.maxPrice) {
      const maxPrice = toNumber(filters.maxPrice);
      result = result.filter((product) => toNumber(product.price) <= maxPrice);
    }

    if (filters.minInventory) {
      const minInventory = toNumber(filters.minInventory);
      result = result.filter(
        (product) => toNumber(product.inventory_quantity) >= minInventory,
      );
    }

    if (filters.maxInventory) {
      const maxInventory = toNumber(filters.maxInventory);
      result = result.filter(
        (product) => toNumber(product.inventory_quantity) <= maxInventory,
      );
    }

    if (filters.updatedFrom) {
      const from = startOfDay(filters.updatedFrom);
      result = result.filter(
        (product) => product._meta.updatedAt && product._meta.updatedAt >= from,
      );
    }

    if (filters.updatedTo) {
      const to = endOfDay(filters.updatedTo);
      result = result.filter(
        (product) => product._meta.updatedAt && product._meta.updatedAt <= to,
      );
    }

    if (isAdmin && filters.profitability !== "all") {
      result = result.filter(
        (product) => product._meta.profitabilityState === filters.profitability,
      );
    }

    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "title_asc":
          return String(a.title || "").localeCompare(String(b.title || ""));
        case "title_desc":
          return String(b.title || "").localeCompare(String(a.title || ""));
        case "price_desc":
          return toNumber(b.price) - toNumber(a.price);
        case "price_asc":
          return toNumber(a.price) - toNumber(b.price);
        case "inventory_desc":
          return toNumber(b.inventory_quantity) - toNumber(a.inventory_quantity);
        case "inventory_asc":
          return toNumber(a.inventory_quantity) - toNumber(b.inventory_quantity);
        case "updated_asc":
          return (
            (a._meta.updatedAt ? a._meta.updatedAt.getTime() : 0) -
            (b._meta.updatedAt ? b._meta.updatedAt.getTime() : 0)
          );
        case "updated_desc":
        default:
          return (
            (b._meta.updatedAt ? b._meta.updatedAt.getTime() : 0) -
            (a._meta.updatedAt ? a._meta.updatedAt.getTime() : 0)
          );
      }
    });

    return result;
  }, [filters, isAdmin, productsWithMeta]);

  const summary = useMemo(() => {
    const outOfStock = filteredProducts.filter(
      (product) => product._meta.stockState === "out_of_stock",
    ).length;
    const lowStock = filteredProducts.filter(
      (product) => product._meta.stockState === "low_stock",
    ).length;
    const totalInventory = filteredProducts.reduce(
      (sum, product) => sum + toNumber(product.inventory_quantity),
      0,
    );
    const syncedCount = filteredProducts.filter(
      (product) => product._meta.syncState === "synced",
    ).length;

    return {
      totalProducts: filteredProducts.length,
      outOfStock,
      lowStock,
      totalInventory,
      syncedCount,
    };
  }, [filteredProducts]);

  const handleEditProduct = async (productId, updates) => {
    try {
      setProducts((prevProducts) =>
        prevProducts.map((product) =>
          product.id === productId
            ? {
                ...product,
                price: updates.price,
                ...(isAdmin && updates.cost_price !== undefined
                  ? { cost_price: updates.cost_price }
                  : {}),
                ...(updates.inventory !== undefined
                  ? {
                      inventory_quantity: updates.inventory,
                      total_inventory: updates.inventory,
                    }
                  : {}),
                pending_sync: true,
              }
            : product,
        ),
      );

      const payload = {
        price: updates.price,
      };
      if (updates.inventory !== undefined) {
        payload.inventory = updates.inventory;
      }
      if (isAdmin && updates.cost_price !== undefined) {
        payload.cost_price = updates.cost_price;
      }

      const response = await api.post(`/shopify/products/${productId}/update`, payload);
      if (response.data.success) {
        showNotification("Product updated and queued for sync", "success");
        markSharedDataUpdated();
        fetchProducts({ silent: true });
      }
    } catch (requestError) {
      console.error("Error updating product:", requestError);
      showNotification(
        requestError.response?.data?.error || "Failed to update product",
        "error",
      );
      fetchProducts({ silent: true });
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const getSyncStatusIcon = (product) => {
    if (product.pending_sync) {
      return <Clock size={16} className="text-yellow-500" title="Pending sync" />;
    }
    if (product.sync_error) {
      return <AlertCircle size={16} className="text-red-500" title={product.sync_error} />;
    }
    if (product.last_synced_at) {
      return <CheckCircle size={16} className="text-green-500" title="Synced" />;
    }
    return null;
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          {notification && (
            <div
              className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white ${
                notification.type === "success"
                  ? "bg-emerald-600"
                  : notification.type === "error"
                    ? "bg-red-600"
                    : "bg-sky-600"
              }`}
            >
              {notification.message}
            </div>
          )}

          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Products</h1>
              <p className="text-slate-600">
                Advanced filtering, professional editing, and stock visibility.
              </p>
              {lastUpdatedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Last refresh: {lastUpdatedAt.toLocaleTimeString("ar-EG")}
                </p>
              )}
            </div>
            <button
              onClick={() => fetchProducts()}
              className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

          {(error || notification?.type === "error") && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              {error || notification?.message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <SummaryCard
              label="Products"
              value={summary.totalProducts.toLocaleString()}
              icon={Package}
              color="from-indigo-500 to-indigo-700"
            />
            <SummaryCard
              label="Total Stock"
              value={summary.totalInventory.toLocaleString()}
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-700"
            />
            <SummaryCard
              label="Low Stock"
              value={summary.lowStock.toLocaleString()}
              icon={AlertCircle}
              color="from-amber-500 to-amber-700"
            />
            <SummaryCard
              label="Out of Stock"
              value={summary.outOfStock.toLocaleString()}
              icon={AlertCircle}
              color="from-rose-500 to-rose-700"
            />
            <SummaryCard
              label="Synced"
              value={summary.syncedCount.toLocaleString()}
              icon={CheckCircle}
              color="from-cyan-500 to-cyan-700"
            />
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Product Filters</h2>
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
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Name, SKU, vendor, type..."
                    value={filters.searchTerm}
                    onChange={(event) =>
                      handleFilterChange("searchTerm", event.target.value)
                    }
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Vendor</label>
                <select
                  value={filters.vendor}
                  onChange={(event) => handleFilterChange("vendor", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  {vendorOptions.map((vendor) => (
                    <option key={vendor} value={vendor}>
                      {vendor}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Type</label>
                <select
                  value={filters.productType}
                  onChange={(event) =>
                    handleFilterChange("productType", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Stock</label>
                <select
                  value={filters.stockStatus}
                  onChange={(event) =>
                    handleFilterChange("stockStatus", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="in_stock">In stock</option>
                  <option value="low_stock">Low stock</option>
                  <option value="out_of_stock">Out of stock</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Sync</label>
                <select
                  value={filters.syncStatus}
                  onChange={(event) =>
                    handleFilterChange("syncStatus", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All</option>
                  <option value="synced">Synced</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Price Min</label>
                <input
                  type="number"
                  value={filters.minPrice}
                  onChange={(event) => handleFilterChange("minPrice", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Price Max</label>
                <input
                  type="number"
                  value={filters.maxPrice}
                  onChange={(event) => handleFilterChange("maxPrice", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Inventory Min</label>
                <input
                  type="number"
                  value={filters.minInventory}
                  onChange={(event) =>
                    handleFilterChange("minInventory", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Inventory Max</label>
                <input
                  type="number"
                  value={filters.maxInventory}
                  onChange={(event) =>
                    handleFilterChange("maxInventory", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Updated From</label>
                <input
                  type="date"
                  value={filters.updatedFrom}
                  onChange={(event) =>
                    handleFilterChange("updatedFrom", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Updated To</label>
                <input
                  type="date"
                  value={filters.updatedTo}
                  onChange={(event) =>
                    handleFilterChange("updatedTo", event.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Sort</label>
                <select
                  value={filters.sortBy}
                  onChange={(event) => handleFilterChange("sortBy", event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="updated_desc">Newest updates</option>
                  <option value="updated_asc">Oldest updates</option>
                  <option value="title_asc">Name A-Z</option>
                  <option value="title_desc">Name Z-A</option>
                  <option value="price_desc">Price high-low</option>
                  <option value="price_asc">Price low-high</option>
                  <option value="inventory_desc">Inventory high-low</option>
                  <option value="inventory_asc">Inventory low-high</option>
                </select>
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Profitability</label>
                  <select
                    value={filters.profitability}
                    onChange={(event) =>
                      handleFilterChange("profitability", event.target.value)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="all">All</option>
                    <option value="profitable">Profitable</option>
                    <option value="loss">Loss</option>
                    <option value="break_even">Break-even</option>
                    <option value="no_cost">No cost</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {loadStatus.active && products.length === 0 ? (
              <div className="col-span-full bg-white rounded-xl shadow p-8 text-center text-slate-500">
                Saved products will appear here automatically as soon as the first batch is ready.
              </div>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden"
                >
                  <div className="relative h-44 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={56} className="text-slate-400" />
                    )}
                    <div className="absolute top-2 left-2">{getSyncStatusIcon(product)}</div>
                    {product._meta.stockState === "out_of_stock" && (
                      <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        Out of stock
                      </span>
                    )}
                    {product._meta.stockState === "low_stock" && (
                      <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-full">
                        Low stock
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-slate-800 line-clamp-2 min-h-[3rem]">
                      {product.title || "Untitled product"}
                    </h3>
                    {product.vendor && (
                      <p className="text-xs text-slate-500 mt-1">{product.vendor}</p>
                    )}
                    {product.product_type && (
                      <span className="inline-block mt-2 text-xs px-2 py-1 rounded bg-sky-100 text-sky-700">
                        {product.product_type}
                      </span>
                    )}

                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500">Price</p>
                        <p className="font-bold text-slate-900">
                          {formatAmount(product.price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Stock</p>
                        <p
                          className={`font-bold ${
                            product._meta.stockState === "in_stock"
                              ? "text-emerald-600"
                              : product._meta.stockState === "low_stock"
                                ? "text-amber-600"
                                : "text-rose-600"
                          }`}
                        >
                          {toNumber(product.inventory_quantity)}
                        </p>
                      </div>
                    </div>

                    {isAdmin &&
                      product.cost_price !== undefined &&
                      product.cost_price !== null && (
                        <div className="mt-3 bg-emerald-50 rounded-lg p-2 text-xs text-emerald-900">
                          <div className="flex justify-between">
                            <span>Unit profit</span>
                            <span className="font-bold">
                              {formatAmount(
                                toNumber(product.price) - toNumber(product.cost_price),
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => navigate(`/products/${product.id}`)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Eye size={14} />
                        View
                      </button>
                      {canEditProducts && (
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full bg-white rounded-xl shadow p-10 text-center text-slate-500">
                <Package size={52} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold mb-1">No matching products found</p>
                <p className="text-sm">Try adjusting or resetting filters.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {editingProduct && canEditProducts && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={(updates) => handleEditProduct(editingProduct.id, updates)}
          canEditCost={isAdmin}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className={`bg-gradient-to-r ${color} rounded-xl text-white p-4`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-white/90">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon size={24} />
      </div>
    </div>
  );
}
