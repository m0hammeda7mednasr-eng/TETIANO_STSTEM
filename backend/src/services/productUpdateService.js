import axios from "axios";
import { Product } from "../models/index.js";

const getShopifyTokenForStore = async (storeId, fallbackUserId) => {
  const { supabase } = await import("../supabaseClient.js");

  if (storeId) {
    const { data: tokenByStore } = await supabase
      .from("shopify_tokens")
      .select("*")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenByStore) {
      return tokenByStore;
    }
  }

  const { data: tokenByUser } = await supabase
    .from("shopify_tokens")
    .select("*")
    .eq("user_id", fallbackUserId)
    .single();

  return tokenByUser || null;
};

const parseNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSku = (value) => String(value ?? "").trim();

const hasOwn = (value, key) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);

const parseProductData = (value) => {
  if (!value) return {};

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value;
};

const cloneJsonValue = (value) => JSON.parse(JSON.stringify(value || {}));

const getProductVariants = (productData = {}) =>
  Array.isArray(productData?.variants) ? productData.variants : [];

const getTotalInventory = (variants = [], fallbackInventory = 0) => {
  if (!Array.isArray(variants) || variants.length === 0) {
    return parseNumeric(fallbackInventory);
  }

  return variants.reduce(
    (sum, variant) => sum + parseNumeric(variant?.inventory_quantity),
    0,
  );
};

const applyPrimaryVariantUpdates = (productData, updates = {}) => {
  const variants = getProductVariants(productData);
  if (variants.length === 0) {
    return productData;
  }

  const [firstVariant, ...restVariants] = variants;
  const updatedFirstVariant = { ...firstVariant };

  if (updates.price !== undefined) {
    updatedFirstVariant.price = updates.price?.toString();
  }

  if (updates.inventory_quantity !== undefined) {
    updatedFirstVariant.inventory_quantity = updates.inventory_quantity;
  }

  if (updates.sku !== undefined) {
    updatedFirstVariant.sku = normalizeSku(updates.sku);
  }

  updatedFirstVariant.updated_at = new Date().toISOString();

  return {
    ...productData,
    variants: [updatedFirstVariant, ...restVariants],
  };
};

const applyVariantUpdates = (productData, variantUpdates = []) => {
  const variants = getProductVariants(productData);
  if (variantUpdates.length === 0) {
    return productData;
  }

  if (variants.length === 0) {
    throw new Error("No variants found for this product.");
  }

  const updatesById = new Map(
    variantUpdates.map((variantUpdate) => [
      String(variantUpdate.id),
      variantUpdate,
    ]),
  );

  const seenVariantIds = new Set();
  const updatedVariants = variants.map((variant) => {
    const variantId = String(variant?.id || "");
    const requestedUpdate = updatesById.get(variantId);

    if (!requestedUpdate) {
      return variant;
    }

    seenVariantIds.add(variantId);

    const updatedVariant = {
      ...variant,
      updated_at: new Date().toISOString(),
    };

    if (requestedUpdate.inventory_quantity !== undefined) {
      updatedVariant.inventory_quantity = requestedUpdate.inventory_quantity;
    }
    if (requestedUpdate.price !== undefined) {
      updatedVariant.price = requestedUpdate.price?.toString();
    }
    if (requestedUpdate.sku !== undefined) {
      updatedVariant.sku = normalizeSku(requestedUpdate.sku);
    }

    return updatedVariant;
  });

  for (const variantUpdate of variantUpdates) {
    const variantId = String(variantUpdate.id || "");
    if (!seenVariantIds.has(variantId)) {
      throw new Error(`Variant ${variantId} was not found for this product.`);
    }
  }

  return {
    ...productData,
    variants: updatedVariants,
  };
};

