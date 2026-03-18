import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Truck,
  Wallet,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import api, { getErrorMessage, suppliersAPI } from "../utils/api";
import { formatCurrency, formatDateTime } from "../utils/helpers";
import { fetchAllPages } from "../utils/pagination";
import { extractArray } from "../utils/response";
import { subscribeToSharedDataUpdates } from "../utils/realtime";

const PAYMENT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cash", label: "كاش" },
  { value: "wallet", label: "محفظة" },
  { value: "instapay", label: "إنستاباي" },
  { value: "other", label: "أخرى" },
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const PAYMENT_METHOD_LABELS = {
  bank_transfer: "تحويل بنكي",
  cash: "كاش",
  wallet: "محفظة",
  instapay: "إنستاباي",
  other: "أخرى",
};
const DELIVERY_ITEM_TYPE_OPTIONS = [
  { value: "model", label: "موديل" },
  { value: "fabric", label: "قماش" },
];
const DELIVERY_ITEM_TYPE_LABELS = {
  model: "موديل",
  fabric: "قماش",
};
const DELIVERY_MEASUREMENT_UNIT_OPTIONS = [
  { value: "piece", label: "قطعة" },
  { value: "meter", label: "متر" },
  { value: "kilo", label: "كيلو" },
];
const DELIVERY_MEASUREMENT_UNIT_LABELS = {
  piece: "قطعة",
  meter: "متر",
  kilo: "كيلو",
};
const PRODUCTS_PAGE_SIZE = 200;
const DEFAULT_VARIANT_TITLES = new Set(["default", "default title"]);
const normalizeText = (value) => String(value || "").trim();
const formatCount = (value) => toNumber(value).toLocaleString("ar-EG");
const getTodayValue = () => new Date().toISOString().slice(0, 10);
const formatPaymentMethodLabel = (value) =>
  PAYMENT_METHOD_LABELS[normalizeText(value).toLowerCase()] || normalizeText(value) || "-";
const normalizeVariantTitle = (value) => {
  const normalized = normalizeText(value);
  if (!normalized || DEFAULT_VARIANT_TITLES.has(normalized.toLowerCase())) {
    return "";
  }

  return normalized;
};
const buildCatalogOptionValue = (productId, variantId = "") =>
  `${normalizeText(productId)}::${normalizeText(variantId)}`;
const getDeliveryItemSelectionValue = (item) =>
  buildCatalogOptionValue(item?.product_id, item?.variant_id);
const normalizeDeliveryItemType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return DELIVERY_ITEM_TYPE_LABELS[normalized] ? normalized : "model";
};
const normalizeDeliveryMeasurementUnit = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return DELIVERY_MEASUREMENT_UNIT_LABELS[normalized] ? normalized : "piece";
};
const formatDeliveryItemTypeLabel = (value) =>
  DELIVERY_ITEM_TYPE_LABELS[normalizeDeliveryItemType(value)] || "موديل";
const formatDeliveryMeasurementUnitLabel = (value) =>
  DELIVERY_MEASUREMENT_UNIT_LABELS[normalizeDeliveryMeasurementUnit(value)] || "قطعة";

const createEmptySupplierForm = () => ({
  code: "",
  name: "",
  contact_name: "",
  phone: "",
  address: "",
  notes: "",
  opening_balance: "",
  is_active: true,
});

const createEmptyDeliveryItem = () => ({
  item_type: "model",
  product_id: "",
  variant_id: "",
  variant_title: "",
  product_name: "",
  sku: "",
  catalog_query: "",
  material: "",
  color: "",
  piece_label: "",
  fabric_name: "",
  measurement_unit: "piece",
  pieces_per_unit: "",
  price_per_meter: "",
  price_per_kilo: "",
  piece_cost: "",
  manufacturing_cost: "",
  factory_service_cost: "",
  quantity: "1",
  unit_cost: "",
  total_cost: "",
  notes: "",
});

const createEmptyDeliveryForm = () => ({
  entry_date: getTodayValue(),
  reference_code: "",
  description: "",
  notes: "",
  items: [createEmptyDeliveryItem()],
});

const createEmptyPaymentForm = () => ({
  entry_date: getTodayValue(),
  reference_code: "",
  description: "",
  notes: "",
  payment_method: "cash",
  payment_account: "",
  amount: "",
});

const getDeliveryItemTotal = (item) => {
  const explicitTotal = toNumber(item?.total_cost);
  if (explicitTotal > 0) {
    return explicitTotal;
  }

  return toNumber(item?.quantity) * getDeliveryItemSuggestedUnitCost(item);
};

const getDeliveryItemMaterialUnitPrice = (item) => {
  const measurementUnit = normalizeDeliveryMeasurementUnit(item?.measurement_unit);
  if (measurementUnit === "meter") {
    return toNumber(item?.price_per_meter);
  }

  if (measurementUnit === "kilo") {
    return toNumber(item?.price_per_kilo);
  }

  return toNumber(item?.piece_cost);
};

const getDeliveryItemPieceCost = (item) => {
  const explicitPieceCost = toNumber(item?.piece_cost);
  if (explicitPieceCost > 0) {
    return explicitPieceCost;
  }

  const measurementUnit = normalizeDeliveryMeasurementUnit(item?.measurement_unit);
  if (measurementUnit !== "meter" && measurementUnit !== "kilo") {
    return 0;
  }

  const piecesPerUnit = toNumber(item?.pieces_per_unit);
  if (piecesPerUnit <= 0) {
    return 0;
  }

  return getDeliveryItemMaterialUnitPrice(item) / piecesPerUnit;
};

const getDeliveryItemSuggestedUnitCost = (item) => {
  const explicitUnitCost = toNumber(item?.unit_cost);
  if (explicitUnitCost > 0) {
    return explicitUnitCost;
  }

  const itemType = normalizeDeliveryItemType(item?.item_type);
  const materialUnitPrice = getDeliveryItemMaterialUnitPrice(item);
  const pieceCost = getDeliveryItemPieceCost(item);

  if (itemType === "fabric") {
    return materialUnitPrice > 0 ? materialUnitPrice : pieceCost;
  }

  return (
    (pieceCost > 0 ? pieceCost : materialUnitPrice) +
    toNumber(item?.manufacturing_cost) +
    toNumber(item?.factory_service_cost)
  );
};

