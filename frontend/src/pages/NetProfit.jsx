import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import api from "../utils/api";
import { extractArray, extractObject } from "../utils/response";
import {
  DollarSign,
  Download,
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
import { buildCsvFilename, downloadCsvSections } from "../utils/csv";
import {
  formatCurrency as formatLocaleCurrency,
  formatNumber,
  formatPercent as formatLocalePercent,
} from "../utils/helpers";

const SUMMARY_DEFAULT = {
  total_revenue: 0,
  total_cost: 0,
  total_operational_costs: 0,
  total_net_profit: 0,
  total_sold_units: 0,
  profit_margin: 0,
};

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
  workshop: "Workshop",
  operations: "Operations",
  packaging: "Packaging",
  other: "Other",
};
const COST_TYPE_DEFAULT_NAMES = {
  ads: "Ads Cost",
  shipping: "Shipping Cost",
  workshop: "Workshop Cost",
  operations: "Operational Cost",
  packaging: "Packaging Cost",
  other: "Other Cost",
};
const COST_TYPE_GROUPS = {
  ads: "ads",
  shipping: "shipping",
  workshop: "operations",
  operations: "operations",
  packaging: "other",
  other: "other",
};

const toAmount = (value) => Number(value || 0);
const formatAmount = (value) => formatLocaleCurrency(value);
const formatCount = (value) =>
  formatNumber(Math.round(toAmount(value)), { maximumFractionDigits: 0 });
