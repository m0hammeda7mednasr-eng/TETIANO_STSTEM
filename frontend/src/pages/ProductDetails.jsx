import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import {
  ArrowLeft,
  Package,
  Edit2,
  Save,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  Image as ImageIcon,
  Printer,
} from "lucide-react";
import api from "../utils/api";
import BarcodeLabelModal from "../components/BarcodeLabelModal";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { normalizeBarcodeVariantTitle } from "../utils/barcodeLabels";
import {
  formatCurrency as formatMoney,
  formatDateTime,
  formatNumber,
} from "../utils/localeFormat";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatCount = (value) =>
  formatNumber(value, { maximumFractionDigits: 0 });
const toArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const formatTextList = (values, fallback = "-") => {
  const list = toArray(values)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return list.length > 0 ? list.join(", ") : fallback;
};

const PRODUCT_FIELD_LABELS = {
  price: "Price",
  inventory: "Inventory",
  sku: "SKU",
  variants: "Variant changes",
  cost_price: "Cost price",
  supplier_phone: "Supplier phone",
  supplier_location: "Supplier location",
};
const formatFieldList = (fields = []) => {
  const labels = Array.from(
    new Set(
      fields
        .map((field) => PRODUCT_FIELD_LABELS[field] || field)
        .filter(Boolean),
    ),
  );

  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
};
const buildSaveMessage = (result = {}) => {
  const shopifyFields = Array.isArray(result?.shopifyFields)
    ? result.shopifyFields
    : [];
  const localOnlyFields = Array.isArray(result?.localOnlyFields)
    ? result.localOnlyFields
    : [];

  if (shopifyFields.length > 0 && localOnlyFields.length > 0) {
    return `Saved. ${formatFieldList(shopifyFields)} synced to Shopify. ${formatFieldList(localOnlyFields)} saved locally only.`;
  }

  if (shopifyFields.length > 0) {
    return `Saved. ${formatFieldList(shopifyFields)} synced to Shopify.`;
  }

  if (localOnlyFields.length > 0) {
    return `Saved. ${formatFieldList(localOnlyFields)} saved locally only.`;
  }

  return result?.shopifySync === "synced"
    ? "Saved and synced to Shopify."
    : "Saved locally.";
};

