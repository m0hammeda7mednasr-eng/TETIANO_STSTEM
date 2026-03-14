import axios from "axios";
import { Product, Order, Customer } from "../models/index.js";

export class ShopifyService {
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
          inventory_quantity: firstVariant.inventory_quantity || 0,
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

      const [products, orders, customers] = await Promise.all([
        this.getProductsFromShopify(accessToken, shop),
        this.getOrdersFromShopify(accessToken, shop),
        this.getCustomersFromShopify(accessToken, shop),
      ]);
      console.log(
        `Fetched from Shopify: ${products.length} products, ${orders.length} orders, ${customers.length} customers.`,
      );

      const productsWithUser = products.map((p) => ({
        ...p,
        user_id: userId,
        store_id: storeId,
        updated_at: new Date().toISOString(),
      }));
      const ordersWithUser = orders.map((o) => ({
        ...o,
        user_id: userId,
        store_id: storeId,
        updated_at: new Date().toISOString(),
      }));
      const customersWithUser = customers.map((c) => ({
        ...c,
        user_id: userId,
        store_id: storeId,
        updated_at: new Date().toISOString(),
      }));

      console.log("Starting database update...");
      let syncResults = {
        products: [],
        orders: [],
        customers: [],
      };

      if (productsWithUser.length > 0) {
        console.log(`Syncing ${productsWithUser.length} products...`);
        const productResult = await Product.updateMultiple(productsWithUser);
        syncResults.products = productResult?.data || [];
        console.log(`Synced ${syncResults.products.length} products to DB.`);
      }

      if (ordersWithUser.length > 0) {
        console.log(`Syncing ${ordersWithUser.length} orders...`);
        const orderResult = await Order.updateMultiple(ordersWithUser);
        syncResults.orders = orderResult?.data || [];
        console.log(`Synced ${syncResults.orders.length} orders to DB.`);
      }

      if (customersWithUser.length > 0) {
        console.log(`Syncing ${customersWithUser.length} customers...`);
        const customerResult = await Customer.updateMultiple(customersWithUser);
        syncResults.customers = customerResult?.data || [];
        console.log(`Synced ${syncResults.customers.length} customers to DB.`);
      }

      console.log("Database update complete.");
      console.log(
        `Final sync results: ${syncResults.products.length} products, ${syncResults.orders.length} orders, ${syncResults.customers.length} customers`,
      );

      return {
        products: syncResults.products,
        orders: syncResults.orders,
        customers: syncResults.customers,
      };
    } catch (error) {
      console.error("Critical error during Shopify data sync:", error.message);
      console.error("Error details:", error);
      // Re-throw the error to ensure the calling function knows the sync failed
      throw error;
    }
  }
}
