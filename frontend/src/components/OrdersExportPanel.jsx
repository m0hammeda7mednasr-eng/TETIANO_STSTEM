import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileText,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";
import api from "../utils/api";
import { downloadCsvFile } from "../utils/csv";

const CURRENCY_LABEL = "LE";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => `${toNumber(value).toFixed(2)} ${CURRENCY_LABEL}`;

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildFilename = (prefix) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefix}-${stamp}.csv`;
};

const getRefundLabel = (order) => {
  if (!order?._meta?.hasAnyRefund) {
    return "None";
  }

  return order._meta.isPartialRefund ? "Partial" : "Full";
};

const buildOrderExportRows = (orders) =>
  orders.map((order) => [
    order.id || "",
    order.order_number || order.shopify_id || "",
    order.customer_name || "Unknown",
    order.customer_email || "",
    toNumber(order.items_count),
    toNumber(order._meta?.totalPrice ?? order.total_price).toFixed(2),
    toNumber(order._meta?.netSalesAmount ?? order.net_sales_amount).toFixed(2),
    order._meta?.paymentStatus || "",
    order._meta?.paymentMethod || "",
    order._meta?.fulfillmentStatus || "",
    getRefundLabel(order),
    formatDate(order.created_at),
  ]);

const buildProductExportRows = (products) =>
  products.map((product) => [
    product.product_id || "",
    product.variant_id || "",
    product.product_title || "",
    product.variant_title || "",
    product.sku || "",
    toNumber(product.orders_count),
    toNumber(product.quantity_sold).toFixed(2),
    toNumber(product.gross_sales).toFixed(2),
  ]);

export default function OrdersExportPanel({
  isOpen,
  filteredOrders,
  selectedOrders,
  onClearSelectedOrders,
}) {
  const [scope, setScope] = useState("filtered");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsSummary, setProductsSummary] = useState([]);
  const [productsSummaryMeta, setProductsSummaryMeta] = useState(null);
  const [productsSummaryTotals, setProductsSummaryTotals] = useState(null);
  const [productsSummaryError, setProductsSummaryError] = useState("");
  const [productsSearchTerm, setProductsSearchTerm] = useState("");
  const [selectedProductKeys, setSelectedProductKeys] = useState([]);

  useEffect(() => {
    if (scope === "selected" && selectedOrders.length === 0) {
      setScope("filtered");
    }
  }, [scope, selectedOrders.length]);

  useEffect(() => {
    setProductsSummary([]);
    setProductsSummaryMeta(null);
    setProductsSummaryTotals(null);
    setProductsSummaryError("");
    setSelectedProductKeys([]);
  }, [scope, filteredOrders, selectedOrders]);

  const scopeOrders = useMemo(() => {
    if (scope === "selected" && selectedOrders.length > 0) {
      return selectedOrders;
    }

    return filteredOrders;
  }, [filteredOrders, scope, selectedOrders]);

  const scopeOrderIds = useMemo(
    () =>
      Array.from(
        new Set(
          scopeOrders
            .map((order) => String(order?.id || "").trim())
            .filter(Boolean),
        ),
      ),
    [scopeOrders],
  );

  const selectedProductKeySet = useMemo(
    () => new Set(selectedProductKeys),
    [selectedProductKeys],
  );

  const visibleProducts = useMemo(() => {
    const keyword = productsSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return productsSummary;
    }

    return productsSummary.filter((product) => {
      const haystack = [
        product.product_title,
        product.variant_title,
        product.sku,
        product.product_id,
        product.variant_id,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [productsSearchTerm, productsSummary]);

  const selectedVisibleProductCount = useMemo(
    () => visibleProducts.filter((product) => selectedProductKeySet.has(product.key)).length,
    [selectedProductKeySet, visibleProducts],
  );

  const exportOrders = () => {
    if (scopeOrders.length === 0) {
      return;
    }

    downloadCsvFile({
      filename: buildFilename(
        scope === "selected" ? "selected-orders-export" : "filtered-orders-export",
      ),
      headers: [
        "Order ID",
        "Order Number",
        "Customer",
        "Email",
        "Items Count",
        "Total",
        "Net Sales",
        "Payment Status",
        "Payment Method",
        "Fulfillment Status",
        "Refund Status",
        "Created At",
      ],
      rows: buildOrderExportRows(scopeOrders),
    });
  };

  const loadProductsSummary = async () => {
    if (scopeOrderIds.length === 0) {
      setProductsSummaryError("No orders available for this export scope.");
      return;
    }

    setLoadingProducts(true);
    setProductsSummaryError("");

    try {
      const response = await api.post("/shopify/orders/products-summary", {
        order_ids: scopeOrderIds,
      });
      const nextProducts = Array.isArray(response?.data?.products)
        ? response.data.products
        : [];

      setProductsSummary(nextProducts);
      setProductsSummaryMeta(response?.data?.meta || null);
      setProductsSummaryTotals(response?.data?.summary || null);
      setSelectedProductKeys([]);
    } catch (error) {
      console.error("Error loading products summary:", error);
      setProductsSummary([]);
      setProductsSummaryMeta(null);
      setProductsSummaryTotals(null);
      setProductsSummaryError(
        error?.response?.data?.error || "Failed to load products summary",
      );
    } finally {
      setLoadingProducts(false);
    }
  };

  const toggleProductSelection = (productKey) => {
    setSelectedProductKeys((current) =>
      current.includes(productKey)
        ? current.filter((value) => value !== productKey)
        : [...current, productKey],
    );
  };

  const toggleSelectAllVisibleProducts = () => {
    const visibleKeys = visibleProducts.map((product) => product.key);
    const allVisibleSelected =
      visibleKeys.length > 0 &&
      visibleKeys.every((productKey) => selectedProductKeySet.has(productKey));

    if (allVisibleSelected) {
      setSelectedProductKeys((current) =>
        current.filter((productKey) => !visibleKeys.includes(productKey)),
      );
      return;
    }

    setSelectedProductKeys((current) =>
      Array.from(new Set([...current, ...visibleKeys])),
    );
  };

  const exportProducts = () => {
    const rowsToExport =
      selectedProductKeys.length > 0
        ? productsSummary.filter((product) => selectedProductKeySet.has(product.key))
        : visibleProducts;

    if (rowsToExport.length === 0) {
      return;
    }

    downloadCsvFile({
      filename: buildFilename(
        scope === "selected" ? "selected-orders-products" : "filtered-orders-products",
      ),
      headers: [
        "Product ID",
        "Variant ID",
        "Product",
        "Variant",
        "SKU",
        "Orders Count",
        "Quantity Sold",
        "Gross Sales",
      ],
      rows: buildProductExportRows(rowsToExport),
    });
  };

  if (!isOpen) {
    return null;
  }

  const allVisibleProductsSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => selectedProductKeySet.has(product.key));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <FileText size={14} />
            Export Hub
          </div>
          <h2 className="text-xl font-semibold text-slate-900">
            Export orders or build a products summary from the same view
          </h2>
          <p className="text-sm text-slate-600 max-w-3xl">
            Choose the export scope, download the current orders list, or load a
            products summary that shows how many orders each product appeared in
            and the total quantity sold.
          </p>
        </div>

        {selectedOrders.length > 0 ? (
          <button
            type="button"
            onClick={onClearSelectedOrders}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear selected orders ({selectedOrders.length.toLocaleString()})
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Filtered orders
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {filteredOrders.length.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Selected orders
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {selectedOrders.length.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Active export scope
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {scope === "selected" && selectedOrders.length > 0
              ? `${selectedOrders.length.toLocaleString()} selected orders`
              : `${filteredOrders.length.toLocaleString()} filtered orders`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope("filtered")}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            scope === "filtered"
              ? "bg-sky-700 text-white border-sky-700"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Use filtered orders
        </button>
        <button
          type="button"
          onClick={() => setScope("selected")}
          disabled={selectedOrders.length === 0}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            scope === "selected" && selectedOrders.length > 0
              ? "bg-sky-700 text-white border-sky-700"
              : "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          Use selected orders
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={exportOrders}
          disabled={scopeOrders.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Export orders CSV
        </button>
        <button
          type="button"
          onClick={loadProductsSummary}
          disabled={scopeOrderIds.length === 0 || loadingProducts}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingProducts ? <RefreshCw size={16} className="animate-spin" /> : <Package size={16} />}
          {loadingProducts ? "Loading products summary..." : "Load products summary"}
        </button>
      </div>

      {productsSummaryError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          {productsSummaryError}
        </div>
      ) : null}

      {productsSummaryTotals ? (
        <div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white px-4 py-3 border border-emerald-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Orders in summary
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {toNumber(productsSummaryTotals.orders_count).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 border border-emerald-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Unique products
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {toNumber(productsSummaryTotals.products_count).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 border border-emerald-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Units sold
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {toNumber(productsSummaryTotals.total_units_sold).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 border border-emerald-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Gross sales
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatAmount(productsSummaryTotals.gross_sales)}
              </p>
            </div>
          </div>

          {productsSummaryMeta?.missing_order_ids?.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {productsSummaryMeta.missing_order_ids.length.toLocaleString()} order(s)
              were skipped because they were not available in the current store scope.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[260px] flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                value={productsSearchTerm}
                onChange={(event) => setProductsSearchTerm(event.target.value)}
                placeholder="Search product, variant, or SKU..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleSelectAllVisibleProducts}
                disabled={visibleProducts.length === 0}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allVisibleProductsSelected ? "Unselect visible products" : "Select visible products"}
              </button>
              <button
                type="button"
                onClick={exportProducts}
                disabled={
                  selectedProductKeys.length > 0
                    ? productsSummary.length === 0
                    : visibleProducts.length === 0
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {selectedProductKeys.length > 0
                  ? `Export selected products (${selectedProductKeys.length.toLocaleString()})`
                  : `Export visible products (${visibleProducts.length.toLocaleString()})`}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={allVisibleProductsSelected}
                        onChange={toggleSelectAllVisibleProducts}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Quantity Sold
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Gross Sales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.length > 0 ? (
                    visibleProducts.map((product) => (
                      <tr key={product.key} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedProductKeySet.has(product.key)}
                            onChange={() => toggleProductSelection(product.key)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-900">
                            {product.product_title || "Unknown product"}
                          </p>
                          {product.variant_title ? (
                            <p className="text-xs text-slate-500">{product.variant_title}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {product.sku || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {toNumber(product.orders_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {toNumber(product.quantity_sold).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {formatAmount(product.gross_sales)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="px-6 py-10 text-center text-sm text-slate-500">
                        No products match the current search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {visibleProducts.length > 0 ? (
                visibleProducts.map((product) => (
                  <article key={product.key} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {product.product_title || "Unknown product"}
                        </p>
                        {product.variant_title ? (
                          <p className="text-xs text-slate-500">{product.variant_title}</p>
                        ) : null}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedProductKeySet.has(product.key)}
                        onChange={() => toggleProductSelection(product.key)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p className="text-slate-600">
                        SKU: <span className="font-medium text-slate-900">{product.sku || "-"}</span>
                      </p>
                      <p className="text-slate-600">
                        Orders:{" "}
                        <span className="font-medium text-slate-900">
                          {toNumber(product.orders_count).toLocaleString()}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Qty:{" "}
                        <span className="font-medium text-slate-900">
                          {toNumber(product.quantity_sold).toLocaleString()}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        Sales:{" "}
                        <span className="font-medium text-slate-900">
                          {formatAmount(product.gross_sales)}
                        </span>
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="px-6 py-10 text-center text-sm text-slate-500">
                  No products match the current search.
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {selectedProductKeys.length > 0
              ? `${selectedProductKeys.length.toLocaleString()} product rows selected`
              : `${visibleProducts.length.toLocaleString()} visible product rows ready for export`}
            {selectedProductKeys.length > 0
              ? `, ${selectedVisibleProductCount.toLocaleString()} selected rows are visible in the current search.`
              : "."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
