import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { extractArray, extractObject } from "../utils/response";
import {
  DollarSign,
  Edit,
  Pencil,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

const SUMMARY_DEFAULT = {
  total_revenue: 0,
  total_cost: 0,
  total_operational_costs: 0,
  total_net_profit: 0,
  total_sold_units: 0,
  profit_margin: 0,
};

const CURRENCY_LABEL = "LE";
const EMPTY_COST_FORM = {
  cost_name: "",
  cost_type: "operations",
  amount: "",
  apply_to: "per_unit",
  description: "",
};
const COST_TYPE_LABELS = {
  ads: "Ads",
  shipping: "Shipping",
  operations: "Operations",
  packaging: "Packaging",
  other: "Other",
};
const COST_TYPE_DEFAULT_NAMES = {
  ads: "Ads Cost",
  shipping: "Shipping Cost",
  operations: "Operational Cost",
  packaging: "Packaging Cost",
  other: "Other Cost",
};
const COST_TYPE_GROUPS = {
  ads: "ads",
  shipping: "shipping",
  operations: "operations",
  packaging: "other",
  other: "other",
};

const formatAmount = (value) =>
  `${Number(value || 0).toFixed(2)} ${CURRENCY_LABEL}`;
const toAmount = (value) => Number(value || 0);
const hasCostPrice = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";
const getCostGroupKey = (costType) =>
  COST_TYPE_GROUPS[String(costType || "").toLowerCase()] || "other";
const getAppliedCostTotal = (cost, soldQuantity, ordersCount) => {
  const amount = toAmount(cost?.amount);
  if (String(cost?.apply_to || "") === "per_order") {
    return amount * toAmount(ordersCount);
  }
  if (String(cost?.apply_to || "") === "fixed") {
    return amount;
  }
  return amount * toAmount(soldQuantity);
};
const getApplyToLabel = (applyTo) => {
  switch (String(applyTo || "")) {
    case "per_order":
      return "Per order";
    case "fixed":
      return "Fixed";
    default:
      return "Per unit";
  }
};
const formatEntryCount = (count) => {
  if (!count) return "No entries";
  return `${count} ${count === 1 ? "entry" : "entries"}`;
};
const buildProductCostBreakdown = (product, costs) => {
  const soldQuantity = toAmount(product?.sold_quantity);
  const ordersCount = toAmount(product?.orders_count);
  const breakdown = {
    ads: 0,
    shipping: 0,
    operations: 0,
    other: 0,
  };

  (costs || []).forEach((cost) => {
    const bucket = getCostGroupKey(cost?.cost_type);
    breakdown[bucket] += getAppliedCostTotal(cost, soldQuantity, ordersCount);
  });

  const operationalTotal = Object.values(breakdown).reduce(
    (sum, amount) => sum + toAmount(amount),
    0,
  );

  return {
    ...breakdown,
    operationalTotal: parseFloat(operationalTotal.toFixed(2)),
    totalCosts: parseFloat(
      (toAmount(product?.total_cost) + operationalTotal).toFixed(2),
    ),
  };
};

export default function NetProfit() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(SUMMARY_DEFAULT);
  const [operationalCosts, setOperationalCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const [editingProductId, setEditingProductId] = useState(null);
  const [editingCostPrice, setEditingCostPrice] = useState("");

  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [editingOperationalCostId, setEditingOperationalCostId] =
    useState(null);
  const [newCost, setNewCost] = useState(EMPTY_COST_FORM);

  const fetchProfitability = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/products");
      const list = extractArray(data);
      setProducts(list);
      setSummary({
        ...SUMMARY_DEFAULT,
        ...extractObject(data?.summary),
      });
    } catch (error) {
      setProducts([]);
      setSummary(SUMMARY_DEFAULT);
      setMessage({ type: "error", text: "Failed to load net profit data" });
    }
  }, []);

  const fetchOperationalCosts = useCallback(async () => {
    try {
      const { data } = await api.get("/operational-costs");
      const list = extractArray(data);
      setOperationalCosts(list);
    } catch (error) {
      setOperationalCosts([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
    } catch (error) {
      // handled in called methods
    } finally {
      setLoading(false);
    }
  }, [fetchOperationalCosts, fetchProfitability]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredProducts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return products;

    return products.filter(
      (product) =>
        String(product?.title || "")
          .toLowerCase()
          .includes(keyword) ||
        String(product?.id || "")
          .toLowerCase()
          .includes(keyword) ||
        String(product?.shopify_id || "")
          .toLowerCase()
          .includes(keyword),
    );
  }, [products, searchTerm]);

  const operationalCostsByProduct = useMemo(() => {
    const nextMap = new Map();

    operationalCosts.forEach((cost) => {
      if (!cost?.product_id || cost.is_active === false) {
        return;
      }

      const list = nextMap.get(cost.product_id) || [];
      list.push(cost);
      nextMap.set(cost.product_id, list);
    });

    return nextMap;
  }, [operationalCosts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const startEditCost = (product) => {
    setEditingProductId(product.id);
    setEditingCostPrice(
      hasCostPrice(product.cost_price) ? String(product.cost_price) : "",
    );
  };

  const cancelEditCost = () => {
    setEditingProductId(null);
    setEditingCostPrice("");
  };

  const saveCostPrice = async (productId) => {
    const normalizedCostPrice = String(editingCostPrice || "").trim();
    const parsedCostPrice = parseFloat(normalizedCostPrice);

    if (!normalizedCostPrice) {
      setMessage({ type: "error", text: "Product cost is required" });
      return;
    }

    if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
      setMessage({
        type: "error",
        text: "Product cost must be a valid number",
      });
      return;
    }

    try {
      await api.put(`/dashboard/products/${productId}`, {
        cost_price: parsedCostPrice,
      });
      setMessage({ type: "success", text: "Cost price updated successfully" });
      cancelEditCost();
      await fetchProfitability();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to update cost price",
      });
    }
  };

  const openCostModal = (productId, cost = null) => {
    setSelectedProductId(productId);
    setEditingOperationalCostId(cost?.id || null);
    setNewCost(
      cost
        ? {
            cost_name: cost.cost_name || "",
            cost_type: cost.cost_type || "operations",
            amount: String(cost.amount ?? ""),
            apply_to: cost.apply_to || "per_unit",
            description: cost.description || "",
          }
        : EMPTY_COST_FORM,
    );
    setShowCostModal(true);
  };

  const closeCostModal = () => {
    setShowCostModal(false);
    setSelectedProductId(null);
    setEditingOperationalCostId(null);
    setNewCost(EMPTY_COST_FORM);
  };

  const saveOperationalCost = async () => {
    if (!newCost.amount) {
      setMessage({ type: "error", text: "Amount is required" });
      return;
    }

    try {
      const normalizedCostName =
        String(newCost.cost_name || "").trim() ||
        COST_TYPE_DEFAULT_NAMES[newCost.cost_type] ||
        "Operational Cost";
      const payload = {
        ...newCost,
        cost_name: normalizedCostName,
        product_id: selectedProductId,
        amount: parseFloat(newCost.amount),
      };

      if (editingOperationalCostId) {
        await api.put(
          `/operational-costs/${editingOperationalCostId}`,
          payload,
        );
      } else {
        await api.post("/operational-costs", payload);
      }

      setMessage({
        type: "success",
        text: editingOperationalCostId
          ? "Operational cost updated successfully"
          : "Operational cost added successfully",
      });
      closeCostModal();
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to add operational cost",
      });
    }
  };

  const deleteOperationalCost = async (costId) => {
    if (!window.confirm("Delete this operational cost?")) return;
    try {
      await api.delete(`/operational-costs/${costId}`);
      setMessage({ type: "success", text: "Operational cost deleted" });
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.error || "Failed to delete operational cost",
      });
    }
  };

  const getProductCosts = (productId) =>
    operationalCostsByProduct.get(productId) || [];

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="text-center">Loading net profit...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Net Profit</h1>
            <p className="text-gray-600 mt-1">
              Per-product profitability using product cost, ads, shipping and
              operating expenses
            </p>
          </div>

          {message.text && (
            <div
              className={`p-4 rounded-lg ${
                message.type === "error"
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="Total Revenue"
              value={formatAmount(summary.total_revenue)}
              icon={DollarSign}
              color="from-blue-500 to-blue-700"
            />
            <SummaryCard
              label="Total Cost"
              value={formatAmount(summary.total_cost)}
              icon={Package}
              color="from-orange-500 to-orange-700"
            />
            <SummaryCard
              label="Operational Costs"
              value={formatAmount(summary.total_operational_costs)}
              icon={TrendingUp}
              color="from-yellow-500 to-yellow-700"
            />
            <SummaryCard
              label="Total Net Profit"
              value={formatAmount(summary.total_net_profit)}
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-700"
            />
            <SummaryCard
              label="Sold Units"
              value={String(Math.round(summary.total_sold_units))}
              icon={Package}
              color="from-indigo-500 to-indigo-700"
            />
            <SummaryCard
              label="Profit Margin"
              value={`${summary.profit_margin.toFixed(2)}%`}
              icon={TrendingUp}
              color="from-purple-500 to-purple-700"
            />
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Search className="text-gray-500" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by product name or ID..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 border border-blue-100">
                Costs are now tracked per product only. Add ads, shipping and
                operations directly on each item.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table table-auto w-full min-w-[1640px]">
                <colgroup>
                  <col className="w-[320px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="w-[120px]" />
                  <col className="w-[140px]" />
                  <col className="w-[560px]" />
                  <col className="w-[150px]" />
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-4 text-right text-sm font-semibold text-gray-700">
                      Product
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-700">
                      Sold
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-700">
                      Orders
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">
                      Avg Sell
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">
                      Revenue
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">
                      Cost Breakdown
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">
                      Total Costs
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">
                      Net Profit
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-700">
                      Margin
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredProducts.map((product) => {
                    const isEditing = editingProductId === product.id;
                    const opCosts = getProductCosts(product.id);
                    const breakdown = buildProductCostBreakdown(
                      product,
                      opCosts,
                    );
                    const costGroupsCount = opCosts.reduce(
                      (acc, cost) => {
                        const groupKey = getCostGroupKey(cost?.cost_type);
                        acc[groupKey] = (acc[groupKey] || 0) + 1;
                        return acc;
                      },
                      { ads: 0, shipping: 0, operations: 0, other: 0 },
                    );
                    const productCostMissing = !hasCostPrice(
                      product.cost_price,
                    );

                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3 min-w-0">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="w-12 h-12 object-cover rounded-lg border border-gray-200 flex-none"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-none">
                                <Package size={20} className="text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 leading-6 break-normal whitespace-normal">
                                {product.title}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className="truncate">{product.id}</span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                  {opCosts.length} tracked costs
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-700">
                          {product.sold_quantity || 0}
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-700">
                          {product.orders_count || 0}
                        </td>
                        <td className="px-4 py-4 text-sm text-right font-medium text-gray-800">
                          {formatAmount(product.avg_selling_price)}
                        </td>
                        <td className="px-4 py-4 text-sm text-right text-blue-700 font-semibold">
                          {formatAmount(product.total_revenue)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                              <BreakdownMetric
                                label="Product Cost"
                                value={
                                  isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editingCostPrice}
                                      onChange={(e) =>
                                        setEditingCostPrice(e.target.value)
                                      }
                                      className="w-full rounded-lg border px-2 py-1.5 text-right"
                                    />
                                  ) : productCostMissing ? (
                                    "Missing"
                                  ) : (
                                    `${formatAmount(product.cost_price)} / unit`
                                  )
                                }
                                note={
                                  productCostMissing
                                    ? "Set it to calculate the real product cost"
                                    : `Base total ${formatAmount(product.total_cost)}`
                                }
                                valueClassName={
                                  productCostMissing
                                    ? "text-amber-700"
                                    : "text-gray-900"
                                }
                              />
                              <BreakdownMetric
                                label="Ads"
                                value={formatAmount(breakdown.ads)}
                                note={formatEntryCount(costGroupsCount.ads)}
                                valueClassName="text-rose-700"
                              />
                              <BreakdownMetric
                                label="Shipping"
                                value={formatAmount(breakdown.shipping)}
                                note={formatEntryCount(
                                  costGroupsCount.shipping,
                                )}
                                valueClassName="text-sky-700"
                              />
                              <BreakdownMetric
                                label="Operations"
                                value={formatAmount(breakdown.operations)}
                                note={formatEntryCount(
                                  costGroupsCount.operations,
                                )}
                                valueClassName="text-amber-700"
                              />
                              <BreakdownMetric
                                label="Other"
                                value={formatAmount(breakdown.other)}
                                note={formatEntryCount(costGroupsCount.other)}
                                valueClassName="text-slate-700"
                              />
                            </div>

                            {opCosts.length > 0 ? (
                              <div className="space-y-2">
                                {opCosts.map((cost) => (
                                  <div
                                    key={cost.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                  >
                                    <div className="min-w-0 text-right">
                                      <p className="truncate text-xs font-semibold text-gray-800">
                                        {cost.cost_name ||
                                          COST_TYPE_LABELS[cost.cost_type] ||
                                          "Operational Cost"}
                                      </p>
                                      <p className="text-[11px] text-gray-500">
                                        {COST_TYPE_LABELS[cost.cost_type] ||
                                          "Other"}{" "}
                                        | {getApplyToLabel(cost.apply_to)} |{" "}
                                        {formatAmount(cost.amount)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-semibold text-gray-800">
                                        {formatAmount(
                                          getAppliedCostTotal(
                                            cost,
                                            product.sold_quantity,
                                            product.orders_count,
                                          ),
                                        )}
                                      </span>
                                      <button
                                        onClick={() =>
                                          openCostModal(product.id, cost)
                                        }
                                        className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                                        title="Edit cost"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          deleteOperationalCost(cost.id)
                                        }
                                        className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                                        title="Delete cost"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 text-right">
                                No per-product costs added yet.
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-right">
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900">
                              {formatAmount(breakdown.totalCosts)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Ops {formatAmount(breakdown.operationalTotal)}
                            </p>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-4 text-sm text-right font-semibold ${
                            Number(product.net_profit || 0) >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatAmount(product.net_profit)}
                        </td>
                        <td className="px-4 py-4 text-sm text-center font-medium text-gray-700">
                          {Number(product.profit_margin || 0).toFixed(2)}%
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveCostPrice(product.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Save"
                                >
                                  <Save size={16} />
                                </button>
                                <button
                                  onClick={cancelEditCost}
                                  className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                  title="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditCost(product)}
                                  className={`rounded p-1 ${
                                    productCostMissing
                                      ? "text-amber-600 hover:bg-amber-50"
                                      : "text-blue-600 hover:bg-blue-50"
                                  }`}
                                  title={
                                    productCostMissing
                                      ? "Set product cost"
                                      : "Edit cost price"
                                  }
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => openCostModal(product.id)}
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                                  title="Add operational cost"
                                >
                                  <Plus size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <Package size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No products found</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {showCostModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingOperationalCostId
                ? "Edit Product Cost"
                : "Add Product Cost"}
            </h2>
            {selectedProduct && (
              <p className="mb-4 text-sm text-gray-500">
                {selectedProduct.title}
              </p>
            )}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Cost name (optional)"
                value={newCost.cost_name}
                onChange={(e) =>
                  setNewCost((prev) => ({ ...prev, cost_name: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
              <select
                value={newCost.cost_type}
                onChange={(e) =>
                  setNewCost((prev) => ({ ...prev, cost_type: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="operations">Operations</option>
                <option value="ads">Ads</option>
                <option value="shipping">Shipping</option>
                <option value="packaging">Packaging</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={newCost.amount}
                onChange={(e) =>
                  setNewCost((prev) => ({ ...prev, amount: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
              <select
                value={newCost.apply_to}
                onChange={(e) =>
                  setNewCost((prev) => ({ ...prev, apply_to: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="per_unit">Per Unit</option>
                <option value="per_order">Per Order</option>
                <option value="fixed">Fixed</option>
              </select>
              <p className="text-xs text-gray-500">
                Per unit is multiplied by sold quantity. Per order is multiplied
                by the number of orders.
              </p>
              <textarea
                rows={3}
                placeholder="Description"
                value={newCost.description}
                onChange={(e) =>
                  setNewCost((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveOperationalCost}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2"
              >
                {editingOperationalCostId ? "Save Changes" : "Add"}
              </button>
              <button
                onClick={closeCostModal}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownMetric({
  label,
  value,
  note,
  valueClassName = "text-gray-900",
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className={`mt-1 text-sm font-semibold ${valueClassName}`}>
        {value}
      </div>
      <p className="mt-1 text-[11px] text-gray-500">{note}</p>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-lg p-4 text-white shadow`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/85 text-xs">{label}</p>
          <p className="font-bold text-xl mt-1">{value}</p>
        </div>
        <Icon size={20} />
      </div>
    </div>
  );
}
