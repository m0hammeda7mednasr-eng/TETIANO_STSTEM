import React, { useMemo, useState } from "react";
import { Loader, Save, X } from "lucide-react";

const CURRENCY_LABEL = "LE";

export default function ProductEditModal({
  product,
  onClose,
  onSave,
  canEditCost = false,
}) {
  const [price, setPrice] = useState(product.price || "");
  const [costPrice, setCostPrice] = useState(
    canEditCost ? product.cost_price || "" : "",
  );
  const [inventory, setInventory] = useState(product.inventory_quantity || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const profit = useMemo(() => {
    if (!canEditCost || !price || !costPrice) return "0.00";
    return (parseFloat(price) - parseFloat(costPrice)).toFixed(2);
  }, [canEditCost, price, costPrice]);

  const profitMargin = useMemo(() => {
    if (!canEditCost || !price || !costPrice || parseFloat(price) <= 0) {
      return "0.00";
    }
    return ((parseFloat(profit) / parseFloat(price)) * 100).toFixed(2);
  }, [canEditCost, price, costPrice, profit]);

  const handleSave = async () => {
    setLoading(true);
    setError("");

    try {
      const payload = {
        price: parseFloat(price),
        inventory: parseInt(inventory, 10),
      };

      if (canEditCost) {
        payload.cost_price = parseFloat(costPrice || 0);
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to update product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">Edit Product</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <p className="text-gray-900 font-semibold">{product.title}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price ({CURRENCY_LABEL})
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {canEditCost && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Price ({CURRENCY_LABEL})
              </label>
              <input
                type="number"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inventory
            </label>
            <input
              type="number"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              min="0"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>

          {canEditCost && price && costPrice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800 mb-2">
                Profit Preview
              </p>
              <div className="space-y-1 text-sm text-green-700">
                <div className="flex justify-between">
                  <span>Unit Profit:</span>
                  <span className="font-bold">
                    {profit} {CURRENCY_LABEL}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Profit Margin:</span>
                  <span className="font-bold">{profitMargin}%</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            <p className="font-semibold mb-1">Note:</p>
            <p>
              Changes are applied only after successful Shopify sync. If sync
              fails, no local change is kept.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