const buildSupplierFormFromRecord = (supplier) => ({
  code: supplier?.code || "",
  name: supplier?.name || "",
  contact_name: supplier?.contact_name || "",
  phone: supplier?.phone || "",
  address: supplier?.address || "",
  notes: supplier?.notes || "",
  opening_balance:
    supplier?.opening_balance !== null && supplier?.opening_balance !== undefined
      ? String(supplier.opening_balance)
      : "",
  is_active: supplier?.is_active !== false,
});

const isSuppliersRelatedUpdate = (event) =>
  String(event?.source || "").toLowerCase().includes("/suppliers");
const isProductsRelatedUpdate = (event) => {
  const source = String(event?.source || "").toLowerCase();
  return source.includes("/shopify/products") || source.includes("/products/");
};
const buildProductCatalogOptions = (products = []) => {
  const options = [];

  for (const product of products) {
    const productId = normalizeText(product?.id || product?.shopify_id);
    const productTitle = normalizeText(product?.title) || "منتج بدون اسم";
    const variants = Array.isArray(product?.variants) ? product.variants : [];

    options.push({
      value: buildCatalogOptionValue(productId, ""),
      product_id: productId,
      variant_id: "",
      variant_title: "",
      product_name: productTitle,
      sku: normalizeText(product?.sku),
      inventory_quantity: toNumber(product?.inventory_quantity),
      label: `${productTitle} | المنتج الأساسي`,
      searchText: [productTitle, product?.vendor, product?.product_type, product?.sku]
        .join(" ")
        .toLowerCase(),
    });

    for (const variant of variants) {
      const variantId = normalizeText(variant?.id);
      const variantTitle = normalizeVariantTitle(variant?.title);
      const sku = normalizeText(variant?.sku || product?.sku);
      const displayName = [productTitle, variantTitle].filter(Boolean).join(" - ");

      options.push({
        value: buildCatalogOptionValue(productId, variantId),
        product_id: productId,
        variant_id: variantId,
        variant_title: variantTitle,
        product_name: productTitle,
        sku,
        inventory_quantity: toNumber(
          variant?.inventory_quantity ?? product?.inventory_quantity,
        ),
        label: sku ? `${displayName} | ${sku}` : displayName,
        searchText: [productTitle, variantTitle, product?.vendor, product?.product_type, sku]
          .join(" ")
          .toLowerCase(),
      });
    }
  }

  return options.sort((left, right) => left.label.localeCompare(right.label, "ar"));
};
const filterCatalogOptions = (options, query, limit = 80) => {
  const keyword = normalizeText(query).toLowerCase();
  const filtered = keyword
    ? options.filter((option) => option.searchText.includes(keyword))
    : options;
  return filtered.slice(0, limit);
};
const toArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const formatTextList = (values, fallback = "-") => {
  const list = toArray(values).map(normalizeText).filter(Boolean);
  return list.length > 0 ? list.join("، ") : fallback;
};
const buildProductDetailsPath = (productId) => {
  const normalized = normalizeText(productId);
  return normalized ? `/products/${encodeURIComponent(normalized)}` : "";
};
const isDeliveryItemDirty = (item) =>
  Boolean(
    normalizeText(item?.product_name) ||
      normalizeText(item?.catalog_query) ||
      normalizeText(item?.material) ||
      normalizeText(item?.color) ||
      normalizeText(item?.piece_label) ||
      normalizeText(item?.fabric_name) ||
      normalizeText(item?.pieces_per_unit) ||
      normalizeText(item?.price_per_meter) ||
      normalizeText(item?.price_per_kilo) ||
      normalizeText(item?.piece_cost) ||
      normalizeText(item?.manufacturing_cost) ||
      normalizeText(item?.factory_service_cost) ||
      normalizeText(item?.unit_cost) ||
      normalizeText(item?.total_cost) ||
      normalizeText(item?.notes) ||
      normalizeText(item?.sku) ||
      (normalizeText(item?.quantity) && normalizeText(item?.quantity) !== "1"),
  );