export class ProductUpdateService {
  /**
   * Update product (price, cost_price, inventory, sku) locally and sync with Shopify
   */
  static async updateProduct(userId, productId, updates) {
    const { price, cost_price, inventory, sku } = updates;
    const variantUpdates = Array.isArray(updates?.variant_updates)
      ? updates.variant_updates
      : [];

    // Validation
    if (price !== undefined) {
      if (!Number.isFinite(price)) throw new Error("Price is invalid");
      if (price < 0) throw new Error("Price cannot be negative");
      if (price > 1000000)
        throw new Error("Price exceeds maximum allowed value");
    }
    if (cost_price !== undefined) {
      if (!Number.isFinite(cost_price))
        throw new Error("Cost price is invalid");
      if (cost_price < 0) throw new Error("Cost price cannot be negative");
      if (cost_price > 1000000)
        throw new Error("Cost price exceeds maximum allowed value");
    }
    if (inventory !== undefined) {
      if (!Number.isFinite(inventory)) throw new Error("Inventory is invalid");
      if (inventory < 0) throw new Error("Inventory cannot be negative");
      if (inventory > 1000000)
        throw new Error("Inventory exceeds maximum allowed value");
    }
    if (sku !== undefined && normalizeSku(sku).length > 255) {
      throw new Error("SKU exceeds maximum allowed length");
    }
    for (const variantUpdate of variantUpdates) {
      if (!variantUpdate?.id) {
        throw new Error("Variant ID is required");
      }
      if (
        variantUpdate?.inventory_quantity === undefined &&
        variantUpdate?.price === undefined &&
        variantUpdate?.sku === undefined
      ) {
        throw new Error("Variant update must include inventory, price, or SKU");
      }

      const inventoryQuantity = variantUpdate?.inventory_quantity;
      if (inventoryQuantity !== undefined) {
        if (!Number.isFinite(inventoryQuantity)) {
          throw new Error("Variant inventory is invalid");
        }
        if (inventoryQuantity < 0) {
          throw new Error("Variant inventory cannot be negative");
        }
        if (inventoryQuantity > 1000000) {
          throw new Error("Variant inventory exceeds maximum allowed value");
        }
      }

      const variantPrice = variantUpdate?.price;
      if (variantPrice !== undefined) {
        if (!Number.isFinite(variantPrice)) {
          throw new Error("Variant price is invalid");
        }
        if (variantPrice < 0) {
          throw new Error("Variant price cannot be negative");
        }
        if (variantPrice > 1000000) {
          throw new Error("Variant price exceeds maximum allowed value");
        }
      }

      if (
        variantUpdate?.sku !== undefined &&
        normalizeSku(variantUpdate.sku).length > 255
      ) {
        throw new Error("Variant SKU exceeds maximum allowed length");
      }
    }

    try {
      // Get current product
      const { data: product, error } = await Product.findByIdForUser(
        userId,
        productId,
      );
      if (error || !product) {
        throw new Error("Product not found");
      }

      const currentProductData = parseProductData(product.data);
      let nextProductData = cloneJsonValue(currentProductData);

      // Build update object
      const updateData = {
        pending_sync: true,
        local_updated_at: new Date().toISOString(),
      };

      const oldValues = {};
      if (price !== undefined) {
        updateData.price = price;
        oldValues.price = product.price;
      }
      if (sku !== undefined) {
        updateData.sku = normalizeSku(sku);
        oldValues.sku = product.sku;
      }
      if (cost_price !== undefined) {
        updateData.cost_price = cost_price;
        oldValues.cost_price = product.cost_price;
      }
      if (inventory !== undefined || variantUpdates.length > 0) {
        oldValues.inventory_quantity = product.inventory_quantity;
      }
      if (variantUpdates.length > 0) {
        if (!hasOwn(oldValues, "price")) {
          oldValues.price = product.price;
        }
        if (!hasOwn(oldValues, "sku")) {
          oldValues.sku = product.sku;
        }
      }

      if (price !== undefined || inventory !== undefined || sku !== undefined) {
        nextProductData = applyPrimaryVariantUpdates(nextProductData, {
          price,
          inventory_quantity: inventory,
          sku,
        });
      }

      if (variantUpdates.length > 0) {
        nextProductData = applyVariantUpdates(
          nextProductData,
          variantUpdates,
        );
      }

      const hasVariantBackedData = getProductVariants(nextProductData).length > 0;
      const primaryVariant = hasVariantBackedData
        ? getProductVariants(nextProductData)[0] || null
        : null;
      if (
        price !== undefined ||
        inventory !== undefined ||
        sku !== undefined ||
        variantUpdates.length > 0
      ) {
        oldValues.data = cloneJsonValue(currentProductData);
        updateData.data = nextProductData;
      }

      if (primaryVariant) {
        if (price !== undefined || variantUpdates.length > 0) {
          updateData.price =
            primaryVariant.price !== undefined &&
            primaryVariant.price !== null &&
            String(primaryVariant.price).trim() !== ""
              ? parseNumeric(primaryVariant.price)
              : product.price;
        }
        if (sku !== undefined || variantUpdates.length > 0) {
          updateData.sku = normalizeSku(primaryVariant.sku);
        }
      }

      if (inventory !== undefined || variantUpdates.length > 0) {
        updateData.inventory_quantity = hasVariantBackedData
          ? getTotalInventory(getProductVariants(nextProductData), inventory)
          : inventory;
      }

      // Update locally
      const { error: updateError } = await Product.update(
        productId,
        updateData,
      );
      if (updateError) {
        throw updateError;
      }

      // Log operation
      this.logActivity(userId, 'product_update', productId, product.title, { updates, old_values: oldValues });
      await this.logSyncOperation(userId, productId, "product_update", {
        updates,
        old_values: oldValues,
      });

      // Sync to Shopify asynchronously (only price, inventory, and sku; not cost_price)
      const shopifyUpdates = {};
      if (price !== undefined) shopifyUpdates.price = price;
      if (inventory !== undefined)
        shopifyUpdates.inventory_quantity = inventory;
      if (sku !== undefined) {
        shopifyUpdates.sku = normalizeSku(sku);
      }
      if (variantUpdates.length > 0) {
        shopifyUpdates.variant_updates = variantUpdates;
      }

      if (Object.keys(shopifyUpdates).length > 0) {
        try {
          await this.syncToShopify(userId, productId, shopifyUpdates);
        } catch (syncError) {
          const rollbackData = {
            pending_sync: false,
            sync_error: syncError.message,
            local_updated_at: new Date().toISOString(),
          };

          if (Object.prototype.hasOwnProperty.call(oldValues, "price")) {
            rollbackData.price = oldValues.price;
          }
          if (Object.prototype.hasOwnProperty.call(oldValues, "cost_price")) {
            rollbackData.cost_price = oldValues.cost_price;
          }
          if (Object.prototype.hasOwnProperty.call(oldValues, "inventory_quantity")) {
            rollbackData.inventory_quantity = oldValues.inventory_quantity;
          }
          if (Object.prototype.hasOwnProperty.call(oldValues, "sku")) {
            rollbackData.sku = oldValues.sku;
          }
          if (Object.prototype.hasOwnProperty.call(oldValues, "data")) {
            rollbackData.data = oldValues.data;
          }

          const { error: rollbackError } = await Product.update(
            productId,
            rollbackData,
          );
          if (rollbackError) {
            console.error("Rollback failed after Shopify sync failure:", rollbackError);
          }
          throw new Error(
            `Shopify sync failed. Local changes were reverted: ${syncError.message}`,
          );
        }
      }

      return {
        success: true,
        localUpdate: true,
        shopifySync:
          Object.keys(shopifyUpdates).length > 0 ? "synced" : "not_needed",
      };
    } catch (error) {
      console.error("Update product error:", error);
      throw error;
    }
  }

