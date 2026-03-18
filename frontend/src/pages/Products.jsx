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
import { formatDateTime } from "../utils/helpers";
import {
  buildCatalogCounts,
  buildVariantRows,
  getNormalizedDateRange,
  toNumber,
} from "../utils/productsView";

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

const formatAmount = (value) => `${toNumber(value).toFixed(2)} ${CURRENCY_LABEL}`;
const PRODUCT_FILTER_LABELS = {
  stockStatus: {
    in_stock: "In stock",
    low_stock: "Low stock",
    out_of_stock: "Out of stock",
  },
  syncStatus: {
    synced: "Synced",
    pending: "Pending",
    failed: "Failed",
    never: "Never",
  },
  profitability: {
    profitable: "Profitable",
    loss: "Loss",
    break_even: "Break-even",
    no_cost: "No cost",
  },
};
const isProductsRelatedSharedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  if (!source) {
    return true;
  }

  return source.includes("/shopify/products") || source.includes("/products/");
};

const isEditableSingleVariant = (variantRow) => !variantRow.has_multiple_variants;

const mapVariantRowToEditableProduct = (variantRow) => ({
  id: variantRow.id,
  title:
    variantRow.variant_title === "Default Variant"
      ? variantRow.product_title
      : `${variantRow.product_title} / ${variantRow.variant_title}`,
  price: variantRow.price,
  cost_price: variantRow.cost_price,
  sku: variantRow.sku || "",
  inventory_quantity: variantRow.inventory_quantity,
  total_inventory: variantRow.inventory_quantity,
  has_multiple_variants: false,
});

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
  const deferredSearchTerm = useDeferredValue(filters.searchTerm);

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
      if (productsRef.current.length === 0) {
        await fetchProducts({ silent: true });
        return;
      }

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

  const variantRows = useMemo(
    () => buildVariantRows(products, isAdmin),
    [isAdmin, products],
  );

  const vendorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          variantRows
            .map((variant) => String(variant.vendor || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [variantRows],
  );

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          variantRows
            .map((variant) => String(variant.product_type || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [variantRows],
  );

  const normalizedUpdatedRange = useMemo(
    () => getNormalizedDateRange(filters.updatedFrom, filters.updatedTo),
    [filters.updatedFrom, filters.updatedTo],
  );

  const filteredVariants = useMemo(() => {
    let result = [...variantRows];

    if (deferredSearchTerm.trim()) {
      const keyword = deferredSearchTerm.trim().toLowerCase();
      result = result.filter((variant) => {
        const searchableFields = [
          variant.product_title,
          variant.variant_title,
          variant.vendor,
          variant.sku,
          variant.product_type,
          variant.barcode,
          ...variant.option_values,
        ]
          .map((value) => String(value || "").toLowerCase())
          .filter(Boolean);

        return searchableFields.some((value) => value.includes(keyword));
      });
    }

    if (filters.vendor !== "all") {
      result = result.filter(
        (variant) =>
          String(variant.vendor || "").toLowerCase() ===
          String(filters.vendor || "").toLowerCase(),
      );
    }

    if (filters.productType !== "all") {
      result = result.filter(
        (variant) =>
          String(variant.product_type || "").toLowerCase() ===
          String(filters.productType || "").toLowerCase(),
      );
    }

    if (filters.stockStatus !== "all") {
      result = result.filter(
        (variant) => variant._meta.stockState === filters.stockStatus,
      );
    }

    if (filters.syncStatus !== "all") {
      result = result.filter(
        (variant) => variant._meta.syncState === filters.syncStatus,
      );
    }

    if (filters.minPrice) {
      const minPrice = toNumber(filters.minPrice);
      result = result.filter((variant) => toNumber(variant.price) >= minPrice);
    }

    if (filters.maxPrice) {
      const maxPrice = toNumber(filters.maxPrice);
      result = result.filter((variant) => toNumber(variant.price) <= maxPrice);
    }

    if (filters.minInventory) {
      const minInventory = toNumber(filters.minInventory);
      result = result.filter(
        (variant) => toNumber(variant.inventory_quantity) >= minInventory,
      );
    }

    if (filters.maxInventory) {
      const maxInventory = toNumber(filters.maxInventory);
      result = result.filter(
        (variant) => toNumber(variant.inventory_quantity) <= maxInventory,
      );
    }

    if (normalizedUpdatedRange.from) {
      result = result.filter(
        (variant) =>
          variant._meta.updatedAt &&
          variant._meta.updatedAt >= normalizedUpdatedRange.from,
      );
    }

    if (normalizedUpdatedRange.to) {
      result = result.filter(
        (variant) =>
          variant._meta.updatedAt &&
          variant._meta.updatedAt <= normalizedUpdatedRange.to,
      );
    }

    if (isAdmin && filters.profitability !== "all") {
      result = result.filter(
        (variant) => variant._meta.profitabilityState === filters.profitability,
      );
    }

    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "title_asc":
          return `${a.product_title} ${a.variant_title}`.localeCompare(
            `${b.product_title} ${b.variant_title}`,
          );
        case "title_desc":
          return `${b.product_title} ${b.variant_title}`.localeCompare(
            `${a.product_title} ${a.variant_title}`,
          );
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
  }, [deferredSearchTerm, filters, isAdmin, normalizedUpdatedRange, variantRows]);

  const summary = useMemo(() => {
    const outOfStock = filteredVariants.filter(
      (variant) => variant._meta.stockState === "out_of_stock",
    ).length;
    const lowStock = filteredVariants.filter(
      (variant) => variant._meta.stockState === "low_stock",
    ).length;
    const totalInventory = filteredVariants.reduce(
      (sum, variant) => sum + toNumber(variant.inventory_quantity),
      0,
    );
    const syncedCount = filteredVariants.filter(
      (variant) => variant._meta.syncState === "synced",
    ).length;
    const uniqueProducts = new Set(
      filteredVariants.map((variant) => String(variant.id || "")),
    ).size;

    return {
      totalVariants: filteredVariants.length,
      uniqueProducts,
      outOfStock,
      lowStock,
      totalInventory,
      syncedCount,
    };
  }, [filteredVariants]);

  const catalogCounts = useMemo(() => {
    return buildCatalogCounts(variantRows, filteredVariants);
  }, [filteredVariants, variantRows]);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (filters.searchTerm.trim()) {
      chips.push(`Search: ${filters.searchTerm.trim()}`);
    }
    if (filters.vendor !== "all") {
      chips.push(`Vendor: ${filters.vendor}`);
    }
    if (filters.productType !== "all") {
      chips.push(`Type: ${filters.productType}`);
    }
    if (filters.stockStatus !== "all") {
      chips.push(
        `Stock: ${
          PRODUCT_FILTER_LABELS.stockStatus[filters.stockStatus] || filters.stockStatus
        }`,
      );
    }
    if (filters.syncStatus !== "all") {
      chips.push(
        `Sync: ${
          PRODUCT_FILTER_LABELS.syncStatus[filters.syncStatus] || filters.syncStatus
        }`,
      );
    }
    if (filters.minPrice) {
      chips.push(`Price >= ${filters.minPrice}`);
    }
    if (filters.maxPrice) {
      chips.push(`Price <= ${filters.maxPrice}`);
    }
    if (filters.minInventory) {
      chips.push(`Inventory >= ${filters.minInventory}`);
    }
    if (filters.maxInventory) {
      chips.push(`Inventory <= ${filters.maxInventory}`);
    }
    if (filters.updatedFrom || filters.updatedTo) {
      chips.push(
        `Updated: ${filters.updatedFrom || "Start"} -> ${filters.updatedTo || "Now"}`,
      );
    }
    if (isAdmin && filters.profitability !== "all") {
      chips.push(
        `Profitability: ${
          PRODUCT_FILTER_LABELS.profitability[filters.profitability] ||
          filters.profitability
        }`,
      );
    }

    return chips;
  }, [filters, isAdmin]);

  const handleEditProduct = async (productId, updates) => {
    try {
      setProducts((prevProducts) =>
        prevProducts.map((product) => {
          if (product.id !== productId) {
            return product;
          }

          const nextProduct = {
            ...product,
            price: updates.price,
            ...(updates.sku !== undefined
              ? { sku: String(updates.sku || "").trim() }
              : {}),
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
          };

          if (Array.isArray(nextProduct.variants) && nextProduct.variants.length === 1) {
            nextProduct.variants = nextProduct.variants.map((variant) => ({
              ...variant,
              price: updates.price,
              ...(updates.sku !== undefined
                ? { sku: String(updates.sku || "").trim() }
                : {}),
              ...(isAdmin && updates.cost_price !== undefined
                ? { cost_price: updates.cost_price }
                : {}),
              ...(updates.inventory !== undefined
                ? { inventory_quantity: updates.inventory }
                : {}),
            }));
          }

          return nextProduct;
        }),
      );

      const payload = {
        price: updates.price,
        sku: String(updates.sku || "").trim(),
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

  const getSyncStatusIcon = (variant) => {
    if (variant.pending_sync) {
      return <Clock size={16} className="text-yellow-500" title="Pending sync" />;
    }
    if (variant.sync_error) {
      return <AlertCircle size={16} className="text-red-500" title={variant.sync_error} />;
    }
    if (variant.last_synced_at) {
      return <CheckCircle size={16} className="text-green-500" title="Synced" />;
    }
    return null;
  };

  const openVariantEditor = (variant) => {
    if (!isEditableSingleVariant(variant)) {
      navigate(`/products/${variant.id}`);
      return;
    }

    setEditingProduct(mapVariantRowToEditableProduct(variant));
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
                Products and variants are separated clearly so filters and totals stay easy to read.
              </p>
              {lastUpdatedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Last refresh: {formatDateTime(lastUpdatedAt)}
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

          {loadStatus.message && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800 flex items-center justify-between gap-3">
              <span>{loadStatus.message}</span>
              {loadStatus.active && <span className="text-xs text-sky-600">Updating...</span>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="Products"
              value={summary.uniqueProducts.toLocaleString()}
              icon={Package}
              color="from-sky-500 to-sky-700"
            />
            <SummaryCard
              label="Variants"
              value={summary.totalVariants.toLocaleString()}
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
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Product & Variant Filters</h2>
                <p className="text-sm text-slate-500">
                  Filters apply to the variant cards and product totals update with them.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span>
                  Showing <strong>{catalogCounts.filteredProducts.toLocaleString()}</strong> products
                </span>
                <span>
                  and <strong>{catalogCounts.filteredVariants.toLocaleString()}</strong> variants
                </span>
                <span className="text-slate-500">
                  from {catalogCounts.totalProducts.toLocaleString()} total products / {catalogCounts.totalVariants.toLocaleString()} total variants
                </span>
              </div>
              {normalizedUpdatedRange.wasSwapped && (
                <p className="mt-2 text-xs text-amber-700">
                  Date range was auto-corrected because From Date was later than To Date.
                </p>
              )}
              {activeFilterChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Product, variant, SKU, barcode..."
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {loadStatus.active && products.length === 0 ? (
              <div className="col-span-full bg-white rounded-xl shadow p-8 text-center text-slate-500">
                Product cards will appear as soon as the first batch is ready.
              </div>
            ) : filteredVariants.length > 0 ? (
              filteredVariants.map((variant) => (
                <div
                  key={variant.key}
                  className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden border border-slate-100"
                >
                  <div className="relative h-52 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 flex items-center justify-center">
                    <VariantImage variant={variant} />
                    {getSyncStatusIcon(variant) && (
                      <div className="absolute top-3 left-3 bg-white/90 rounded-full p-2 shadow-sm">
                        {getSyncStatusIcon(variant)}
                      </div>
                    )}
                    <StockBadge stockState={variant._meta.stockState} />
                  </div>

                  <div className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Product
                      </p>
                      <h3 className="font-bold text-slate-900 line-clamp-2 min-h-[3rem]">
                        {variant.product_title}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                          {variant.variant_title}
                        </span>
                        {variant.has_multiple_variants && (
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700">
                            {variant.variants_count} variants
                          </span>
                        )}
                        {variant.product_type && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            {variant.product_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <DetailItem label="Price" value={formatAmount(variant.price)} />
                      <DetailItem
                        label="Stock"
                        value={toNumber(variant.inventory_quantity).toLocaleString()}
                        valueClassName={
                          variant._meta.stockState === "in_stock"
                            ? "text-emerald-600"
                            : variant._meta.stockState === "low_stock"
                              ? "text-amber-600"
                              : "text-rose-600"
                        }
                      />
                      <DetailItem label="SKU" value={variant.sku || "-"} />
                      <DetailItem label="Updated" value={formatDateTime(variant.updated_at)} />
                    </div>

                    {(variant.vendor || variant.barcode) && (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-2">
                        {variant.vendor && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Vendor</span>
                            <span className="font-medium text-right">{variant.vendor}</span>
                          </div>
                        )}
                        {variant.barcode && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Barcode</span>
                            <span className="font-medium text-right break-all">
                              {variant.barcode}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {variant.option_values.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {variant.option_values.map((value) => (
                          <span
                            key={`${variant.key}:${value}`}
                            className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700"
                          >
                            {value}
                          </span>
                        ))}
                      </div>
                    )}

                    {variant.compare_at_price && toNumber(variant.compare_at_price) > 0 && (
                      <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                        Compare at:{" "}
                        <span className="font-semibold text-slate-900">
                          {formatAmount(variant.compare_at_price)}
                        </span>
                      </div>
                    )}

                    {isAdmin &&
                      variant.cost_price !== undefined &&
                      variant.cost_price !== null && (
                        <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-900">
                          <div className="flex items-center justify-between gap-3">
                            <span>Unit profit</span>
                            <span className="font-bold">
                              {formatAmount(
                                toNumber(variant.price) - toNumber(variant.cost_price),
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/products/${variant.id}`)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Eye size={14} />
                        View
                      </button>
                      {canEditProducts && (
                        <button
                          onClick={() => openVariantEditor(variant)}
                          className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                        >
                          <Edit2 size={14} />
                          {variant.has_multiple_variants ? "Manage" : "Edit"}
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
                <p className="text-sm">Try adjusting the filters or reset them.</p>
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

function DetailItem({ label, value, valueClassName = "" }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold text-slate-900 break-words ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function VariantImage({ variant }) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = String(variant?.image_url || "").trim();

  if (!imageUrl || hasError) {
    return <Package size={56} className="text-slate-400" />;
  }

  return (
    <img
      src={imageUrl}
      alt={`${variant?.product_title || "Product"} ${variant?.variant_title || ""}`.trim()}
      className="w-full h-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}

function StockBadge({ stockState }) {
  if (stockState === "out_of_stock") {
    return (
      <span className="absolute top-3 right-3 bg-red-600 text-white text-xs px-2.5 py-1 rounded-full shadow">
        Out of stock
      </span>
    );
  }

  if (stockState === "low_stock") {
    return (
      <span className="absolute top-3 right-3 bg-amber-500 text-white text-xs px-2.5 py-1 rounded-full shadow">
        Low stock
      </span>
    );
  }

  return (
    <span className="absolute top-3 right-3 bg-emerald-600 text-white text-xs px-2.5 py-1 rounded-full shadow">
      In stock
    </span>
  );
}