const cloneVariantDrafts = (variants = []) =>
  variants.map((variant) => ({
    id: String(variant.id || ""),
    price: String(variant.price ?? ""),
    sku: String(variant.sku || ""),
    inventory_quantity: String(toNumber(variant.inventory_quantity)),
  }));

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, hasPermission } = useAuth();
  const { select, currencyLabel } = useLocale();
  const canEditProducts = hasPermission("can_edit_products");
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeModalTargetKey, setBarcodeModalTargetKey] = useState("");

  // Editable fields
  const [editedProduct, setEditedProduct] = useState({});
  const [editedVariants, setEditedVariants] = useState([]);

  const hasMultipleVariants = (product?.variants?.length || 0) > 1;
  const editedVariantsById = useMemo(
    () =>
      new Map(editedVariants.map((variant) => [String(variant.id), variant])),
    [editedVariants],
  );

  const displayedInventoryQuantity = useMemo(() => {
    if (!product) return 0;

    if (hasMultipleVariants) {
      return editing
        ? editedVariants.reduce(
            (sum, variant) => sum + toNumber(variant.inventory_quantity),
            0,
          )
        : toNumber(product.inventory_quantity);
    }

    return editing
      ? toNumber(editedProduct.inventory_quantity)
      : toNumber(product.inventory_quantity);
  }, [
    editedProduct.inventory_quantity,
    editedVariants,
    editing,
    hasMultipleVariants,
    product,
  ]);

  const barcodeTargets = useMemo(() => {
    if (!product) {
      return [];
    }

    const productTitle = String(product.title || "").trim();
    const productVendor = String(product.vendor || "").trim();
    const variants =
      Array.isArray(product.variants) && product.variants.length > 0
        ? product.variants
        : [product];

    return variants
      .map((variant, index) => {
        const resolvedSku = String(
          variant?.sku || (!hasMultipleVariants ? product?.sku : "") || "",
        ).trim();
        const resolvedBarcode = String(
          variant?.barcode ||
            (!hasMultipleVariants ? product?.barcode : "") ||
            "",
        ).trim();

        return {
          key: String(
            variant?.id || product?.id || `product-barcode-target-${index}`,
          ),
          title: productTitle,
          subtitle: normalizeBarcodeVariantTitle(variant?.title, productTitle),
          sku: resolvedSku,
          barcode: resolvedBarcode,
          vendor: productVendor,
        };
      })
      .filter((target) => target.sku || target.barcode);
  }, [hasMultipleVariants, product]);

  const hasPrintableBarcodeTarget = barcodeTargets.length > 0;

  const showNotification = useCallback((message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const fetchProductDetails = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/shopify/products/${id}/details`);
      setProduct(response.data);
      setEditedProduct(response.data);
      setEditedVariants(cloneVariantDrafts(response.data?.variants || []));
    } catch (error) {
      console.error("Error fetching product details:", error);
      showNotification("فشل تحميل تفاصيل المنتج", "error");
    } finally {
      setLoading(false);
    }
  }, [id, showNotification]);

  useEffect(() => {
    fetchProductDetails();
  }, [id, fetchProductDetails]);

  useEffect(() => {
    if (!product || searchParams.get("mode") !== "edit") {
      return;
    }

    if (canEditProducts) {
      setEditing(true);
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("mode");
    setSearchParams(nextSearchParams, { replace: true });
  }, [canEditProducts, product, searchParams, setSearchParams]);

  const handleSave = async () => {
    if (!canEditProducts) return;
    setSaving(true);
    try {
      const payload = {};
      const nextPrice = parseFloat(editedProduct.price);
      const nextInventory = parseInt(editedProduct.inventory_quantity, 10);
      const nextSku = String(editedProduct.sku || "").trim();
      const nextSupplierPhone = String(
        editedProduct.supplier_phone || "",
      ).trim();
      const nextSupplierLocation = String(
        editedProduct.supplier_location || "",
      ).trim();

      if (
        !hasMultipleVariants &&
        Number.isFinite(nextPrice) &&
        nextPrice !== toNumber(product.price)
      ) {
        payload.price = nextPrice;
      }

      if (
        !hasMultipleVariants &&
        Number.isFinite(nextInventory) &&
        nextInventory !== toNumber(product.inventory_quantity)
      ) {
        payload.inventory = nextInventory;
      }

      if (isAdmin) {
        const nextCostPrice = parseFloat(editedProduct.cost_price || 0);
        if (
          Number.isFinite(nextCostPrice) &&
          nextCostPrice !== toNumber(product.cost_price)
        ) {
          payload.cost_price = nextCostPrice;
        }

        const nextAdsCost = parseFloat(editedProduct.ads_cost || 0);
        if (
          Number.isFinite(nextAdsCost) &&
          nextAdsCost !== toNumber(product.ads_cost)
        ) {
          payload.ads_cost = nextAdsCost;
        }

        const nextOperationCost = parseFloat(editedProduct.operation_cost || 0);
        if (
          Number.isFinite(nextOperationCost) &&
          nextOperationCost !== toNumber(product.operation_cost)
        ) {
          payload.operation_cost = nextOperationCost;
        }

        const nextShippingCost = parseFloat(editedProduct.shipping_cost || 0);
        if (
          Number.isFinite(nextShippingCost) &&
          nextShippingCost !== toNumber(product.shipping_cost)
        ) {
          payload.shipping_cost = nextShippingCost;
        }
      }

      if (
        !hasMultipleVariants &&
        nextSku !== String(product.sku || "").trim()
      ) {
        payload.sku = nextSku;
      }

      if (nextSupplierPhone !== String(product.supplier_phone || "").trim()) {
        payload.supplier_phone = nextSupplierPhone;
      }

      if (
        nextSupplierLocation !== String(product.supplier_location || "").trim()
      ) {
        payload.supplier_location = nextSupplierLocation;
      }

      const originalVariantsById = new Map(
        (product.variants || []).map((variant) => [
          String(variant.id || ""),
          {
            inventory_quantity: toNumber(variant.inventory_quantity),
            price: toNumber(variant.price),
            sku: String(variant.sku || "").trim(),
          },
        ]),
      );

      const variantUpdates = editedVariants
        .map((variant) => {
          const variantId = String(variant.id || "");
          const originalVariant = originalVariantsById.get(variantId);

          if (!originalVariant) {
            return null;
          }

          const nextVariantUpdate = {
            id: variant.id,
          };

          if (
            toNumber(variant.inventory_quantity) !==
            originalVariant.inventory_quantity
          ) {
            nextVariantUpdate.inventory_quantity = toNumber(
              variant.inventory_quantity,
            );
          }

          if (toNumber(variant.price) !== originalVariant.price) {
            nextVariantUpdate.price = toNumber(variant.price);
          }

          if (String(variant.sku || "").trim() !== originalVariant.sku) {
            nextVariantUpdate.sku = String(variant.sku || "").trim();
          }

          return Object.keys(nextVariantUpdate).length > 1
            ? nextVariantUpdate
            : null;
        })
        .filter(Boolean);

      if (variantUpdates.length > 0) {
        payload.variant_updates = variantUpdates;
      }

      if (Object.keys(payload).length === 0) {
        showNotification("لا توجد تغييرات للحفظ", "info");
        setSaving(false);
        return;
      }

      const response = await api.post(
        `/shopify/products/${id}/update`,
        payload,
      );
      const saveResult = response.data || {};
      showNotification(buildSaveMessage(saveResult), "success");
      setEditing(false);

      if (saveResult.shopifySync === "synced") {
        setTimeout(() => {
          fetchProductDetails();
        }, 1500);
      } else {
        fetchProductDetails();
      }
    } catch (error) {
      console.error("Error saving product:", error);
      showNotification(error.response?.data?.error || "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedProduct(product);
    setEditedVariants(cloneVariantDrafts(product?.variants || []));
    setEditing(false);
  };

  const handleVariantFieldChange = (variantId, field, value) => {
    setEditedVariants((currentVariants) =>
      currentVariants.map((variant) =>
        String(variant.id) === String(variantId)
          ? {
              ...variant,
              [field]: value,
            }
          : variant,
      ),
    );
  };

  const openBarcodeModal = useCallback(
    (targetKey = "") => {
      if (!hasPrintableBarcodeTarget) {
        showNotification(
          select(
            "لا يوجد SKU أو باركود صالح للطباعة لهذا المنتج.",
            "This product does not have a printable SKU or barcode yet.",
          ),
          "error",
        );
        return;
      }

      setBarcodeModalTargetKey(targetKey);
      setIsBarcodeModalOpen(true);
    },
    [hasPrintableBarcodeTarget, select, showNotification],
  );

  const handleCopyProductReference = async () => {
    try {
      await navigator.clipboard.writeText(String(product?.id || id || ""));
      showNotification(
        select("تم نسخ معرف المنتج", "Product ID copied"),
        "success",
      );
    } catch {
      showNotification(
        select("فشل نسخ معرف المنتج", "Failed to copy product ID"),
        "error",
      );
    }
  };

  const getSyncStatusIcon = () => {
    if (product?.pending_sync) {
      return (
        <Clock
          size={20}
          className="text-yellow-500"
          title="في انتظار المزامنة"
        />
      );
    }
    if (product?.sync_error) {
      return (
        <AlertCircle
          size={20}
          className="text-red-500"
          title={product.sync_error}
        />
      );
    }
    if (product?.last_synced_at) {
      return (
        <CheckCircle
          size={20}
          className="text-green-500"
          title="تمت المزامنة"
        />
      );
    }
    return null;
  };

  const formatDate = (dateString) =>
    formatDateTime(dateString, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="flex h-screen bg-transparent">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">جاري تحميل تفاصيل المنتج...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex h-screen bg-transparent">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package size={64} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">لم يتم العثور على المنتج</p>
            <button
              onClick={() => navigate("/products")}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              العودة إلى المنتجات
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-transparent">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Notification */}
          {notification && (
            <div
              className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
                notification.type === "success"
                  ? "bg-green-500 text-white"
                  : notification.type === "error"
                    ? "bg-red-500 text-white"
                    : "bg-blue-500 text-white"
              }`}
            >
              {notification.type === "success" && <CheckCircle size={20} />}
              {notification.type === "error" && <AlertCircle size={20} />}
              <span>{notification.message}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/products")}
                className="app-button-secondary rounded-2xl p-2.5 text-slate-700"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-800">
                    {product.title}
                  </h1>
                  {getSyncStatusIcon()}
                  <button
                    onClick={handleCopyProductReference}
                    className="app-button-secondary inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700"
                    title={select("نسخ معرف المنتج", "Copy product ID")}
                  >
                    <Copy size={14} />
                    {select("نسخ", "Copy")}
                  </button>
                </div>
                <p className="text-gray-600">
                  تم الإنشاء في {formatDate(product.created_at)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {hasPrintableBarcodeTarget && (
                <button
                  onClick={() => openBarcodeModal(barcodeTargets[0]?.key || "")}
                  className="app-button-secondary flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  <Printer size={16} />
                  {select("طباعة ليبل", "Print label")}
                </button>
              )}
              {canEditProducts &&
                (editing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="app-button-secondary flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      <X size={16} />
                      إلغاء
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="app-button-primary flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          جاري الحفظ...
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          حفظ التغييرات
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="app-button-primary flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Edit2 size={16} />
                    تعديل
                  </button>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Product Image */}
              <div className="app-surface rounded-[28px] p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  صورة المنتج
                </h2>
                <div className="flex h-96 w-full items-center justify-center overflow-hidden rounded-[24px] bg-slate-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon size={64} className="text-gray-400" />
                  )}
                </div>
              </div>

              {/* Product Description */}
              {product.body_html && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    الوصف
                  </h2>
                  <div
                    className="prose max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: product.body_html }}
                  />
                </div>
              )}

              <ProductSupplyChainSection
                sourcing={product.supply_chain}
                onOpenSupplier={(supplierId, supplierType = "factory") =>
                  navigate(
                    supplierId
                      ? `${
                          supplierType === "fabric"
                            ? "/suppliers/fabric-suppliers"
                            : "/suppliers"
                        }?supplier=${encodeURIComponent(supplierId)}`
                      : supplierType === "fabric"
                        ? "/suppliers/fabric-suppliers"
                        : "/suppliers",
                  )
                }
              />

              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    الأشكال ({product.variants.length})
                  </h2>
                  {hasMultipleVariants && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      تحكم في مخزون كل Variant من هنا، وإجمالي المخزون بيتحدث من
                      مجموع كل الفاريانتس.
                    </div>
                  )}
                  <div className="space-y-3">
                    {product.variants.map((variant, index) => {
                      const variantDraft =
                        editedVariantsById.get(String(variant.id || "")) || {};
                      const displayedVariantPrice =
                        editing && hasMultipleVariants
                          ? (variantDraft.price ?? variant.price)
                          : variant.price;
                      const displayedVariantSku =
                        editing && hasMultipleVariants
                          ? (variantDraft.sku ?? variant.sku)
                          : variant.sku;
                      const displayedVariantInventory = toNumber(
                        editing && hasMultipleVariants
                          ? (variantDraft.inventory_quantity ??
                              variant.inventory_quantity)
                          : variant.inventory_quantity,
                      );

                      return (
                        <div
                          key={index}
                          className="rounded-[24px] border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 hover:bg-white"
                          data-variant-inventory={displayedVariantInventory}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800">
                                {variant.title}
                              </p>
                              {(displayedVariantSku ||
                                (editing && hasMultipleVariants)) && (
                                <p className="text-sm text-gray-600">
                                  SKU: {displayedVariantSku || "-"}
                                </p>
                              )}
                              {variant.barcode && (
                                <p className="text-sm text-gray-600">
                                  Barcode: {variant.barcode}
                                </p>
                              )}
                              {variant.weight && (
                                <p className="text-sm text-gray-600">
                                  الوزن: {variant.weight} {variant.weight_unit}
                                </p>
                              )}
                              <div className="flex gap-4 mt-2">
                                {variant.option1 && (
                                  <span className="app-chip px-2.5 py-1 text-xs text-slate-700">
                                    {variant.option1}
                                  </span>
                                )}
                                {variant.option2 && (
                                  <span className="app-chip px-2.5 py-1 text-xs text-slate-700">
                                    {variant.option2}
                                  </span>
                                )}
                                {variant.option3 && (
                                  <span className="app-chip px-2.5 py-1 text-xs text-slate-700">
                                    {variant.option3}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-lg font-bold text-gray-800">
                                {formatMoney(displayedVariantPrice)}
                              </p>
                              {variant.compare_at_price &&
                                parseFloat(variant.compare_at_price) >
                                  parseFloat(displayedVariantPrice) && (
                                  <p className="text-sm text-gray-500 line-through">
                                    {formatMoney(variant.compare_at_price)}
                                  </p>
                                )}
                              <p
                                className={`text-sm ${
                                  toNumber(
                                    editing
                                      ? (editedVariantsById.get(
                                          String(variant.id || ""),
                                        )?.inventory_quantity ??
                                          variant.inventory_quantity)
                                      : variant.inventory_quantity,
                                  ) > 10
                                    ? "text-green-600"
                                    : toNumber(
                                          editing
                                            ? (editedVariantsById.get(
                                                String(variant.id || ""),
                                              )?.inventory_quantity ??
                                                variant.inventory_quantity)
                                            : variant.inventory_quantity,
                                        ) > 0
                                      ? "text-yellow-600"
                                      : "text-red-600"
                                }`}
                              >
                                المخزون:{" "}
                                {toNumber(
                                  editing
                                    ? (editedVariantsById.get(
                                        String(variant.id || ""),
                                      )?.inventory_quantity ??
                                        variant.inventory_quantity)
                                    : variant.inventory_quantity,
                                )}
                              </p>
                              {(variant.barcode || displayedVariantSku) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openBarcodeModal(
                                      String(
                                        variant.id ||
                                          barcodeTargets[0]?.key ||
                                          "",
                                      ),
                                    )
                                  }
                                  className="mt-3 app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
                                >
                                  <Printer size={14} />
                                  {select("طباعة ليبل", "Print label")}
                                </button>
                              )}
                              {editing &&
                                canEditProducts &&
                                hasMultipleVariants && (
                                  <div className="mt-3 space-y-3">
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-gray-600">
                                        SKU
                                      </label>
                                      <input
                                        type="text"
                                        value={
                                          variantDraft.sku ??
                                          String(variant.sku || "")
                                        }
                                        onChange={(event) =>
                                          handleVariantFieldChange(
                                            variant.id,
                                            "sku",
                                            event.target.value,
                                          )
                                        }
                                        className="app-input w-full px-3 py-2.5 text-sm"
                                        placeholder="SKU-001"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-gray-600">
                                        {select("تعديل السعر", "Edit price")}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={
                                          variantDraft.price ??
                                          String(variant.price ?? "")
                                        }
                                        onChange={(event) =>
                                          handleVariantFieldChange(
                                            variant.id,
                                            "price",
                                            event.target.value,
                                          )
                                        }
                                        className="app-input w-full px-3 py-2.5 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-gray-600">
                                        تعديل مخزون هذا الـ Variant
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={
                                          editedVariantsById.get(
                                            String(variant.id || ""),
                                          )?.inventory_quantity ??
                                          String(
                                            toNumber(
                                              variant.inventory_quantity,
                                            ),
                                          )
                                        }
                                        onChange={(event) =>
                                          handleVariantFieldChange(
                                            variant.id,
                                            "inventory_quantity",
                                            event.target.value,
                                          )
                                        }
                                        className="app-input w-full px-3 py-2.5 text-sm"
                                      />
                                    </div>
                                  </div>
                                )}
                              {variant.requires_shipping && (
                                <p className="text-xs text-gray-500 mt-1">
                                  يتطلب شحن
                                </p>
                              )}
                              {variant.taxable && (
                                <p className="text-xs text-gray-500">
                                  خاضع للضريبة
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product Images Gallery */}
              {product.images && product.images.length > 1 && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    معرض الصور ({product.images.length})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {product.images.map((image, index) => (
                      <div
                        key={index}
                        className="relative aspect-square overflow-hidden rounded-[22px] bg-slate-100 transition hover:shadow-lg"
                      >
                        <img
                          src={image.src}
                          alt={image.alt || `صورة ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {image.alt && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2">
                            {image.alt}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Options */}
              {product.options && product.options.length > 0 && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    خيارات المنتج
                  </h2>
                  <div className="space-y-4">
                    {product.options.map((option, index) => (
                      <div
                        key={index}
                        className="border-b border-gray-200 pb-4 last:border-0"
                      >
                        <p className="font-semibold text-gray-800 mb-2">
                          {option.name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {option.values.map((value, vIndex) => (
                            <span
                              key={vIndex}
                              className="px-3 py-1 bg-blue-50 text-blue-800 rounded-lg text-sm"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SEO Information */}
              {(product.seo_title ||
                product.seo_description ||
                product.handle) && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    معلومات SEO
                  </h2>
                  <div className="space-y-3">
                    {product.handle && (
                      <div>
                        <p className="text-sm text-gray-600">Handle (URL)</p>
                        <p className="font-mono text-gray-800 bg-gray-50 px-3 py-2 rounded">
                          {product.handle}
                        </p>
                      </div>
                    )}
                    {product.seo_title && (
                      <div>
                        <p className="text-sm text-gray-600">عنوان SEO</p>
                        <p className="text-gray-800">{product.seo_title}</p>
                      </div>
                    )}
                    {product.seo_description && (
                      <div>
                        <p className="text-sm text-gray-600">وصف SEO</p>
                        <p className="text-gray-700 text-sm">
                          {product.seo_description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Price & Inventory */}
              <div className="app-surface rounded-[28px] p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  السعر والمخزون
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      السعر ({currencyLabel})
                    </label>
                    {editing && !hasMultipleVariants ? (
                      <input
                        type="number"
                        value={editedProduct.price}
                        onChange={(e) =>
                          setEditedProduct({
                            ...editedProduct,
                            price: e.target.value,
                          })
                        }
                        min="0"
                        step="0.01"
                        className="app-input w-full px-3 py-2.5 text-sm"
                      />
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-gray-800">
                          {formatMoney(product.price)}
                        </p>
                        {editing && hasMultipleVariants && (
                          <p className="mt-2 text-sm text-slate-600">
                            Edit each variant price in the variants section.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {isAdmin && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          سعر التكلفة ({currencyLabel})
                        </label>
                        {editing ? (
                          <input
                            type="number"
                            value={editedProduct.cost_price || 0}
                            onChange={(e) =>
                              setEditedProduct({
                                ...editedProduct,
                                cost_price: e.target.value,
                              })
                            }
                            min="0"
                            step="0.01"
                            className="app-input w-full px-3 py-2.5 text-sm"
                          />
                        ) : (
                          <p className="text-2xl font-bold text-gray-800">
                            {formatMoney(product.cost_price || 0)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          تكلفة الإعلانات ({currencyLabel})
                        </label>
                        {editing ? (
                          <input
                            type="number"
                            value={editedProduct.ads_cost || 0}
                            onChange={(e) =>
                              setEditedProduct({
                                ...editedProduct,
                                ads_cost: e.target.value,
                              })
                            }
                            min="0"
                            step="0.01"
                            className="app-input w-full px-3 py-2.5 text-sm"
                          />
                        ) : (
                          <p className="text-2xl font-bold text-gray-800">
                            {formatMoney(product.ads_cost || 0)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          تكلفة التشغيل ({currencyLabel})
                        </label>
                        {editing ? (
                          <input
                            type="number"
                            value={editedProduct.operation_cost || 0}
                            onChange={(e) =>
                              setEditedProduct({
                                ...editedProduct,
                                operation_cost: e.target.value,
                              })
                            }
                            min="0"
                            step="0.01"
                            className="app-input w-full px-3 py-2.5 text-sm"
                          />
                        ) : (
                          <p className="text-2xl font-bold text-gray-800">
                            {formatMoney(product.operation_cost || 0)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          تكلفة الشحن ({currencyLabel})
                        </label>
                        {editing ? (
                          <input
                            type="number"
                            value={editedProduct.shipping_cost || 0}
                            onChange={(e) =>
                              setEditedProduct({
                                ...editedProduct,
                                shipping_cost: e.target.value,
                              })
                            }
                            min="0"
                            step="0.01"
                            className="app-input w-full px-3 py-2.5 text-sm"
                          />
                        ) : (
                          <p className="text-2xl font-bold text-gray-800">
                            {formatMoney(product.shipping_cost || 0)}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Profit Calculation */}
                  {isAdmin && product.price && product.cost_price && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="bg-green-50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-green-800">
                            الربح لكل وحدة:
                          </span>
                          <span className="text-lg font-bold text-green-900">
                            {(
                              parseFloat(product.price) -
                              (parseFloat(product.cost_price || 0) +
                                parseFloat(product.ads_cost || 0) +
                                parseFloat(product.operation_cost || 0) +
                                parseFloat(product.shipping_cost || 0))
                            ).toFixed(2)}{" "}
                            {currencyLabel}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-green-800">
                            هامش الربح:
                          </span>
                          <span className="text-lg font-bold text-green-900">
                            {(
                              ((parseFloat(product.price) -
                                (parseFloat(product.cost_price || 0) +
                                  parseFloat(product.ads_cost || 0) +
                                  parseFloat(product.operation_cost || 0) +
                                  parseFloat(product.shipping_cost || 0))) /
                                parseFloat(product.price)) *
                              100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                        {displayedInventoryQuantity > 0 && (
                          <div className="flex justify-between items-center pt-2 border-t border-green-200">
                            <span className="text-sm font-medium text-green-800">
                              الربح المحتمل (المخزون الكلي):
                            </span>
                            <span className="text-lg font-bold text-green-900">
                              {(
                                (parseFloat(product.price) -
                                  (parseFloat(product.cost_price || 0) +
                                    parseFloat(product.ads_cost || 0) +
                                    parseFloat(product.operation_cost || 0) +
                                    parseFloat(product.shipping_cost || 0))) *
                                displayedInventoryQuantity
                              ).toFixed(2)}{" "}
                              {currencyLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {hasMultipleVariants ? "إجمالي المخزون" : "المخزون"}
                    </label>
                    {editing && !hasMultipleVariants ? (
                      <input
                        type="number"
                        value={editedProduct.inventory_quantity}
                        onChange={(e) =>
                          setEditedProduct({
                            ...editedProduct,
                            inventory_quantity: e.target.value,
                          })
                        }
                        min="0"
                        step="1"
                        className="app-input w-full px-3 py-2.5 text-sm"
                      />
                    ) : (
                      <>
                        <p
                          className={`text-2xl font-bold ${
                            displayedInventoryQuantity > 10
                              ? "text-green-600"
                              : displayedInventoryQuantity > 0
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {displayedInventoryQuantity}
                        </p>
                        {editing && hasMultipleVariants && (
                          <p className="mt-2 text-sm text-slate-600">
                            عدل مخزون كل Variant من قسم الأشكال.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div className="app-surface rounded-[28px] p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  معلومات المنتج
                </h2>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    SKU syncs with Shopify. Supplier phone and location are
                    saved on this product locally.
                  </div>
                  {product.vendor && (
                    <div>
                      <p className="text-sm text-gray-600">Vendor في Shopify</p>
                      <p className="font-semibold text-gray-800">
                        {product.vendor}
                      </p>
                    </div>
                  )}
                  {product.product_type && (
                    <div>
                      <p className="text-sm text-gray-600">النوع</p>
                      <p className="font-semibold text-gray-800">
                        {product.product_type}
                      </p>
                    </div>
                  )}
                  {(editing && !hasMultipleVariants) || product.sku ? (
                    <div>
                      <p className="text-sm text-gray-600">SKU</p>
                      {editing && !hasMultipleVariants ? (
                        <input
                          type="text"
                          value={editedProduct.sku || ""}
                          onChange={(e) =>
                            setEditedProduct({
                              ...editedProduct,
                              sku: e.target.value,
                            })
                          }
                          className="app-input w-full px-3 py-2.5 text-sm"
                          placeholder="SKU-001"
                        />
                      ) : (
                        <p className="font-semibold text-gray-800">
                          {product.sku || "-"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Primary SKU syncs to Shopify.
                      </p>
                    </div>
                  ) : null}
                  {editing && hasMultipleVariants && (
                    <div>
                      <p className="text-sm text-gray-600">SKU</p>
                      <p className="font-semibold text-gray-800">
                        Edit each variant SKU in the variants section.
                      </p>
                    </div>
                  )}
                  {(editing || product.supplier_phone) && (
                    <div>
                      <p className="text-sm text-gray-600">Supplier Phone</p>
                      {editing ? (
                        <input
                          type="text"
                          value={editedProduct.supplier_phone || ""}
                          onChange={(e) =>
                            setEditedProduct({
                              ...editedProduct,
                              supplier_phone: e.target.value,
                            })
                          }
                          className="app-input w-full px-3 py-2.5 text-sm"
                          placeholder="01000000000"
                        />
                      ) : (
                        <p className="font-semibold text-gray-800">
                          {product.supplier_phone || "-"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Saved locally on this product. Not synced to Shopify.
                      </p>
                    </div>
                  )}
                  {(editing || product.supplier_location) && (
                    <div>
                      <p className="text-sm text-gray-600">Supplier Location</p>
                      {editing ? (
                        <input
                          type="text"
                          value={editedProduct.supplier_location || ""}
                          onChange={(e) =>
                            setEditedProduct({
                              ...editedProduct,
                              supplier_location: e.target.value,
                            })
                          }
                          className="app-input w-full px-3 py-2.5 text-sm"
                          placeholder="Warehouse, city, or supplier location"
                        />
                      ) : (
                        <p className="font-semibold text-gray-800">
                          {product.supplier_location || "-"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Saved locally on this product. Not synced to Shopify.
                      </p>
                    </div>
                  )}
                  {product.barcode && (
                    <div>
                      <p className="text-sm text-gray-600">Barcode</p>
                      <p className="font-semibold text-gray-800">
                        {product.barcode}
                      </p>
                    </div>
                  )}
                  {product.weight && (
                    <div>
                      <p className="text-sm text-gray-600">الوزن</p>
                      <p className="font-semibold text-gray-800">
                        {product.weight} {product.weight_unit || "kg"}
                      </p>
                    </div>
                  )}
                  {product.weight_min !== undefined &&
                    product.weight_max !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600">نطاق الوزن</p>
                        <p className="font-semibold text-gray-800">
                          {product.weight_min} - {product.weight_max} جرام
                        </p>
                      </div>
                    )}
                  {product.total_inventory !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600">إجمالي المخزون</p>
                      <p className="font-semibold text-gray-800">
                        {product.total_inventory} وحدة
                      </p>
                    </div>
                  )}
                  {product.requires_shipping !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600">يتطلب شحن</p>
                      <p className="font-semibold text-gray-800">
                        {product.requires_shipping ? "نعم" : "لا"}
                      </p>
                    </div>
                  )}
                  {product.taxable !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600">خاضع للضريبة</p>
                      <p className="font-semibold text-gray-800">
                        {product.taxable ? "نعم" : "لا"}
                      </p>
                    </div>
                  )}
                  {product.inventory_tracked !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600">تتبع المخزون</p>
                      <p className="font-semibold text-gray-800">
                        {product.inventory_tracked ? "نعم" : "لا"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Price Range */}
              {product.price_varies && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    نطاق السعر
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">أقل سعر</p>
                      <p className="text-xl font-bold text-gray-800">
                        {formatMoney(product.price_min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">أعلى سعر</p>
                      <p className="text-xl font-bold text-gray-800">
                        {formatMoney(product.price_max)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sale Information */}
              {product.on_sale && product.compare_at_price_min && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    معلومات التخفيض
                  </h2>
                  <div className="bg-red-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
                        تخفيض
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">السعر الأصلي</p>
                      <p className="text-lg font-bold text-gray-500 line-through">
                        {formatMoney(product.compare_at_price_min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">السعر بعد التخفيض</p>
                      <p className="text-xl font-bold text-red-600">
                        {formatMoney(product.price_min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">نسبة التخفيض</p>
                      <p className="text-lg font-bold text-red-600">
                        {(
                          ((product.compare_at_price_min - product.price_min) /
                            product.compare_at_price_min) *
                          100
                        ).toFixed(0)}
                        %
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tags */}
              {product.tags && product.tags.length > 0 && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    الوسوم
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {product.tags.split(",").map((tag, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="app-surface rounded-[28px] p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">الحالة</h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">حالة المنتج</p>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                        product.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {product.status === "active" ? "نشط" : "غير نشط"}
                    </span>
                  </div>
                  {product.published_at && (
                    <div>
                      <p className="text-sm text-gray-600">تاريخ النشر</p>
                      <p className="text-gray-800 text-sm">
                        {formatDate(product.published_at)}
                      </p>
                    </div>
                  )}
                  {product.published_scope && (
                    <div>
                      <p className="text-sm text-gray-600">نطاق النشر</p>
                      <p className="text-gray-800">{product.published_scope}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600">حالة المخزون</p>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                        displayedInventoryQuantity > 10
                          ? "bg-green-100 text-green-800"
                          : displayedInventoryQuantity > 0
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {displayedInventoryQuantity > 10
                        ? "متوفر"
                        : displayedInventoryQuantity > 0
                          ? "كمية قليلة"
                          : "نفذ من المخزون"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sync Status */}
              {product.last_synced_at && (
                <div className="app-surface rounded-[28px] p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    حالة المزامنة
                  </h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {getSyncStatusIcon()}
                      <span className="text-gray-600">
                        {product.pending_sync
                          ? "في انتظار المزامنة"
                          : product.sync_error
                            ? "فشلت المزامنة"
                            : "تمت المزامنة"}
                      </span>
                    </div>
                    {product.last_synced_at && (
                      <p className="text-gray-600">
                        آخر مزامنة: {formatDate(product.last_synced_at)}
                      </p>
                    )}
                    {product.sync_error && (
                      <p className="text-red-600 text-xs">
                        {product.sync_error}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="app-surface rounded-[28px] p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  التواريخ
                </h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-gray-600">تاريخ الإنشاء</p>
                    <p className="text-gray-800">
                      {formatDate(product.created_at)}
                    </p>
                  </div>
                  {product.updated_at && (
                    <div>
                      <p className="text-gray-600">آخر تحديث</p>
                      <p className="text-gray-800">
                        {formatDate(product.updated_at)}
                      </p>
                    </div>
                  )}
                  {product.local_updated_at && (
                    <div>
                      <p className="text-gray-600">آخر تحديث محلي</p>
                      <p className="text-gray-800">
                        {formatDate(product.local_updated_at)}
                      </p>
                    </div>
                  )}
                  {product.shopify_updated_at && (
                    <div>
                      <p className="text-gray-600">آخر تحديث من Shopify</p>
                      <p className="text-gray-800">
                        {formatDate(product.shopify_updated_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BarcodeLabelModal
        open={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        targets={barcodeTargets}
        defaultTargetKey={barcodeModalTargetKey}
      />
    </div>
  );
}

function ProductSupplyChainSection({ sourcing, onOpenSupplier }) {
  const { select, isRTL, languageTag } = useLocale();
  if (!sourcing) {
    return null;
  }

  const factorySuppliers = toArray(
    sourcing.factory_suppliers || sourcing.suppliers,
  );
  const fabricSuppliers = toArray(sourcing.fabric_suppliers);
  const fabrics = toArray(sourcing.fabrics);
  const variants = toArray(sourcing.variants);
  const deliveries = toArray(sourcing.deliveries);
  const textAlignClass = isRTL ? "text-right" : "text-left";
  const miniStatsAlignClass = isRTL ? "text-right" : "text-left";

  return (
    <div className="app-surface rounded-[28px] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className={textAlignClass}>
          <h2 className="text-xl font-bold text-gray-800">
            {select("سلسلة التوريد", "Supply Chain")}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {select(
              "المصانع ومورّدو القماش والأقمشة والواردات المرتبطة بهذا المنتج بشكل مباشر.",
              "Factories, fabric suppliers, fabrics, and deliveries linked to this product.",
            )}
          </p>
        </div>
        <button
          onClick={() => onOpenSupplier("", "factory")}
          className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
        >
          {select("فتح شاشة الموردين", "Open suppliers")}
        </button>
      </div>

      {sourcing.deliveries_count > 0 ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SupplyMetric
              label={select("عدد المصانع", "Factories")}
              value={formatCount(factorySuppliers.length)}
            />
            <SupplyMetric
              label={select("عدد مورّدي القماش", "Fabric Suppliers")}
              value={formatCount(
                sourcing.fabric_supplier_count || fabricSuppliers.length,
              )}
            />
            <SupplyMetric
              label={select("عدد الواردات", "Deliveries")}
              value={formatCount(sourcing.deliveries_count)}
            />
            <SupplyMetric
              label={select("إجمالي التكلفة", "Total Cost")}
              value={formatMoney(sourcing.total_cost)}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="space-y-3">
              <h3
                className={`text-base font-semibold text-gray-800 ${textAlignClass}`}
              >
                {select("المصانع", "Factories")}
              </h3>
              {factorySuppliers.map((supplier) => (
                <div
                  key={supplier.supplier_id || supplier.name}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className={textAlignClass}>
                      <div className="text-sm font-semibold text-gray-900">
                        {supplier.name || "-"}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {supplier.code
                          ? `${select("الكود", "Code")}: ${supplier.code}`
                          : select("بدون كود", "No code")}
                        {supplier.phone ? ` | ${supplier.phone}` : ""}
                      </div>
                    </div>
                    {supplier.supplier_id ? (
                      <button
                        onClick={() =>
                          onOpenSupplier(supplier.supplier_id, "factory")
                        }
                        className="app-button-secondary rounded-xl px-3 py-2 text-sm font-semibold text-slate-700"
                      >
                        {select("فتح المورد", "Open supplier")}
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <SupplyInlineStat
                      label={select("الكمية", "Quantity")}
                      value={formatCount(supplier.total_quantity)}
                    />
                    <SupplyInlineStat
                      label={select("التكلفة", "Cost")}
                      value={formatMoney(supplier.total_cost)}
                    />
                    <SupplyInlineStat
                      label={select("الأقمشة", "Fabrics")}
                      value={formatTextList(supplier.fabrics)}
                    />
                    <SupplyInlineStat
                      label={select("المتغيرات", "Variants")}
                      value={formatTextList(supplier.variants)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div
                  className={`text-sm font-semibold text-gray-900 ${textAlignClass}`}
                >
                  {select("مورّدو القماش", "Fabric Suppliers")}
                </div>
                {fabricSuppliers.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {fabricSuppliers.map((supplier) => (
                      <div
                        key={supplier.supplier_id || supplier.name}
                        className="rounded-lg border border-gray-200 bg-white p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className={textAlignClass}>
                            <div className="text-sm font-medium text-gray-900">
                              {supplier.name || "-"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {supplier.code
                                ? `${select("الكود", "Code")}: ${supplier.code}`
                                : select("بدون كود", "No code")}
                            </div>
                          </div>
                          {supplier.supplier_id ? (
                            <button
                              onClick={() =>
                                onOpenSupplier(supplier.supplier_id, "fabric")
                              }
                              className="app-button-secondary rounded-xl px-3 py-2 text-sm font-semibold text-slate-700"
                            >
                              {select("فتح المورد", "Open supplier")}
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <SupplyInlineStat
                            label={select("الأقمشة", "Fabrics")}
                            value={formatTextList(supplier.fabrics)}
                          />
                          <SupplyInlineStat
                            label={select("التكلفة", "Cost")}
                            value={formatMoney(supplier.total_cost)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-500">
                    {select(
                      "لا يوجد مورّدو قماش مرتبطون بهذا المنتج حتى الآن.",
                      "No fabric suppliers are linked to this product yet.",
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div
                  className={`text-sm font-semibold text-gray-900 ${textAlignClass}`}
                >
                  {select("الأقمشة المرتبطة", "Linked Fabrics")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fabrics.length > 0 ? (
                    fabrics.map((fabric) => (
                      <span
                        key={fabric.key || fabric.fabric_name}
                        className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 border border-gray-200"
                      >
                        {fabric.fabric_code
                          ? `${fabric.fabric_code} | ${fabric.fabric_name}`
                          : fabric.fabric_name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">
                      {select("لا توجد أقمشة مسجلة.", "No fabrics recorded.")}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div
                  className={`text-sm font-semibold text-gray-900 ${textAlignClass}`}
                >
                  {select("تفاصيل المتغيرات", "Variant Details")}
                </div>
                {variants.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {variants.map((variant) => (
                      <div
                        key={
                          variant.key ||
                          `${variant.product_name}-${variant.variant_title}`
                        }
                        className="rounded-lg border border-gray-200 bg-white p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {variant.variant_title ||
                                variant.product_name ||
                                "-"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {variant.sku
                                ? `SKU: ${variant.sku}`
                                : select("بدون SKU", "No SKU")}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-gray-800">
                            {formatCount(variant.total_quantity)}{" "}
                            {select("قطعة", "pcs")}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                          {select("الخامات", "Materials")}:{" "}
                          {formatTextList(variant.fabrics)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-500">
                    {select(
                      "لا توجد متغيرات أو موردون مسجلون لهذا المنتج حتى الآن.",
                      "No variants or supplier links are recorded for this product yet.",
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <h3
              className={`text-base font-semibold text-gray-800 ${textAlignClass}`}
            >
              {select("آخر الواردات", "Recent Deliveries")}
            </h3>
            {deliveries.map((delivery) => (
              <details
                key={delivery.id}
                className="rounded-xl border border-gray-200 bg-gray-50"
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className={textAlignClass}>
                      <div className="text-sm font-semibold text-gray-900">
                        {delivery.supplier_name ||
                          select("مورد غير محدد", "Unknown supplier")}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {delivery.entry_date
                          ? formatDateTime(
                              delivery.entry_date,
                              {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              },
                              languageTag,
                            )
                          : select("بدون تاريخ", "No date")}
                        {delivery.reference_code
                          ? ` | ${select("مرجع", "Ref")}: ${delivery.reference_code}`
                          : ""}
                      </div>
                    </div>
                    <div
                      className={`grid grid-cols-2 gap-2 text-xs sm:min-w-[220px] ${miniStatsAlignClass}`}
                    >
                      <SupplyMiniStat
                        label={select("الكمية", "Quantity")}
                        value={formatCount(delivery.quantity)}
                      />
                      <SupplyMiniStat
                        label={select("التكلفة", "Cost")}
                        value={formatMoney(delivery.total_cost)}
                      />
                    </div>
                  </div>
                </summary>
                <div className="border-t border-gray-200 bg-white p-4">
                  <div className="space-y-3">
                    {toArray(delivery.items).map((item, index) => (
                      <div
                        key={`${delivery.id}-${index}`}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {item.variant_title || item.product_name || "-"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {item.sku
                                ? `SKU: ${item.sku}`
                                : select("بدون SKU", "No SKU")}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-gray-800">
                            {formatMoney(item.total_cost)}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <SupplyInlineStat
                            label={select("القماش", "Fabric")}
                            value={
                              item.fabric_code
                                ? `${item.fabric_code} | ${item.fabric_name || item.material || "-"}`
                                : item.fabric_name || item.material || "-"
                            }
                          />
                          <SupplyInlineStat
                            label={select("مورد القماش", "Fabric Supplier")}
                            value={item.fabric_supplier_name || "-"}
                          />
                          <SupplyInlineStat
                            label={select("الكمية", "Quantity")}
                            value={formatCount(item.quantity)}
                          />
                          <SupplyInlineStat
                            label={select("الوصف", "Description")}
                            value={item.material || "-"}
                          />
                          <SupplyInlineStat
                            label={select("تكلفة الوحدة", "Unit Cost")}
                            value={formatMoney(item.unit_cost)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
          {select(
            "لا توجد حركات موردين مرتبطة بهذا المنتج حتى الآن.",
            "No supplier movements are linked to this product yet.",
          )}
        </div>
      )}
    </div>
  );
}

function SupplyMetric({ label, value }) {
  const { isRTL } = useLocale();

  return (
    <div
      className={`rounded-xl border border-sky-100 bg-sky-50 p-4 ${
        isRTL ? "text-right" : "text-left"
      }`}
    >
      <div className="text-xs font-medium text-sky-700">{label}</div>
      <div className="mt-2 text-lg font-bold text-sky-900">{value}</div>
    </div>
  );
}

function SupplyInlineStat({ label, value }) {
  const { isRTL } = useLocale();

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white px-3 py-2 ${
        isRTL ? "text-right" : "text-left"
      }`}
    >
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}

function SupplyMiniStat({ label, value }) {
  const { isRTL } = useLocale();

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white px-3 py-2 ${
        isRTL ? "text-right" : "text-left"
      }`}
    >
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
