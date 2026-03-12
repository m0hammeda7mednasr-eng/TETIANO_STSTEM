import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { extractArray, extractObject } from "../utils/response";
import {
  DollarSign,
  Edit,
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

const formatAmount = (value) => `${Number(value || 0).toFixed(2)} ${CURRENCY_LABEL}`;

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
  const [newCost, setNewCost] = useState({
    cost_name: "",
    cost_type: "ads",
    amount: "",
    apply_to: "per_unit",
    description: "",
  });

  const [fixedCosts, setFixedCosts] = useState({
    marketing: "",
    shipping: "",
    other: "",
  });

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
    } catch (error) {
      // handled in called methods
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfitability = async () => {
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
  };

  const fetchOperationalCosts = async () => {
    try {
      const { data } = await api.get("/operational-costs");
      setOperationalCosts(extractArray(data));
    } catch (error) {
      setOperationalCosts([]);
    }
  };

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

  const startEditCost = (product) => {
    setEditingProductId(product.id);
    setEditingCostPrice(String(product.cost_price || 0));
  };

  const cancelEditCost = () => {
    setEditingProductId(null);
    setEditingCostPrice("");
  };

  const saveCostPrice = async (productId) => {
    try {
      await api.put(`/dashboard/products/${productId}`, {
        cost_price: parseFloat(editingCostPrice || 0),
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

  const openCostModal = (productId) => {
    setSelectedProductId(productId);
    setShowCostModal(true);
  };

  const closeCostModal = () => {
    setShowCostModal(false);
    setSelectedProductId(null);
    setNewCost({
      cost_name: "",
      cost_type: "ads",
      amount: "",
      apply_to: "per_unit",
      description: "",
    });
  };

  const addOperationalCost = async () => {
    if (!newCost.cost_name || !newCost.amount) {
      setMessage({ type: "error", text: "Cost name and amount are required" });
      return;
    }

    try {
      await api.post("/operational-costs", {
        ...newCost,
        product_id: selectedProductId,
        amount: parseFloat(newCost.amount),
      });
      setMessage({
        type: "success",
        text: "Operational cost added successfully",
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

  const saveFixedCosts = async () => {
    const costs = [
      { key: "marketing", cost_name: "Marketing Cost", cost_type: "ads" },
      { key: "shipping", cost_name: "Shipping Cost", cost_type: "shipping" },
      { key: "other", cost_name: "Other Fixed Cost", cost_type: "other" },
    ];

    try {
      for (const config of costs) {
        const rawValue = fixedCosts[config.key];
        if (!rawValue) continue;

        await api.post("/operational-costs", {
          cost_name: config.cost_name,
          cost_type: config.cost_type,
          amount: parseFloat(rawValue),
          apply_to: "fixed",
          product_id: null,
        });
      }

      setMessage({ type: "success", text: "Fixed costs saved successfully" });
      setFixedCosts({ marketing: "", shipping: "", other: "" });
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to save fixed costs",
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
    operationalCosts.filter(
      (cost) => cost.product_id === productId && cost.is_active !== false,
    );

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
              Per-product profitability based on real sales and operating costs
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

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Add Fixed Operational Costs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="number"
                step="0.01"
                placeholder="Marketing"
                value={fixedCosts.marketing}
                onChange={(e) =>
                  setFixedCosts((prev) => ({
                    ...prev,
                    marketing: e.target.value,
                  }))
                }
                className="px-3 py-2 border rounded-lg"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Shipping"
                value={fixedCosts.shipping}
                onChange={(e) =>
                  setFixedCosts((prev) => ({
                    ...prev,
                    shipping: e.target.value,
                  }))
                }
                className="px-3 py-2 border rounded-lg"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Other"
                value={fixedCosts.other}
                onChange={(e) =>
                  setFixedCosts((prev) => ({ ...prev, other: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg"
              />
              <button
                onClick={saveFixedCosts}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2"
              >
                Save Fixed Costs
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center gap-3">
              <Search className="text-gray-500" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by product name or ID..."
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Sold
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Avg Sell
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Cost
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Unit Profit
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Op. Costs
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Net Profit
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Margin
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredProducts.map((product) => {
                    const isEditing = editingProductId === product.id;
                    const opCosts = getProductCosts(product.id);
                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : (
                              <Package size={20} className="text-gray-400" />
                            )}
                            <div>
                              <p className="font-medium">{product.title}</p>
                              <p className="text-xs text-gray-500">
                                {product.id}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {product.sold_quantity || 0}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {product.orders_count || 0}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {formatAmount(product.avg_selling_price)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editingCostPrice}
                              onChange={(e) =>
                                setEditingCostPrice(e.target.value)
                              }
                              className="w-24 px-2 py-1 border rounded"
                            />
                          ) : (
                            formatAmount(product.cost_price)
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {formatAmount(product.profit_per_unit)}
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-700 font-semibold">
                          {formatAmount(product.total_revenue)}
                        </td>
                        <td className="px-4 py-3 text-sm text-yellow-700">
                          {formatAmount(
                            Number(product.operational_costs_total || 0) +
                              Number(product.fixed_cost_share || 0),
                          )}
                          {opCosts.length > 0 && (
                            <div className="mt-1 text-xs text-gray-500 space-y-1">
                              {opCosts.slice(0, 2).map((cost) => (
                                <div
                                  key={cost.id}
                                  className="flex items-center gap-1"
                                >
                                  <span>{cost.cost_name}</span>
                                  <button
                                    onClick={() =>
                                      deleteOperationalCost(cost.id)
                                    }
                                    className="text-red-500 hover:text-red-700"
                                    title="Delete cost"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm font-semibold ${
                            Number(product.net_profit || 0) >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatAmount(product.net_profit)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {Number(product.profit_margin || 0).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
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
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit cost price"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => openCostModal(product.id)}
                                  className="p-1 text-purple-600 hover:bg-purple-50 rounded"
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
            <h2 className="text-xl font-bold mb-4">Add Product Cost</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Cost name"
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
                <option value="ads">Ads</option>
                <option value="operations">Operations</option>
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
                onClick={addOperationalCost}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2"
              >
                Add
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
