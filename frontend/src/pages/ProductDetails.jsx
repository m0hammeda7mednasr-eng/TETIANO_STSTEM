import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  Image as ImageIcon,
} from "lucide-react";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";

const CURRENCY_LABEL = "LE";
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cloneVariantDrafts = (variants = []) =>
  variants.map((variant) => ({
    id: String(variant.id || ""),
    inventory_quantity: String(toNumber(variant.inventory_quantity)),
  }));

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const canEditProducts = hasPermission("can_edit_products");
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Editable fields
  const [editedProduct, setEditedProduct] = useState({});
  const [editedVariants, setEditedVariants] = useState([]);

  const hasMultipleVariants = (product?.variants?.length || 0) > 1;
  const editedVariantsById = useMemo(
    () =>
      new Map(
        editedVariants.map((variant) => [String(variant.id), variant]),
      ),
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
  }, [editedProduct.inventory_quantity, editedVariants, editing, hasMultipleVariants, product]);

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
  }, [id]);

  useEffect(() => {
    fetchProductDetails();
  }, [id, fetchProductDetails]);

  const handleSave = async () => {
    if (!canEditProducts) return;
    setSaving(true);
    try {
      const payload = {};
      const nextPrice = parseFloat(editedProduct.price);
      const nextInventory = parseInt(editedProduct.inventory_quantity, 10);

      if (
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
      }

      const originalVariantInventoryById = new Map(
        (product.variants || []).map((variant) => [
          String(variant.id || ""),
          toNumber(variant.inventory_quantity),
        ]),
      );

      const variantUpdates = editedVariants
        .filter((variant) => {
          const variantId = String(variant.id || "");
          return (
            originalVariantInventoryById.has(variantId) &&
            toNumber(variant.inventory_quantity) !==
              originalVariantInventoryById.get(variantId)
          );
        })
        .map((variant) => ({
          id: variant.id,
          inventory_quantity: toNumber(variant.inventory_quantity),
        }));

      if (variantUpdates.length > 0) {
        payload.variant_updates = variantUpdates;
      }

      if (Object.keys(payload).length === 0) {
        showNotification("لا توجد تغييرات للحفظ", "info");
        setSaving(false);
        return;
      }

      await api.post(`/shopify/products/${id}/update`, payload);

      showNotification(
        "تم الحفظ بنجاح، جاري المزامنة مع Shopify...",
        "success",
      );
      setEditing(false);

      // Refresh after a delay
      setTimeout(() => {
        fetchProductDetails();
      }, 2000);
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

  const handleVariantInventoryChange = (variantId, value) => {
    setEditedVariants((currentVariants) =>
      currentVariants.map((variant) =>
        String(variant.id) === String(variantId)
          ? {
              ...variant,
              inventory_quantity: value,
            }
          : variant,
      ),
    );
  };

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
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

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
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
      <div className="flex h-screen bg-gray-100">
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
    <div className="flex h-screen bg-gray-100">
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
                className="p-2 hover:bg-gray-200 rounded-lg transition"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-800">
                    {product.title}
                  </h1>
                  {getSyncStatusIcon()}
                </div>
                <p className="text-gray-600">
                  تم الإنشاء في {formatDate(product.created_at)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {canEditProducts &&
                (editing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <X size={16} />
                      إلغاء
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
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
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
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
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  صورة المنتج
                </h2>
                <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
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
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    الوصف
                  </h2>
                  <div
                    className="prose max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: product.body_html }}
                  />
                </div>
              )}

              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    الأشكال ({product.variants.length})
                  </h2>
                  {hasMultipleVariants && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      تحكم في مخزون كل Variant من هنا، وإجمالي المخزون بيتحدث
                      من مجموع كل الفاريانتس.
                    </div>
                  )}
                  <div className="space-y-3">
                    {product.variants.map((variant, index) => (
                      <div
                        key={index}
                        className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800">
                              {variant.title}
                            </p>
                            {variant.sku && (
                              <p className="text-sm text-gray-600">
                                SKU: {variant.sku}
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
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {variant.option1}
                                </span>
                              )}
                              {variant.option2 && (
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {variant.option2}
                                </span>
                              )}
                              {variant.option3 && (
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {variant.option3}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="text-lg font-bold text-gray-800">
                              {variant.price} {CURRENCY_LABEL}
                            </p>
                            {variant.compare_at_price &&
                              parseFloat(variant.compare_at_price) >
                                parseFloat(variant.price) && (
                                <p className="text-sm text-gray-500 line-through">
                                  {variant.compare_at_price} {CURRENCY_LABEL}
                                </p>
                              )}
                            <p
                              className={`text-sm ${
                                toNumber(
                                  editing
                                    ? editedVariantsById.get(
                                        String(variant.id || ""),
                                      )?.inventory_quantity ??
                                        variant.inventory_quantity
                                    : variant.inventory_quantity,
                                ) > 10
                                  ? "text-green-600"
                                  : toNumber(
                                        editing
                                          ? editedVariantsById.get(
                                              String(variant.id || ""),
                                            )?.inventory_quantity ??
                                              variant.inventory_quantity
                                          : variant.inventory_quantity,
                                      ) > 0
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }`}
                            >
                              المخزون:{" "}
                              {toNumber(
                                editing
                                  ? editedVariantsById.get(
                                      String(variant.id || ""),
                                    )?.inventory_quantity ??
                                      variant.inventory_quantity
                                  : variant.inventory_quantity,
                              )}
                            </p>
                            {editing && canEditProducts && hasMultipleVariants && (
                              <div className="mt-3">
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
                                    String(toNumber(variant.inventory_quantity))
                                  }
                                  onChange={(event) =>
                                    handleVariantInventoryChange(
                                      variant.id,
                                      event.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
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
                    ))}
                  </div>
                </div>
              )}

              {/* Product Images Gallery */}
              {product.images && product.images.length > 1 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    معرض الصور ({product.images.length})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {product.images.map((image, index) => (
                      <div
                        key={index}
                        className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden hover:shadow-lg transition"
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
                <div className="bg-white rounded-lg shadow p-6">
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
                <div className="bg-white rounded-lg shadow p-6">
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
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  السعر والمخزون
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      السعر ({CURRENCY_LABEL})
                    </label>
                    {editing ? (
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-2xl font-bold text-gray-800">
                        {product.price} {CURRENCY_LABEL}
                      </p>
                    )}
                  </div>

                  {isAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        سعر التكلفة ({CURRENCY_LABEL})
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-2xl font-bold text-gray-800">
                          {product.cost_price || 0} {CURRENCY_LABEL}
                        </p>
                      )}
                    </div>
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
                              parseFloat(product.cost_price)
                            ).toFixed(2)}{" "}
                            {CURRENCY_LABEL}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-green-800">
                            هامش الربح:
                          </span>
                          <span className="text-lg font-bold text-green-900">
                            {(
                              ((parseFloat(product.price) -
                                parseFloat(product.cost_price)) /
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
                                  parseFloat(product.cost_price)) *
                                displayedInventoryQuantity
                              ).toFixed(2)}{" "}
                              {CURRENCY_LABEL}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  معلومات المنتج
                </h2>
                <div className="space-y-3">
                  {product.vendor && (
                    <div>
                      <p className="text-sm text-gray-600">المورد</p>
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
                  {product.sku && (
                    <div>
                      <p className="text-sm text-gray-600">SKU</p>
                      <p className="font-semibold text-gray-800">
                        {product.sku}
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
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    نطاق السعر
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">أقل سعر</p>
                      <p className="text-xl font-bold text-gray-800">
                        {product.price_min} {CURRENCY_LABEL}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">أعلى سعر</p>
                      <p className="text-xl font-bold text-gray-800">
                        {product.price_max} {CURRENCY_LABEL}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sale Information */}
              {product.on_sale && product.compare_at_price_min && (
                <div className="bg-white rounded-lg shadow p-6">
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
                        {product.compare_at_price_min}{" "}
                        {CURRENCY_LABEL}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">السعر بعد التخفيض</p>
                      <p className="text-xl font-bold text-red-600">
                        {product.price_min} {CURRENCY_LABEL}
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
                <div className="bg-white rounded-lg shadow p-6">
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
              <div className="bg-white rounded-lg shadow p-6">
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
                <div className="bg-white rounded-lg shadow p-6">
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
              <div className="bg-white rounded-lg shadow p-6">
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
    </div>
  );
}