  /**
   * Update product price locally and sync with Shopify
   */
  static async updatePrice(userId, productId, newPrice) {
    // Validation
    if (newPrice < 0) {
      throw new Error("Price cannot be negative");
    }
    if (newPrice > 1000000) {
      throw new Error("Price exceeds maximum allowed value");
    }

    return this.updateProduct(userId, productId, { price: newPrice });
  }

  /**
   * Update product inventory locally and sync with Shopify
   */
  static async updateInventory(userId, productId, newQuantity) {
    // Validation
    if (newQuantity < 0) {
      throw new Error("Inventory cannot be negative");
    }
    if (newQuantity > 1000000) {
      throw new Error("Inventory exceeds maximum allowed value");
    }

    return this.updateProduct(userId, productId, { inventory: newQuantity });
  }

  /**
   * Sync product updates to Shopify
   */
  static async syncToShopify(userId, productId, updates) {
    try {
      // Get product and Shopify token
      const { data: product } = await Product.findByIdForUser(userId, productId);
      if (!product || !product.shopify_id) {
        throw new Error("Product not found or missing Shopify ID");
      }

      const tokenData = await getShopifyTokenForStore(product.store_id, userId);

      if (!tokenData) {
        throw new Error("Shopify not connected");
      }

      // Build Shopify API payload
      const parsedProductData =
        parseProductData(product.data);

      let variantPayloads = [];

      if (Array.isArray(updates.variant_updates) && updates.variant_updates.length > 0) {
        const variants = getProductVariants(parsedProductData);
        variantPayloads = updates.variant_updates.map((variantUpdate) => {
          const matchingVariant = variants.find(
            (variant) =>
              String(variant?.id || "") === String(variantUpdate?.id || ""),
          );

          if (!matchingVariant?.id) {
            throw new Error(
              `Variant ${variantUpdate?.id || ""} was not found for this product.`,
            );
          }

          const payload = {
            id: parseInt(matchingVariant.id, 10),
          };

          if (variantUpdate.inventory_quantity !== undefined) {
            payload.inventory_quantity = variantUpdate.inventory_quantity;
          }
          if (variantUpdate.price !== undefined) {
            payload.price = variantUpdate.price?.toString();
          }
          if (variantUpdate.sku !== undefined) {
            payload.sku = normalizeSku(variantUpdate.sku);
          }

          return payload;
        });
      } else {
        const variant_id = parsedProductData?.variants?.[0]?.id;
        if (!variant_id) {
          throw new Error("Variant ID not found for this product.");
        }

        const variantPayload = {
          id: parseInt(variant_id, 10),
        };
        if (updates.price !== undefined) {
          variantPayload.price = updates.price?.toString();
        }
        if (updates.inventory_quantity !== undefined) {
          variantPayload.inventory_quantity = updates.inventory_quantity;
        }
        if (updates.sku !== undefined) {
          variantPayload.sku = normalizeSku(updates.sku);
        }

        variantPayloads = [variantPayload];
      }

      const shopifyPayload = {
        product: {
          id: parseInt(product.shopify_id),
          variants: variantPayloads,
        },
      };

      // Send to Shopify
      const response = await axios.put(
        `https://${tokenData.shop}/admin/api/2024-01/products/${product.shopify_id}.json`,
        shopifyPayload,
        {
          headers: {
            "X-Shopify-Access-Token": tokenData.access_token,
            "Content-Type": "application/json",
          },
        },
      );

      // Update sync status
      const syncedProductData = response.data?.product || parsedProductData;
      const syncedVariants = getProductVariants(syncedProductData);
      const syncedPrimaryVariant = syncedVariants[0] || {};
      const requestedPrimaryVariantUpdate = Array.isArray(updates.variant_updates)
        ? updates.variant_updates.find(
            (variantUpdate) =>
              String(variantUpdate?.id || "") ===
              String(syncedPrimaryVariant?.id || parsedProductData?.variants?.[0]?.id || ""),
          ) || null
        : null;
      const resolvedPrimaryPrice =
        syncedPrimaryVariant.price !== undefined &&
        syncedPrimaryVariant.price !== null &&
        String(syncedPrimaryVariant.price).trim() !== ""
          ? parseNumeric(syncedPrimaryVariant.price)
          : requestedPrimaryVariantUpdate?.price !== undefined
            ? requestedPrimaryVariantUpdate.price
            : updates.price !== undefined
              ? updates.price
              : product.price;
      const resolvedPrimarySku = hasOwn(syncedPrimaryVariant, "sku")
        ? normalizeSku(syncedPrimaryVariant.sku)
        : requestedPrimaryVariantUpdate && hasOwn(requestedPrimaryVariantUpdate, "sku")
          ? normalizeSku(requestedPrimaryVariantUpdate.sku)
          : updates.sku !== undefined
            ? normalizeSku(updates.sku)
            : normalizeSku(product.sku);

      await Product.update(productId, {
        pending_sync: false,
        last_synced_at: new Date().toISOString(),
        shopify_updated_at: response.data.product.updated_at,
        sync_error: null,
        data: syncedProductData,
        inventory_quantity: getTotalInventory(
          syncedVariants,
          product.inventory_quantity,
        ),
        price: resolvedPrimaryPrice,
        sku: resolvedPrimarySku,
      });

      // Update sync operation log
      await this.updateSyncOperationStatus(
        userId,
        productId,
        "success",
        response.data,
      );

      console.log(`Product ${productId} synced successfully to Shopify`);
      return { success: true };
    } catch (error) {
      console.error("Shopify sync error:", error);

      // Save error
      await Product.update(productId, {
        pending_sync: true,
        sync_error: error.message,
      });

      // Update sync operation log
      await this.updateSyncOperationStatus(
        userId,
        productId,
        "failed",
        null,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Log sync operation
   */
  static async logSyncOperation(userId, entityId, operationType, requestData) {
    try {
      const { supabase } = await import("../supabaseClient.js");
      await supabase.from("sync_operations").insert([
        {
          user_id: userId,
          operation_type: operationType,
          entity_type: "product",
          entity_id: entityId,
          direction: "to_shopify",
          status: "pending",
          request_data: requestData,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Failed to log sync operation:", error);
    }
  }

  /**
   * Update sync operation status
   */
  static async updateSyncOperationStatus(
    userId,
    entityId,
    status,
    responseData = null,
    errorMessage = null,
  ) {
    try {
      const { supabase } = await import("../supabaseClient.js");

      // Find the most recent pending operation
      const { data: operations } = await supabase
        .from("sync_operations")
        .select("*")
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      if (operations && operations.length > 0) {
        await supabase
          .from("sync_operations")
          .update({
            status,
            response_data: responseData,
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", operations[0].id);
      }
    } catch (error) {
      console.error("Failed to update sync operation status:", error);
    }
  }

  static async logActivity(userId, action, entityId, entityName, details) {
    try {
      const { supabase } = await import("../supabaseClient.js");
      await supabase.from("activity_log").insert([
        {
          user_id: userId,
          action: action,
          entity_type: "product",
          entity_id: entityId,
          entity_name: entityName,
          details: details,
        },
      ]);
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }
}