const formatPercent = (value) =>
  formatLocalePercent(toAmount(value), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
const getMarginTone = (value) => {
  const margin = toAmount(value);
  if (margin >= 35) {
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      bar: "bg-emerald-500",
    };
  }
  if (margin >= 15) {
    return {
      badge: "bg-sky-50 text-sky-700 ring-sky-200",
      bar: "bg-sky-500",
    };
  }
  if (margin >= 0) {
    return {
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      bar: "bg-amber-500",
    };
  }
  return {
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    bar: "bg-rose-500",
  };
};
const getProfitToneClass = (value) =>
  toAmount(value) >= 0 ? "text-emerald-700" : "text-rose-700";
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

  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productCostDraft, setProductCostDraft] = useState("");
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

  const selectedProductCosts = useMemo(
    () => (selectedProductId ? operationalCostsByProduct.get(selectedProductId) || [] : []),
    [operationalCostsByProduct, selectedProductId],
  );

  const saveProductCostPrice = async () => {
    const normalizedCostPrice = String(productCostDraft || "").trim();
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
      await api.put(`/dashboard/products/${selectedProductId}`, {
        cost_price: parsedCostPrice,
      });
      setMessage({ type: "success", text: "Cost price updated successfully" });
      await fetchProfitability();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to update cost price",
      });
    }
  };

  const openCostModal = (productId, cost = null) => {
    const product = products.find((item) => item.id === productId) || null;
    setSelectedProductId(productId);
    setProductCostDraft(
      hasCostPrice(product?.cost_price) ? String(product.cost_price) : "",
    );
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
    setProductCostDraft("");
    setEditingOperationalCostId(null);
    setNewCost(EMPTY_COST_FORM);
  };

  const prepareNewOperationalCost = () => {
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
      await Promise.all([fetchProfitability(), fetchOperationalCosts()]);
      prepareNewOperationalCost();
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

  const exportNetProfitView = useCallback(() => {
    const visibleProductRows = filteredProducts.map((product) => {
      const productCosts = operationalCostsByProduct.get(product.id) || [];
      const breakdown = buildProductCostBreakdown(product, productCosts);

      return [
        product.id,
        product.title || "Untitled product",
        toAmount(product.sold_quantity),
        toAmount(product.orders_count),
        toAmount(product.avg_selling_price),
        toAmount(product.total_revenue),
        hasCostPrice(product.cost_price) ? toAmount(product.cost_price) : "",
        toAmount(product.total_cost),
        breakdown.ads,
        breakdown.shipping,
        breakdown.operations,
        breakdown.other,
        breakdown.operationalTotal,
        breakdown.totalCosts,
        toAmount(product.net_profit),
        toAmount(product.profit_margin),
        productCosts.length,
      ];
    });

    const visibleCostRows = filteredProducts.flatMap((product) => {
      const productCosts = operationalCostsByProduct.get(product.id) || [];

      return productCosts.map((cost) => [
        product.id,
        product.title || "Untitled product",
        cost.cost_name || COST_TYPE_LABELS[cost.cost_type] || "Operational Cost",
        cost.cost_type || "other",
        cost.apply_to || "per_unit",
        toAmount(cost.amount),
        getAppliedCostTotal(
          cost,
          product.sold_quantity,
          product.orders_count,
        ),
        cost.description || "",
      ]);
    });

    downloadCsvSections({
      filename: buildCsvFilename("net-profit-view"),
      sections: [
        {
          title: "Export metadata",
          headers: ["Field", "Value"],
          rows: [
            ["Search", searchTerm.trim() || "-"],
            ["Visible products", filteredProducts.length],
            ["Exported at", new Date().toISOString()],
          ],
        },
        {
          title: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total revenue", toAmount(summary.total_revenue)],
            ["Total cost", toAmount(summary.total_cost)],
            ["Operational costs", toAmount(summary.total_operational_costs)],
            ["Total net profit", toAmount(summary.total_net_profit)],
            ["Sold units", toAmount(summary.total_sold_units)],
            ["Profit margin", toAmount(summary.profit_margin)],
          ],
        },
        {
          title: "Visible products",
          headers: [
            "Product ID",
            "Title",
            "Sold Qty",
            "Orders",
            "Avg Sell",
            "Revenue",
            "Cost / Unit",
            "Base Product Cost",
            "Ads Cost",
            "Shipping Cost",
            "Operations Cost",
            "Other Cost",
            "Operational Total",
            "Total Costs",
            "Net Profit",
            "Profit Margin %",
            "Tracked Cost Entries",
          ],
          rows: visibleProductRows,
        },
        {
          title: "Tracked operational costs",
          headers: [
            "Product ID",
            "Product",
            "Cost Name",
            "Cost Type",
            "Apply To",
            "Unit Amount",
            "Applied Total",
            "Description",
          ],
          rows: visibleCostRows,
        },
      ],
    });
  }, [filteredProducts, operationalCostsByProduct, searchTerm, summary]);

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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="Total Revenue"
              value={formatAmount(summary.total_revenue)}
              icon={DollarSign}
              color="bg-sky-100 text-sky-700"
            />
            <SummaryCard
              label="Total Cost"
              value={formatAmount(summary.total_cost)}
              icon={Package}
              color="bg-amber-100 text-amber-700"
            />
            <SummaryCard
              label="Operational Costs"
              value={formatAmount(summary.total_operational_costs)}
              icon={TrendingUp}
              color="bg-orange-100 text-orange-700"
            />
            <SummaryCard
              label="Total Net Profit"
              value={formatAmount(summary.total_net_profit)}
              icon={TrendingUp}
              color="bg-emerald-100 text-emerald-700"
            />
            <SummaryCard
              label="Sold Units"
              value={formatCount(summary.total_sold_units)}
              icon={Package}
              color="bg-indigo-100 text-indigo-700"
            />
            <SummaryCard
              label="Profit Margin"
              value={formatPercent(summary.profit_margin)}
              icon={TrendingUp}
              color="bg-rose-100 text-rose-700"
            />
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="text-slate-500" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by product name or ID..."
                  className="w-full border-0 bg-transparent px-0 py-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                />
              </div>
              <div className="flex flex-col gap-2 xl:items-end">
                <button
                  onClick={exportNetProfitView}
                  className="inline-flex items-center gap-2 self-start rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-950 xl:self-end"
                >
                  <Download size={16} />
                  Export CSV
                </button>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Costs are tracked per product. Use Edit to manage cost price,
                  ads, shipping, workshop, packaging, and other expenses.
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Showing {formatCount(filteredProducts.length)} of{" "}
                  {formatCount(products.length)} products
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
            <div className="overflow-x-auto" dir="ltr">
              <table className="data-table table-fixed w-full min-w-[1880px]">
                <colgroup>
                  <col className="w-[340px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                  <col className="w-[160px]" />
                  <col className="w-[170px]" />
                  <col className="w-[620px]" />
                  <col className="w-[170px]" />
                  <col className="w-[180px]" />
                  <col className="w-[140px]" />
                  <col className="w-[180px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Product
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Sold
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Orders
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Avg Sell
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Revenue
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Cost Breakdown
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Total Costs
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Net Profit
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Margin
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredProducts.map((product) => {
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

                    const marginTone = getMarginTone(product.profit_margin);

                    return (
                      <tr
                        key={product.id}
                        className="align-top transition-colors hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-5">
                          <div className="flex min-w-0 items-start gap-4">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="h-16 w-16 flex-none rounded-2xl border border-slate-200 object-cover shadow-sm shadow-slate-200/60"
                              />
                            ) : (
                              <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
                                <Package size={22} className="text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p
                                className="break-words text-sm font-semibold leading-6 text-slate-900"
                                dir="auto"
                              >
                                {product.title}
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  #{product.id}
                                </span>
                                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                  {formatCount(opCosts.length)} tracked
                                </span>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    productCostMissing
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {productCostMissing ? "Cost missing" : "Cost saved"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatCount(product.sold_quantity)}
                            note="units sold"
                            align="center"
                          />
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatCount(product.orders_count)}
                            note="orders"
                            align="center"
                          />
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatAmount(product.avg_selling_price)}
                            note="per unit"
                          />
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatAmount(product.total_revenue)}
                            note="gross sales"
                            valueClassName="text-sky-700"
                          />
                        </td>
                        <td className="px-4 py-5">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <BreakdownMetric
                                label="Product Cost"
                                value={
                                  productCostMissing
                                    ? "Missing"
                                    : `${formatAmount(product.cost_price)} / unit`
                                }
                                note={
                                  productCostMissing
                                    ? "Add from Manage to unlock exact profit"
                                    : `Base total ${formatAmount(product.total_cost)}`
                                }
                                valueClassName={
                                  productCostMissing
                                    ? "text-amber-700"
                                    : "text-slate-900"
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

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Tracked Entries
                                </p>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {formatCount(opCosts.length)}
                                </span>
                              </div>

                              {opCosts.length > 0 ? (
                                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                                  {opCosts.map((cost) => (
                                    <div
                                      key={cost.id}
                                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-100/70"
                                    >
                                      <div className="min-w-0">
                                        <p
                                          className="truncate text-sm font-semibold text-slate-900"
                                          dir="auto"
                                        >
                                          {cost.cost_name ||
                                            COST_TYPE_LABELS[cost.cost_type] ||
                                            "Operational Cost"}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                                            {COST_TYPE_LABELS[cost.cost_type] ||
                                              "Other"}
                                          </span>
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                                            {getApplyToLabel(cost.apply_to)}
                                          </span>
                                          <span className="whitespace-nowrap">
                                            {formatAmount(cost.amount)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 pl-2">
                                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">
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
                                          className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                                          title="Edit cost"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            deleteOperationalCost(cost.id)
                                          }
                                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                          title="Delete cost"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
                                  No per-product costs added yet.
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatAmount(breakdown.totalCosts)}
                            note={`Ops ${formatAmount(
                              breakdown.operationalTotal,
                            )}`}
                          />
                        </td>
                        <td className="px-4 py-5">
                          <DataMetric
                            value={formatAmount(product.net_profit)}
                            note={
                              toAmount(product.net_profit) >= 0
                                ? "profitable"
                                : "loss making"
                            }
                            valueClassName={getProfitToneClass(product.net_profit)}
                          />
                        </td>
                        <td className="px-4 py-5">
                          <div className="mx-auto w-full max-w-[112px]">
                            <div
                              className={`rounded-full px-3 py-2 text-center text-sm font-semibold ring-1 ${marginTone.badge}`}
                            >
                              {formatPercent(product.profit_margin)}
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${marginTone.bar}`}
                                style={{
                                  width: `${Math.min(
                                    Math.abs(toAmount(product.profit_margin)),
                                    100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => openCostModal(product.id)}
                              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                                productCostMissing
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                              }`}
                              title={
                                productCostMissing
                                  ? "Set product cost and manage costs"
                                  : "Manage product cost and operational costs"
                              }
                            >
                              <Edit size={14} />
                              {productCostMissing ? "Set Cost" : "Manage"}
                            </button>
                            <button
                              onClick={() => {
                                openCostModal(product.id);
                                prepareNewOperationalCost();
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Add operational cost"
                            >
                              <Plus size={14} />
                              New Cost
                            </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Manage Product Costs
                </h2>
                {selectedProduct && (
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedProduct.title}
                  </p>
                )}
              </div>
              <button
                onClick={closeCostModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Product Cost Per Unit
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Add the real product cost here if it is missing from the
                        product data.
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        hasCostPrice(selectedProduct?.cost_price)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {hasCostPrice(selectedProduct?.cost_price)
                        ? `Saved ${formatAmount(selectedProduct?.cost_price)} / unit`
                        : "Cost missing"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="number"
                      step="0.01"
                      value={productCostDraft}
                      onChange={(e) => setProductCostDraft(e.target.value)}
                      placeholder="Product cost"
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-right"
                    />
                    <button
                      onClick={saveProductCostPrice}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
                    >
                      <Save size={16} />
                      Save Product Cost
                    </button>
                  </div>

                  {selectedProduct && (
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <InfoBadge
                        label="Revenue"
                        value={formatAmount(selectedProduct.total_revenue)}
                      />
                      <InfoBadge
                        label="Sold Qty"
                        value={String(selectedProduct.sold_quantity || 0)}
                      />
                      <InfoBadge
                        label="Orders"
                        value={String(selectedProduct.orders_count || 0)}
                      />
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Tracked Operational Costs
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Ads, workshop, shipping, packaging, and any extra
                        product-level expenses.
                      </p>
                    </div>
                    <button
                      onClick={prepareNewOperationalCost}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Plus size={14} />
                      New Cost
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selectedProductCosts.length > 0 ? (
                      selectedProductCosts.map((cost) => (
                        <div
                          key={cost.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {cost.cost_name ||
                                COST_TYPE_LABELS[cost.cost_type] ||
                                "Operational Cost"}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {COST_TYPE_LABELS[cost.cost_type] || "Other"} |{" "}
                              {getApplyToLabel(cost.apply_to)} |{" "}
                              {formatAmount(cost.amount)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800">
                              {formatAmount(
                                getAppliedCostTotal(
                                  cost,
                                  selectedProduct?.sold_quantity,
                                  selectedProduct?.orders_count,
                                ),
                              )}
                            </span>
                            <button
                              onClick={() =>
                                openCostModal(selectedProductId, cost)
                              }
                              className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                              title="Edit cost"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteOperationalCost(cost.id)}
                              className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                              title="Delete cost"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        No operational costs added for this product yet.
                      </p>
                    )}
                  </div>
                </section>
              </div>

              <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {editingOperationalCostId
                        ? "Edit Selected Cost"
                        : "Add New Operational Cost"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Use this form to save ads, workshop, shipping, packaging,
                      or any other cost for the current product.
                    </p>
                  </div>
                  {editingOperationalCostId ? (
                    <button
                      onClick={prepareNewOperationalCost}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Add Another Cost
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Cost name (optional)"
                    value={newCost.cost_name}
                    onChange={(e) =>
                      setNewCost((prev) => ({
                        ...prev,
                        cost_name: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                  <select
                    value={newCost.cost_type}
                    onChange={(e) =>
                      setNewCost((prev) => ({
                        ...prev,
                        cost_type: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  >
                    <option value="operations">Operations</option>
                    <option value="ads">Ads</option>
                    <option value="workshop">Workshop</option>
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
                      setNewCost((prev) => ({
                        ...prev,
                        amount: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                  <select
                    value={newCost.apply_to}
                    onChange={(e) =>
                      setNewCost((prev) => ({
                        ...prev,
                        apply_to: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  >
                    <option value="per_unit">Per Unit</option>
                    <option value="per_order">Per Order</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <textarea
                    rows={4}
                    placeholder="Description"
                    value={newCost.description}
                    onChange={(e) =>
                      setNewCost((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="md:col-span-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Per unit is multiplied by sold quantity. Per order is
                  multiplied by the number of orders. Fixed is applied once for
                  the product.
                </p>
              </section>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={saveOperationalCost}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                <Save size={16} />
                {editingOperationalCostId ? "Save Cost" : "Add Cost"}
              </button>
              <button
                onClick={closeCostModal}
                className="rounded-xl bg-gray-200 px-4 py-2.5 font-medium text-gray-800 hover:bg-gray-300"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataMetric({
  value,
  note,
  valueClassName = "text-slate-900",
  align = "left",
}) {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <div className={alignmentClass}>
      <div
        className={`whitespace-nowrap text-lg font-semibold tracking-tight tabular-nums ${valueClassName}`}
      >
        {value}
      </div>
      <p className="mt-1 text-xs font-medium text-slate-500">{note}</p>
    </div>
  );
}

function BreakdownMetric({
  label,
  value,
  note,
  valueClassName = "text-slate-900",
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-100/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div
        className={`mt-2 whitespace-nowrap text-sm font-semibold tabular-nums ${valueClassName}`}
      >
        {value}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}

function InfoBadge({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-100/60">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 whitespace-nowrap text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
            {value}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
