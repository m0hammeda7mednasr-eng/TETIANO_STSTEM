import axios from "axios";
import { Product, Order, Customer } from "../models/index.js";

export class ShopifyService {
  static #getProductVariants(product = {}) {
    return Array.isArray(product?.variants) ? product.variants : [];
  }

  static #getTotalInventory(product = {}) {
    const variants = this.#getProductVariants(product);
    if (variants.length === 0) {
      return 0;
    }

    return variants.reduce((sum, variant) => {
      const quantity = Number(variant?.inventory_quantity);
      return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);
  }

  static #getLatestOrder(rows = []) {
    return rows.reduce((latest, current) => {
      if (!latest) {
        return current || null;
      }

      const latestUpdatedAt = Date.parse(latest?.updated_at || "");
      const currentUpdatedAt = Date.parse(current?.updated_at || "");

      if (Number.isNaN(currentUpdatedAt)) {
        return latest;
      }

      if (Number.isNaN(latestUpdatedAt)) {
        return current;
      }

      return currentUpdatedAt > latestUpdatedAt ? current : latest;
    }, null);
  }

  static async #syncEntity({
    entityLabel,
    fetcher,
    updater,
    userId,
    storeId,
  }) {
    const fetchedRows = await fetcher();
    const rowsWithScope = fetchedRows.map((row) => ({
      ...row,
      user_id: userId,
      store_id: storeId,
      updated_at: new Date().toISOString(),
    }));

    let persistedCount = 0;
    if (rowsWithScope.length > 0) {
      console.log(`Syncing ${rowsWithScope.length} ${entityLabel}...`);
      const result = await updater(rowsWithScope);
      if (result?.error) {
        throw new Error(
          `Failed to persist Shopify ${entityLabel}: ${result.error.message}`,
        );
      }
      persistedCount = result?.data?.length || 0;
      console.log(
        `Synced ${rowsWithScope.length} ${entityLabel} to DB. Persisted rows returned: ${persistedCount}`,
      );
    }

    return {
      fetchedCount: fetchedRows.length,
      persistedCount,
      latestRow:
        entityLabel === "orders" ? this.#getLatestOrder(fetchedRows) : null,
    };
  }

  // Generic helper to handle Shopify's cursor-based pagination
  static async #fetchAllPages(initialUrl, accessToken) {
    let results = [];
    let url = initialUrl;
    console.log(`Starting Shopify data fetch from: ${url}`);

    while (url) {
      try {
        const response = await axios.get(url, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });

        const responseDataKey = Object.keys(response.data)[0];
        if (response.data && response.data[responseDataKey]) {
          const newItems = response.data[responseDataKey];
          results = results.concat(newItems);
          console.log(
            `Fetched ${newItems.length} items from ${url}. Total items so far: ${results.length}`,
          );
        } else {
          console.warn(
            `No data found for key '${responseDataKey}' in response from ${url}`,
          );
        }

        const linkHeader = response.headers.link;
        url = null; // Assume we are done unless we find a 'next' link

        if (linkHeader) {
          const nextLinkMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextLinkMatch) {
            url = nextLinkMatch[1];
            console.log(`Found next page URL: ${url}`);
          } else {
            console.log(
              "No 'next' page link found in header. Concluding fetch.",
            );
          }
        } else {
          console.log("No 'Link' header found. Concluding fetch.");
        }
      } catch (error) {
        console.error(
          `Error fetching page ${url}:`,
          error.response ? error.response.data : error.message,
        );
        throw new Error(`Failed to fetch data from Shopify page: ${url}`);
      }
    }
    console.log(
      `Finished Shopify data fetch. Total items retrieved: ${results.length}`,
    );
    return results;
  }

  static async getProductsFromShopify(accessToken, shop) {
    try {
      console.log(
        `🔍 Fetching products from: https://${shop}/admin/api/2024-01/products.json`,
      );
      const url = `https://${shop}/admin/api/2024-01/products.json?limit=250`;
      const allProducts = await this.#fetchAllPages(url, accessToken);
      console.log(
        `✅ Successfully fetched ${allProducts.length} products from Shopify`,
      );

      return allProducts.map((product) => {
        // Extract cost price from variant (if available in Shopify)
        const firstVariant = product.variants[0] || {};
        const costPrice = firstVariant.cost || firstVariant.cost_price || 0;
        const totalInventory = this.#getTotalInventory(product);

        return {
          shopify_id: product.id.toString(),
          title: product.title,
          description: product.body_html,
          vendor: product.vendor,
          product_type: product.product_type,
          image_url: product.image?.src || "",
          price: firstVariant.price || 0,
          cost_price: costPrice, // Extract cost price from Shopify
          currency: "USD",
          sku: firstVariant.sku || "",
          inventory_quantity: totalInventory,
          created_at: product.created_at,
          updated_at: product.updated_at,
          data: product,
        };
      });
    } catch (error) {
      console.error(
        "❌ Error processing products from Shopify:",
        error.message,
      );
      console.error("Error details:", error.response?.data || error);
      throw error;
    }
  }

  static async getOrdersFromShopify(accessToken, shop, options = {}) {
    try {
      console.log(
        `🔍 Fetching orders from: https://${shop}/admin/api/2024-01/orders.json`,
      );
      const query = new URLSearchParams({
        limit: "250",
        status: "any",
      });
      const updatedAtMin = String(options?.updatedAtMin || "").trim();
      if (updatedAtMin) {
        query.set("updated_at_min", updatedAtMin);
      }
      const url = `https://${shop}/admin/api/2024-01/orders.json?${query.toString()}`;
      const allOrders = await this.#fetchAllPages(url, accessToken);
      console.log(
        `✅ Successfully fetched ${allOrders.length} orders from Shopify`,
      );

      return allOrders.map((order) => ({
        shopify_id: order.id.toString(),
        order_number: order.order_number,
        customer_name:
          `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
        customer_email: order.customer?.email || "",
        total_price: order.total_price,
        subtotal_price: order.subtotal_price,
        total_tax: order.total_tax,
        total_discounts: order.total_discounts,
        currency: order.currency,
        status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        items_count: order.line_items.length,
        created_at: order.created_at,
        updated_at: order.updated_at,
        data: order,
      }));
    } catch (error) {
      console.error("❌ Error processing orders from Shopify:", error.message);
      console.error("Error details:", error.response?.data || error);
      throw error;
    }
  }

  static async syncRecentOrders(
    userId,
    shop,
    accessToken,
    storeId,
    options = {},
  ) {
    try {
      const orders = await this.getOrdersFromShopify(accessToken, shop, {
        updatedAtMin: options?.updatedAtMin,
      });
      const ordersWithUser = orders.map((order) => ({
        ...order,
        user_id: userId,
        store_id: storeId,
      }));

      if (ordersWithUser.length > 0) {
        await Order.updateMultiple(ordersWithUser);
      }

      return {
        orders,
        synced_count: ordersWithUser.length,
      };
    } catch (error) {
      console.error("Error syncing recent Shopify orders:", error.message);
      throw error;
    }
  }

  static async getCustomersFromShopify(accessToken, shop) {
    try {
      console.log(
        `🔍 Fetching customers from: https://${shop}/admin/api/2024-01/customers.json`,
      );
      const url = `https://${shop}/admin/api/2024-01/customers.json?limit=250`;
      const allCustomers = await this.#fetchAllPages(url, accessToken);
      console.log(
        `✅ Successfully fetched ${allCustomers.length} customers from Shopify`,
      );

      return allCustomers.map((customer) => ({
        shopify_id: customer.id.toString(),
        name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        email: customer.email,
        phone: customer.phone || "",
        total_spent: customer.total_spent,
        orders_count: customer.orders_count,
        default_address: customer.default_address?.address1 || "",
        city: customer.default_address?.city || "",
        country: customer.default_address?.country || "",
        created_at: customer.created_at,
        updated_at: customer.updated_at,
        data: customer,
      }));
    } catch (error) {
      console.error(
        "❌ Error processing customers from Shopify:",
        error.message,
      );
      console.error("Error details:", error.response?.data || error);
      throw error;
    }
  }

  static async syncAllData(userId, shop, accessToken, storeId) {
    try {
      console.log("Starting Shopify sync process...");
      console.log(
        `Syncing for user: ${userId}, shop: ${shop}, store: ${storeId}`,
      );

      // Test Shopify connection first
      console.log("Testing Shopify connection...");
      const testUrl = `https://${shop}/admin/api/2024-01/products.json?limit=1`;
      try {
        const testResponse = await axios.get(testUrl, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });
        console.log("✅ Shopify connection test successful");
      } catch (testError) {
        console.error(
          "❌ Shopify connection test failed:",
          testError.response?.data || testError.message,
        );
        throw new Error(
          `Shopify connection failed: ${testError.response?.data?.errors || testError.message}`,
        );
      }

      console.log("Starting database update...");
      const syncResults = {
        counts: {
          products: 0,
          orders: 0,
          customers: 0,
        },
        persisted: {
          products: 0,
          orders: 0,
          customers: 0,
        },
        latestOrder: null,
      };

      const productSync = await this.#syncEntity({
        entityLabel: "products",
        fetcher: () => this.getProductsFromShopify(accessToken, shop),
        updater: (rows) => Product.updateMultiple(rows),
        userId,
        storeId,
      });
      syncResults.counts.products = productSync.fetchedCount;
      syncResults.persisted.products = productSync.persistedCount;

      const orderSync = await this.#syncEntity({
        entityLabel: "orders",
        fetcher: () => this.getOrdersFromShopify(accessToken, shop),
        updater: (rows) => Order.updateMultiple(rows),
        userId,
        storeId,
      });
      syncResults.counts.orders = orderSync.fetchedCount;
      syncResults.persisted.orders = orderSync.persistedCount;
      syncResults.latestOrder = orderSync.latestRow;

      const customerSync = await this.#syncEntity({
        entityLabel: "customers",
        fetcher: () => this.getCustomersFromShopify(accessToken, shop),
        updater: (rows) => Customer.updateMultiple(rows),
        userId,
        storeId,
      });
      syncResults.counts.customers = customerSync.fetchedCount;
      syncResults.persisted.customers = customerSync.persistedCount;

      console.log("Database update complete.");
      console.log(
        `Final sync results: ${syncResults.counts.products} products, ${syncResults.counts.orders} orders, ${syncResults.counts.customers} customers`,
      );

      return syncResults;
    } catch (error) {
      console.error("Critical error during Shopify data sync:", error.message);
      console.error("Error details:", error);
      // Re-throw the error to ensure the calling function knows the sync failed
      throw error;
    }
  }
}