export default function Suppliers() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const canManageSuppliers = hasPermission("can_edit_products");

  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState("");
  const [supplierForm, setSupplierForm] = useState(createEmptySupplierForm);
  const [deliveryForm, setDeliveryForm] = useState(createEmptyDeliveryForm);
  const [paymentForm, setPaymentForm] = useState(createEmptyPaymentForm);
  const [productCatalogRows, setProductCatalogRows] = useState([]);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const productCatalogOptions = useMemo(
    () => buildProductCatalogOptions(productCatalogRows),
    [productCatalogRows],
  );
  const productCatalogByValue = useMemo(
    () => new Map(productCatalogOptions.map((option) => [option.value, option])),
    [productCatalogOptions],
  );

  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await suppliersAPI.list();
      const list = extractArray(response?.data);
      setSuppliers(list);
      setSelectedSupplierId((current) => {
        if (current && list.some((supplier) => supplier.id === current)) {
          return current;
        }
        return list[0]?.id || "";
      });
    } catch (requestError) {
      console.error("Error loading suppliers:", requestError);
      setSuppliers([]);
      setSelectedSupplierId("");
      setSelectedSupplier(null);
      setError(
        requestError?.response?.data?.error || "فشل تحميل بيانات الموردين",
      );
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSupplierDetail = useCallback(async (supplierId, { silent = false } = {}) => {
    if (!supplierId) {
      setSelectedSupplier(null);
      return;
    }

    try {
      if (!silent) {
        setDetailLoading(true);
      }

      const response = await suppliersAPI.getById(supplierId);
      setSelectedSupplier(response?.data?.supplier || null);
    } catch (requestError) {
      console.error("Error loading supplier detail:", requestError);
      setSelectedSupplier(null);
      setError(
        requestError?.response?.data?.error || "فشل تحميل تفاصيل المورد",
      );
      setError(getErrorMessage(requestError));
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }, []);

  const loadProductCatalog = useCallback(async ({ silent = false } = {}) => {
    if (!canManageSuppliers) {
      setProductCatalogRows([]);
      setCatalogError("");
      return;
    }

    try {
      if (!silent) {
        setCatalogLoading(true);
      }
      setCatalogError("");

      const rows = await fetchAllPages(
        ({ limit, offset }) =>
          api.get("/shopify/products", {
            params: {
              limit,
              offset,
              sort_by: "title",
              sort_dir: "asc",
            },
          }),
        { limit: PRODUCTS_PAGE_SIZE },
      );

      setProductCatalogRows(rows);
    } catch (requestError) {
      console.error("Error loading supplier product catalog:", requestError);
      setProductCatalogRows([]);
      setCatalogError(getErrorMessage(requestError));
    } finally {
      if (!silent) {
        setCatalogLoading(false);
      }
    }
  }, [canManageSuppliers]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    loadSupplierDetail(selectedSupplierId);
  }, [loadSupplierDetail, selectedSupplierId]);

  useEffect(() => {
    loadProductCatalog();
  }, [loadProductCatalog]);

  useEffect(() => {
    const requestedSupplierId = normalizeText(
      new URLSearchParams(location.search).get("supplier"),
    );
    if (!requestedSupplierId) {
      return;
    }

    if (!suppliers.some((supplier) => supplier.id === requestedSupplierId)) {
      return;
    }

    setSelectedSupplierId((current) =>
      current === requestedSupplierId ? current : requestedSupplierId,
    );
  }, [location.search, suppliers]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedDataUpdates((event) => {
      if (isSuppliersRelatedUpdate(event)) {
        loadSuppliers();
        if (selectedSupplierId) {
          loadSupplierDetail(selectedSupplierId, { silent: true });
        }
      }

      if (isProductsRelatedUpdate(event)) {
        loadProductCatalog({ silent: true });
      }
    });

    return () => unsubscribe();
  }, [loadProductCatalog, loadSupplierDetail, loadSuppliers, selectedSupplierId]);

  const filteredSuppliers = useMemo(() => {
    const keyword = String(searchTerm || "").trim().toLowerCase();
    if (!keyword) {
      return suppliers;
    }

    return suppliers.filter((supplier) =>
      [
        supplier?.name,
        supplier?.code,
        supplier?.contact_name,
        supplier?.phone,
        supplier?.address,
      ].some((value) => String(value || "").toLowerCase().includes(keyword)),
    );
  }, [searchTerm, suppliers]);

  const summary = useMemo(
    () =>
      suppliers.reduce(
        (acc, supplier) => {
          acc.total_suppliers += 1;
          if (supplier?.is_active !== false) {
            acc.active_suppliers += 1;
          }
          acc.total_deliveries += toNumber(supplier?.total_deliveries);
          acc.total_payments += toNumber(supplier?.total_payments);
          acc.outstanding_balance += toNumber(supplier?.outstanding_balance);
          return acc;
        },
        {
          total_suppliers: 0,
          active_suppliers: 0,
          total_deliveries: 0,
          total_payments: 0,
          outstanding_balance: 0,
        },
      ),
    [suppliers],
  );

  const startCreatingSupplier = () => {
    setEditingSupplierId("");
    setSupplierForm(createEmptySupplierForm());
    setShowSupplierForm(true);
  };

  const startEditingSupplier = () => {
    if (!selectedSupplier) {
      return;
    }

    setEditingSupplierId(selectedSupplier.id);
    setSupplierForm(buildSupplierFormFromRecord(selectedSupplier));
    setShowSupplierForm(true);
  };

  const closeSupplierForm = () => {
    setEditingSupplierId("");
    setSupplierForm(createEmptySupplierForm());
    setShowSupplierForm(false);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      setMessage({ type: "error", text: "اسم المورد مطلوب" });
      return;
    }

    try {
      setSavingSupplier(true);
      setMessage({ type: "", text: "" });

      const payload = {
        ...supplierForm,
        opening_balance: supplierForm.opening_balance || 0,
      };

      let nextSupplierId = editingSupplierId;
      if (editingSupplierId) {
        await suppliersAPI.update(editingSupplierId, payload);
      } else {
        const response = await suppliersAPI.create(payload);
        nextSupplierId = response?.data?.id || "";
      }

      await loadSuppliers();
      if (nextSupplierId) {
        setSelectedSupplierId(nextSupplierId);
        await loadSupplierDetail(nextSupplierId);
      }
      setMessage({
        type: "success",
        text: editingSupplierId
          ? "تم تحديث بيانات المورد"
          : "تم إضافة المورد بنجاح",
      });
      closeSupplierForm();
    } catch (requestError) {
      console.error("Error saving supplier:", requestError);
      setMessage({
        type: "error",
        text: requestError?.response?.data?.error || "فشل حفظ بيانات المورد",
      });
    } finally {
      setSavingSupplier(false);
    }
  };

  const updateDeliveryItem = (index, field, value) => {
    setDeliveryForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const selectDeliveryProduct = (index, selectedValue) => {
    const selectedOption = productCatalogByValue.get(selectedValue);

    setDeliveryForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (!selectedOption) {
          return {
            ...item,
            product_id: "",
            variant_id: "",
            variant_title: "",
            product_name: "",
            sku: "",
          };
        }

        return {
          ...item,
          product_id: selectedOption.product_id,
          variant_id: selectedOption.variant_id,
          variant_title: selectedOption.variant_title,
          product_name: selectedOption.product_name,
          sku: selectedOption.sku,
          catalog_query: selectedOption.label,
        };
      }),
    }));
  };

  const addDeliveryItem = () => {
    setDeliveryForm((current) => ({
      ...current,
      items: [...current.items, createEmptyDeliveryItem()],
    }));
  };

  const removeDeliveryItem = (index) => {
    setDeliveryForm((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((_, itemIndex) => itemIndex !== index)
          : current.items,
    }));
  };

  const saveDelivery = async () => {
    if (!selectedSupplierId) {
      setMessage({ type: "error", text: "اختر مورد أولًا" });
      return;
    }

    const normalizedItems = deliveryForm.items.filter(isDeliveryItemDirty);

    if (normalizedItems.length === 0) {
      setMessage({
        type: "error",
        text: "أضف موديلًا أو قماشًا واحدًا على الأقل داخل الوارد",
      });
      return;
    }

    if (normalizedItems.some((item) => !normalizeText(item?.product_name))) {
      setMessage({
        type: "error",
        text: "اكتب اسم الموديل أو القماشة أو اخترها من الكتالوج قبل حفظ الوارد",
      });
      return;
    }

    if (normalizedItems.some((item) => toNumber(item?.quantity) <= 0)) {
      setMessage({
        type: "error",
        text: "كمية كل صنف يجب أن تكون أكبر من صفر",
      });
      return;
    }

    try {
      setSavingDelivery(true);
      setMessage({ type: "", text: "" });

      await suppliersAPI.addDelivery(selectedSupplierId, {
        ...deliveryForm,
        items: normalizedItems.map((item) => ({
          ...item,
          piece_cost: item.piece_cost || getDeliveryItemPieceCost(item),
          unit_cost: item.unit_cost || getDeliveryItemSuggestedUnitCost(item),
          total_cost: item.total_cost || getDeliveryItemTotal(item),
        })),
      });

      await Promise.all([loadSuppliers(), loadSupplierDetail(selectedSupplierId)]);
      setDeliveryForm(createEmptyDeliveryForm());
      setMessage({ type: "success", text: "تم تسجيل الوارد بنجاح" });
    } catch (requestError) {
      console.error("Error saving delivery:", requestError);
      setMessage({
        type: "error",
        text: requestError?.response?.data?.error || "فشل تسجيل الوارد",
      });
    } finally {
      setSavingDelivery(false);
    }
  };

  const savePayment = async () => {
    if (!selectedSupplierId) {
      setMessage({ type: "error", text: "اختر مورد أولًا" });
      return;
    }

    if (toNumber(paymentForm.amount) <= 0) {
      setMessage({ type: "error", text: "قيمة الدفعة يجب أن تكون أكبر من صفر" });
      return;
    }

    try {
      setSavingPayment(true);
      setMessage({ type: "", text: "" });
      await suppliersAPI.addPayment(selectedSupplierId, paymentForm);
      await Promise.all([loadSuppliers(), loadSupplierDetail(selectedSupplierId)]);
      setPaymentForm(createEmptyPaymentForm());
      setMessage({ type: "success", text: "تم تسجيل الدفعة بنجاح" });
    } catch (requestError) {
      console.error("Error saving payment:", requestError);
      setMessage({
        type: "error",
        text: requestError?.response?.data?.error || "فشل تسجيل الدفعة",
      });
    } finally {
      setSavingPayment(false);
    }
  };

  if (typeof window !== "undefined") {
    return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
                  <Truck className="text-sky-700" size={28} />
                  الموردون والحسابات
                </h1>
                <p className="mt-2 text-slate-600">
                  ملف المورد يركز على البيانات الأساسية، بينما تفاصيل الواردات والدفعات
                  تُسجل داخل الحركات بكل تفاصيلها.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={loadSuppliers}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-950"
                >
                  <RefreshCw size={18} />
                  تحديث
                </button>
                {canManageSuppliers ? (
                  <button
                    onClick={startCreatingSupplier}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-white hover:bg-sky-800"
                  >
                    <Plus size={18} />
                    مورد جديد
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}

          {message.text ? (
            <div
              className={`flex items-center gap-2 rounded-xl border p-4 ${
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              {message.text}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="إجمالي الموردين"
              value={formatCount(summary.total_suppliers)}
              subtitle={`${formatCount(summary.active_suppliers)} مورد نشط`}
              icon={Building2}
              tone="sky"
            />
            <SummaryCard
              title="إجمالي الوارد"
              value={formatCurrency(summary.total_deliveries)}
              subtitle="قيمة كل الشحنات المسجلة"
              icon={Package}
              tone="blue"
            />
            <SummaryCard
              title="إجمالي المدفوع"
              value={formatCurrency(summary.total_payments)}
              subtitle="كل الدفعات المسجلة للموردين"
              icon={Wallet}
              tone="emerald"
            />
            <SummaryCard
              title="الرصيد المستحق"
              value={formatCurrency(summary.outstanding_balance)}
              subtitle="المتبقي على حساب الموردين"
              icon={CreditCard}
              tone="amber"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="ابحث باسم المورد أو الكود أو الهاتف"
                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {loading ? (
                    <EmptyState text="جاري تحميل الموردين..." />
                  ) : filteredSuppliers.length === 0 ? (
                    <EmptyState text="لا يوجد موردون مطابقون للبحث الحالي." />
                  ) : (
                    filteredSuppliers.map((supplier) => {
                      const isActive = supplier.id === selectedSupplierId;

                      return (
                        <button
                          key={supplier.id}
                          onClick={() => setSelectedSupplierId(supplier.id)}
                          className={`w-full rounded-2xl border p-4 text-right transition ${
                            isActive
                              ? "border-sky-300 bg-sky-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold text-slate-900">
                                {supplier.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                الكود: {supplier.code || "-"}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                supplier.is_active !== false
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {supplier.is_active !== false ? "نشط" : "مؤرشف"}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-3">
                            <KeyValueCompact label="الوارد" value={formatCurrency(supplier.total_deliveries)} />
                            <KeyValueCompact label="المدفوع" value={formatCurrency(supplier.total_payments)} />
                            <KeyValueCompact label="الرصيد" value={formatCurrency(supplier.outstanding_balance)} />
                            <KeyValueCompact label="الكمية" value={formatCount(supplier.received_quantity)} />
                            <KeyValueCompact label="الموديلات" value={formatCount(supplier.products_count)} />
                            <KeyValueCompact label="الأقمشة" value={formatCount(supplier.fabrics_count)} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {canManageSuppliers ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {editingSupplierId ? "تعديل المورد" : "إضافة مورد"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        بيانات المورد الأساسية فقط. تفاصيل الدفع تُسجل داخل الدفعات.
                      </p>
                    </div>
                    {showSupplierForm ? (
                      <button
                        onClick={closeSupplierForm}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        إغلاق
                      </button>
                    ) : null}
                  </div>

                  {!showSupplierForm ? (
                    <div className="space-y-3">
                      <button
                        onClick={startCreatingSupplier}
                        className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-medium text-white hover:bg-sky-800"
                      >
                        إنشاء مورد جديد
                      </button>
                      {selectedSupplier ? (
                        <button
                          onClick={startEditingSupplier}
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          تعديل المورد الحالي
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <SupplierForm
                      form={supplierForm}
                      setForm={setSupplierForm}
                      saving={savingSupplier}
                      onSave={saveSupplier}
                    />
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-6 xl:col-span-8">
              {renderDetails({
                selectedSupplierId,
                selectedSupplier,
                detailLoading,
                canEditProducts: canManageSuppliers,
                startEditingSupplier,
                deliveryForm,
                setDeliveryForm,
                updateDeliveryItem,
                selectDeliveryProduct,
                removeDeliveryItem,
                addDeliveryItem,
                saveDelivery,
                savingDelivery,
                paymentForm,
                setPaymentForm,
                savePayment,
                savingPayment,
                catalogLoading,
                catalogError,
                productCatalogOptions,
                productCatalogByValue,
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
    );
  }
}


function renderDetails({
  selectedSupplierId,
  selectedSupplier,
  detailLoading,
  canEditProducts,
  startEditingSupplier,
  deliveryForm,
  setDeliveryForm,
  updateDeliveryItem,
  selectDeliveryProduct,
  removeDeliveryItem,
  addDeliveryItem,
  saveDelivery,
  savingDelivery,
  paymentForm,
  setPaymentForm,
  savePayment,
  savingPayment,
  catalogLoading,
  catalogError,
  productCatalogOptions,
  productCatalogByValue,
}) {
  if (!selectedSupplierId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        اختر موردًا من القائمة أو أضف موردًا جديدًا للبدء.
      </div>
    );
  }

  if (detailLoading && !selectedSupplier) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        جاري تحميل تفاصيل المورد...
      </div>
    );
  }

  if (!selectedSupplier) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        تعذر تحميل المورد الحالي.
      </div>
    );
  }

  if (typeof window !== "undefined") {
    return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="إجمالي الوارد"
          value={formatCurrency(selectedSupplier.total_deliveries)}
          subtitle={`${formatCount(selectedSupplier.deliveries_count)} حركة وارد`}
          icon={Package}
          tone="blue"
        />
        <SummaryCard
          title="إجمالي المدفوع"
          value={formatCurrency(selectedSupplier.total_payments)}
          subtitle={`${formatCount(selectedSupplier.payments_count)} دفعة`}
          icon={Wallet}
          tone="emerald"
        />
        <SummaryCard
          title="الرصيد الحالي"
          value={formatCurrency(selectedSupplier.outstanding_balance)}
          subtitle={`رصيد افتتاحي ${formatCurrency(selectedSupplier.opening_balance)}`}
          icon={CreditCard}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={selectedSupplier.name}
          subtitle={`الكود: ${selectedSupplier.code || "-"}`}
          action={
            canEditProducts ? (
              <button
                onClick={startEditingSupplier}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                تعديل المورد
              </button>
            ) : null
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailLine label="المسؤول" value={selectedSupplier.contact_name} />
            <DetailLine label="الهاتف" value={selectedSupplier.phone} />
            <DetailLine label="العنوان" value={selectedSupplier.address} />
            <DetailLine
              label="الحالة"
              value={selectedSupplier.is_active !== false ? "نشط" : "مؤرشف"}
            />
            <DetailLine
              label="آخر وارد"
              value={formatDateTime(selectedSupplier.last_delivery_at)}
            />
            <DetailLine
              label="آخر دفعة"
              value={formatDateTime(selectedSupplier.last_payment_at)}
            />
          </div>
          {selectedSupplier.notes ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {selectedSupplier.notes}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="ملخص المتابعة"
          subtitle="الكميات والحساب الحالي لهذا المورد"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailLine
              label="الأصناف المستلمة"
              value={formatCount(selectedSupplier.received_items_count)}
            />
            <DetailLine
              label="إجمالي الكمية"
              value={formatCount(selectedSupplier.received_quantity)}
            />
            <DetailLine
              label="إجمالي الوارد"
              value={formatCurrency(selectedSupplier.total_deliveries)}
            />
            <DetailLine
              label="إجمالي المدفوع"
              value={formatCurrency(selectedSupplier.total_payments)}
            />
            <DetailLine
              label="عدد الموديلات"
              value={formatCount(selectedSupplier.products_count)}
            />
            <DetailLine
              label="عدد الأقمشة"
              value={formatCount(selectedSupplier.fabrics_count)}
            />
          </div>
        </SectionCard>
      </div>

      <SupplierCatalogExplorer supplier={selectedSupplier} />

      {canEditProducts ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <DeliveryForm
            form={deliveryForm}
            setForm={setDeliveryForm}
            updateItem={updateDeliveryItem}
            selectProduct={selectDeliveryProduct}
            removeItem={removeDeliveryItem}
            addItem={addDeliveryItem}
            onSave={saveDelivery}
            saving={savingDelivery}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            catalogOptions={productCatalogOptions}
            catalogByValue={productCatalogByValue}
          />
          <PaymentForm
            form={paymentForm}
            setForm={setPaymentForm}
            onSave={savePayment}
            saving={savingPayment}
          />
        </div>
      ) : null}

      <ReceivedItemsTable items={selectedSupplier.received_items || []} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentsList payments={selectedSupplier.payments || []} />
        <EntriesTimeline entries={selectedSupplier.entries || []} />
      </div>
    </>
    );
  }
}


function SupplierForm({ form, setForm, saving, onSave }) {
  if (typeof window !== "undefined") {
    return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="اسم المورد" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
        <TextInput label="الكود" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} />
        <TextInput label="اسم المسؤول" value={form.contact_name} onChange={(value) => setForm((current) => ({ ...current, contact_name: value }))} />
        <TextInput label="الهاتف" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
        <TextInput label="العنوان" value={form.address} onChange={(value) => setForm((current) => ({ ...current, address: value }))} />
        <TextInput label="الرصيد الافتتاحي" type="number" value={form.opening_balance} onChange={(value) => setForm((current) => ({ ...current, opening_balance: value }))} />
      </div>
      <TextArea label="ملاحظات" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
        <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
        المورد نشط ويظهر في القائمة
      </label>
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save size={18} />
        {saving ? "جارٍ الحفظ..." : "حفظ بيانات المورد"}
      </button>
    </div>
    );
  }

}

function DeliveryForm({
  form,
  setForm,
  updateItem,
  selectProduct,
  removeItem,
  addItem,
  onSave,
  saving,
  catalogLoading,
  catalogError,
  catalogOptions,
  catalogByValue,
}) {
  return (
    <SectionCard
      title="تسجيل وارد جديد"
      subtitle="اختر الأصناف من قائمة منتجات المتجر ثم أضف الكمية والتكلفة"
      action={
        <span className="text-xs text-slate-500">
          {catalogLoading
            ? "جاري تحميل المنتجات..."
            : `${formatCount(catalogOptions.length)} منتج متاح`}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="تاريخ الوارد" type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} />
          <TextInput label="رقم المرجع" value={form.reference_code} onChange={(value) => setForm((current) => ({ ...current, reference_code: value }))} />
        </div>
        <TextInput label="وصف سريع" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
        {catalogError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {catalogError}
          </div>
        ) : null}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {form.items.map((item, index) => {
            const filteredOptions = filterCatalogOptions(catalogOptions, item.catalog_query);
            const selectedOption = catalogByValue.get(getDeliveryItemSelectionValue(item));
            const itemType = normalizeDeliveryItemType(item?.item_type);
            const measurementUnit = normalizeDeliveryMeasurementUnit(item?.measurement_unit);
            const materialUnitPrice = getDeliveryItemMaterialUnitPrice(item);
            const pieceCost = getDeliveryItemPieceCost(item);
            const suggestedUnitCost = getDeliveryItemSuggestedUnitCost(item);

            return (
              <div key={`delivery-item-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">صنف الوارد #{index + 1}</div>
                  {form.items.length > 1 ? (
                    <button onClick={() => removeItem(index)} className="text-xs text-rose-600 hover:text-rose-700">
                      حذف
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <SelectInput
                    label="نوع الصنف"
                    value={item.item_type}
                    options={DELIVERY_ITEM_TYPE_OPTIONS}
                    onChange={(value) => updateItem(index, "item_type", value)}
                  />
                  <TextInput
                    label="اسم الموديل / القماش"
                    value={item.product_name}
                    onChange={(value) => updateItem(index, "product_name", value)}
                  />
                  <TextInput label="ابحث بالاسم أو SKU" value={item.catalog_query} onChange={(value) => updateItem(index, "catalog_query", value)} />
                  <SelectInput
                    label="اختر المنتج"
                    value={getDeliveryItemSelectionValue(item)}
                    disabled={catalogLoading}
                    options={[
                      {
                        value: "",
                        label: catalogLoading
                          ? "جاري تحميل المنتجات..."
                          : filteredOptions.length > 0
                            ? "اختر منتجًا من القائمة"
                            : "لا توجد نتائج مطابقة",
                      },
                      ...filteredOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      })),
                    ]}
                    onChange={(value) => selectProduct(index, value)}
                  />
                  <TextInput label="اللون" value={item.color} onChange={(value) => updateItem(index, "color", value)} />
                  <TextInput label="اسم القماش" value={item.fabric_name} onChange={(value) => updateItem(index, "fabric_name", value)} />
                  <TextInput label="القطعة / الرولة" value={item.piece_label} onChange={(value) => updateItem(index, "piece_label", value)} />
                  <SelectInput
                    label="وحدة الخامة"
                    value={item.measurement_unit}
                    options={DELIVERY_MEASUREMENT_UNIT_OPTIONS}
                    onChange={(value) => updateItem(index, "measurement_unit", value)}
                  />
                  <TextInput
                    label="ينتج كام قطعة من المتر / الكيلو"
                    type="number"
                    value={item.pieces_per_unit}
                    onChange={(value) => updateItem(index, "pieces_per_unit", value)}
                  />
                  <TextInput label="سعر المتر" type="number" value={item.price_per_meter} onChange={(value) => updateItem(index, "price_per_meter", value)} />
                  <TextInput label="سعر الكيلو" type="number" value={item.price_per_kilo} onChange={(value) => updateItem(index, "price_per_kilo", value)} />
                  <TextInput label="سعر القطعة" type="number" value={item.piece_cost} onChange={(value) => updateItem(index, "piece_cost", value)} />
                  <TextInput label="تكلفة التصنيع" type="number" value={item.manufacturing_cost} onChange={(value) => updateItem(index, "manufacturing_cost", value)} />
                  <TextInput label="خدمة المصنع" type="number" value={item.factory_service_cost} onChange={(value) => updateItem(index, "factory_service_cost", value)} />
                  <TextInput label="الخامة أو الوصف الفني" value={item.material} onChange={(value) => updateItem(index, "material", value)} />
                  <TextInput label="الكمية" type="number" value={item.quantity} onChange={(value) => updateItem(index, "quantity", value)} />
                  <TextInput label="سعر الوحدة" type="number" value={item.unit_cost} onChange={(value) => updateItem(index, "unit_cost", value)} />
                  <TextInput label="الإجمالي" type="number" value={item.total_cost} onChange={(value) => updateItem(index, "total_cost", value)} />
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <div className="text-xs text-slate-500">المنتج المختار</div>
                  <div className="mt-1 font-medium text-slate-900">{item.product_name || "-"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.variant_title || "بدون متغير"}
                    {item.sku ? ` | SKU: ${item.sku}` : ""}
                    {selectedOption ? ` | المخزون الحالي: ${formatCount(selectedOption.inventory_quantity)}` : ""}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailStat label="النوع" value={formatDeliveryItemTypeLabel(itemType)} />
                  <DetailStat label="الوحدة" value={formatDeliveryMeasurementUnitLabel(measurementUnit)} />
                  <DetailStat label="سعر المادة" value={formatCurrency(materialUnitPrice)} />
                  <DetailStat label="سعر القطعة" value={formatCurrency(pieceCost)} />
                  <DetailStat label="التصنيع" value={formatCurrency(item.manufacturing_cost)} />
                  <DetailStat label="خدمة المصنع" value={formatCurrency(item.factory_service_cost)} />
                  <DetailStat label="تكلفة الوحدة" value={formatCurrency(item.unit_cost || suggestedUnitCost)} />
                  <DetailStat label="الإجمالي" value={formatCurrency(getDeliveryItemTotal(item))} />
                </div>
                <TextInput label="ملاحظات الصنف" value={item.notes} onChange={(value) => updateItem(index, "notes", value)} />
                <div className="mt-2 text-xs text-slate-500">
                  الإجمالي المحسوب: {formatCurrency(getDeliveryItemTotal(item))}
                </div>
              </div>
            );
          })}
          <button onClick={addItem} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <Plus size={16} />
            إضافة صنف جديد
          </button>
        </div>
        <TextArea label="ملاحظات الوارد" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "جارٍ الحفظ..." : "حفظ الوارد"}
        </button>
      </div>
    </SectionCard>
    );
  }

function PaymentForm({ form, setForm, onSave, saving }) {
  return (
    <SectionCard
      title="تسجيل دفعة"
      subtitle="سجل كل دفعة بطريقة السداد والحساب المستخدم وتفاصيل المرجع"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="تاريخ الدفعة" type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} />
          <TextInput label="رقم المرجع" value={form.reference_code} onChange={(value) => setForm((current) => ({ ...current, reference_code: value }))} />
          <TextInput label="المبلغ" type="number" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} />
          <SelectInput
            label="طريقة الدفع"
            value={form.payment_method}
            options={PAYMENT_METHOD_OPTIONS.map((option) => ({
              ...option,
              label: PAYMENT_METHOD_LABELS[option.value] || option.label,
            }))}
            onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))}
          />
          <TextInput label="الحساب المستخدم" value={form.payment_account} onChange={(value) => setForm((current) => ({ ...current, payment_account: value }))} />
          <TextInput label="وصف سريع" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
        </div>
        <TextArea label="ملاحظات الدفعة" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "جارٍ الحفظ..." : "حفظ الدفعة"}
        </button>
      </div>
    </SectionCard>
    );
  }

function SupplierCatalogExplorer({ supplier }) {
  const productCatalog = toArray(supplier?.product_catalog);
  const fabricCatalog = toArray(supplier?.fabric_catalog);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard
        title="خريطة الموديلات"
        subtitle="عرض خارجي سريع، وافتح كل موديل لرؤية المورد والخامة والواردات المرتبطة به"
      >
        {productCatalog.length > 0 ? (
          <div className="space-y-3">
            {productCatalog.map((group) => (
              <details
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-slate-50"
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {group.product_name || "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {group.variant_title || "بدون متغير"}
                        {group.sku ? ` | SKU: ${group.sku}` : ""}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-left text-xs sm:min-w-[220px]">
                      <KeyValueCompact
                        label="الكمية"
                        value={formatCount(group.total_quantity)}
                      />
                      <KeyValueCompact
                        label="الإجمالي"
                        value={formatCurrency(group.total_cost)}
                      />
                      <KeyValueCompact
                        label="الواردات"
                        value={formatCount(group.deliveries_count)}
                      />
                      <KeyValueCompact
                        label="الأقمشة"
                        value={formatCount(toArray(group.fabrics).length)}
                      />
                    </div>
                  </div>
                </summary>

                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailLineCompact
                      label="آخر وارد"
                      value={formatDateTime(group.last_delivery_at)}
                    />
                    <DetailLineCompact
                      label="الوحدات"
                      value={formatTextList(group.measurement_units)}
                    />
                    <DetailLineCompact
                      label="الأقمشة"
                      value={formatTextList(group.fabrics)}
                    />
                    <DetailLineCompact
                      label="الخامات"
                      value={formatTextList(group.materials)}
                    />
                    <DetailLineCompact
                      label="الألوان"
                      value={formatTextList(group.colors)}
                    />
                    <DetailLineCompact
                      label="نوع الصنف"
                      value={formatTextList(
                        toArray(group.item_types).map(formatDeliveryItemTypeLabel),
                      )}
                    />
                  </div>

                  {group.product_id ? (
                    <div className="mt-4">
                      <Link
                        to={buildProductDetailsPath(group.product_id)}
                        className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
                      >
                        فتح صفحة المنتج
                      </Link>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {toArray(group.items).map((item, index) => (
                      <div
                        key={`${group.key}-${item.delivery_id || "row"}-${index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {item.product_name || "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDateTime(item.entry_date)}
                              {item.reference_code ? ` | مرجع: ${item.reference_code}` : ""}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-slate-800">
                            {formatCurrency(item.total_cost)}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <DetailLineCompact
                            label="القماش"
                            value={item.fabric_name || item.material || "-"}
                          />
                          <DetailLineCompact
                            label="الوصف"
                            value={item.material || "-"}
                          />
                          <DetailLineCompact
                            label="الكمية"
                            value={formatCount(item.quantity)}
                          />
                          <DetailLineCompact
                            label="تكلفة الوحدة"
                            value={formatCurrency(item.unit_cost)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState text="لا توجد موديلات مرتبطة بحركات المورد الحالي حتى الآن." />
        )}
      </SectionCard>

      <SectionCard
        title="فهرس الأقمشة"
        subtitle="كل قماش وتابعه أي موديلات وكمياته ووارداته"
      >
        {fabricCatalog.length > 0 ? (
          <div className="space-y-3">
            {fabricCatalog.map((group) => (
              <details
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-slate-50"
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {group.fabric_name || "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatTextList(
                          toArray(group.measurement_units).map(
                            formatDeliveryMeasurementUnitLabel,
                          ),
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-left text-xs sm:min-w-[220px]">
                      <KeyValueCompact
                        label="الكمية"
                        value={formatCount(group.total_quantity)}
                      />
                      <KeyValueCompact
                        label="الإجمالي"
                        value={formatCurrency(group.total_cost)}
                      />
                      <KeyValueCompact
                        label="الواردات"
                        value={formatCount(group.deliveries_count)}
                      />
                      <KeyValueCompact
                        label="الموديلات"
                        value={formatCount(toArray(group.products).length)}
                      />
                    </div>
                  </div>
                </summary>

                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailLineCompact
                      label="آخر وارد"
                      value={formatDateTime(group.last_delivery_at)}
                    />
                    <DetailLineCompact
                      label="الخامات"
                      value={formatTextList(group.materials)}
                    />
                    <DetailLineCompact
                      label="الألوان"
                      value={formatTextList(group.colors)}
                    />
                    <DetailLineCompact
                      label="الموديلات المرتبطة"
                      value={formatTextList(
                        toArray(group.products).map((product) => product.product_name),
                      )}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {toArray(group.products).map((product) => (
                      <div
                        key={`${group.key}-${product.key}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {product.product_name || "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {product.variant_title || "بدون متغير"}
                              {product.sku ? ` | SKU: ${product.sku}` : ""}
                            </div>
                          </div>
                          {product.product_id ? (
                            <Link
                              to={buildProductDetailsPath(product.product_id)}
                              className="text-sm font-medium text-sky-700 hover:text-sky-800"
                            >
                              فتح المنتج
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState text="لا توجد أقمشة مرتبطة بحركات المورد الحالي حتى الآن." />
        )}
      </SectionCard>
    </div>
  );
}


function ReceivedItemsTable({ items }) {
  return (
    <SectionCard title="المنتجات المستلمة من المورد" subtitle="كل الأصناف المرتبطة بحركات الوارد للمورد الحالي">
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2 font-semibold">التاريخ</th>
                <th className="px-3 py-2 font-semibold">المنتج / النوع</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">التفاصيل</th>
                <th className="px-3 py-2 font-semibold">الكمية</th>
                <th className="px-3 py-2 font-semibold">الأسعار</th>
                <th className="px-3 py-2 font-semibold">الإجمالي</th>
                <th className="px-3 py-2 font-semibold">المرجع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.delivery_id}-${item.sku}-${index}`} className="border-b border-slate-100 text-slate-700">
                  <td className="px-3 py-3">{formatDateTime(item.entry_date)}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">
                    <div>
                      {item.product_id ? (
                        <Link
                          to={buildProductDetailsPath(item.product_id)}
                          className="text-sky-700 hover:text-sky-800 hover:underline"
                        >
                          {item.product_name}
                        </Link>
                      ) : (
                        item.product_name
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.variant_title || "-"} | {formatDeliveryItemTypeLabel(item.item_type)}
                    </div>
                    {item.color ? (
                      <div className="mt-1 text-xs text-slate-500">اللون: {item.color}</div>
                    ) : null}
                    {item.fabric_name ? (
                      <div className="mt-1 text-xs text-slate-500">القماش: {item.fabric_name}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{item.sku || "-"}</td>
                  <td className="px-3 py-3">
                    <div>{item.material || "-"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      الوحدة: {formatDeliveryMeasurementUnitLabel(item.measurement_unit)}
                    </div>
                    {item.piece_label ? (
                      <div className="mt-1 text-xs text-slate-500">القطعة: {item.piece_label}</div>
                    ) : null}
                    {toNumber(item.pieces_per_unit) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        الناتج: {formatCount(item.pieces_per_unit)} قطعة
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{formatCount(item.quantity)}</td>
                  <td className="px-3 py-3">
                    <div>{formatCurrency(item.unit_cost)}</div>
                    {toNumber(item.price_per_meter) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        سعر المتر: {formatCurrency(item.price_per_meter)}
                      </div>
                    ) : null}
                    {toNumber(item.price_per_kilo) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        سعر الكيلو: {formatCurrency(item.price_per_kilo)}
                      </div>
                    ) : null}
                    {toNumber(item.piece_cost) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        سعر القطعة: {formatCurrency(item.piece_cost)}
                      </div>
                    ) : null}
                    {toNumber(item.manufacturing_cost) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        تصنيع: {formatCurrency(item.manufacturing_cost)}
                      </div>
                    ) : null}
                    {toNumber(item.factory_service_cost) > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        خدمة المصنع: {formatCurrency(item.factory_service_cost)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{formatCurrency(item.total_cost)}</td>
                  <td className="px-3 py-3">{item.reference_code || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="لا توجد حركات وارد مسجلة لهذا المورد حتى الآن." />
      )}
    </SectionCard>
  );
}

function PaymentsList({ payments }) {
  return (
    <SectionCard title="الدفعات المسجلة" subtitle="كل المدفوعات المرتبطة بالمورد">
      {payments.length > 0 ? (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{formatCurrency(payment.amount)}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(payment.entry_date)}</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  {formatPaymentMethodLabel(payment.payment_method)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <DetailLineCompact label="الحساب" value={payment.payment_account || "-"} />
                <DetailLineCompact label="المرجع" value={payment.reference_code || "-"} />
                <DetailLineCompact label="الوصف" value={payment.description || payment.notes || "-"} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="لا توجد دفعات مسجلة للمورد الحالي." />
      )}
    </SectionCard>
  );
}

function EntriesTimeline({ entries }) {
  return (
    <SectionCard title="الحركة المحاسبية" subtitle="Timeline مختصر للواردات والدفعات">
      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {entry.entry_type === "delivery"
                      ? "وارد"
                      : entry.entry_type === "payment"
                        ? "دفعة"
                        : "تسوية"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDateTime(entry.entry_date)}
                  </div>
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    entry.entry_type === "payment"
                      ? "bg-emerald-100 text-emerald-700"
                      : entry.entry_type === "delivery"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {formatCurrency(entry.amount)}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <DetailLineCompact label="المرجع" value={entry.reference_code || "-"} />
                <DetailLineCompact label="الوصف" value={entry.description || entry.notes || "-"} />
                <DetailLineCompact
                  label="العناصر"
                  value={entry.entry_type === "delivery" ? formatCount(entry.items?.length || 0) : "-"}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="لا توجد حركات مسجلة لهذا المورد بعد." />
      )}
    </SectionCard>
  );
}

function SummaryCard({ title, value, subtitle, icon: Icon, tone = "sky" }) {
  const tones = {
    sky: "border-sky-100 bg-sky-50 text-sky-700",
    blue: "border-cyan-100 bg-cyan-50 text-cyan-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.sky}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium opacity-80">{title}</div>
          <div className="mt-2 text-2xl font-bold">{value}</div>
          <div className="mt-2 text-xs opacity-80">{subtitle}</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TextInput({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
      />
    </label>
  );
}

function SelectInput({ label, value, options, onChange, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value || "-"}</div>
    </div>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
      />
    </label>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</div>
    </div>
  );
}

function DetailLineCompact({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xs font-medium text-slate-700">{value || "-"}</div>
    </div>
  );
}

function KeyValueCompact({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
