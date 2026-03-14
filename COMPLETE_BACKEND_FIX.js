// ====================================
// إصلاح شامل للـ Backend - Shopify Sync Route
// Complete Backend Fix - Shopify Sync Route
// ====================================

// هذا الملف يحتوي على نسخة مصححة من sync route

// في backend/src/routes/shopify.js، استبدل الـ sync route بهذا الكود:

router.post(
  "/sync",
  verifyToken,
  requirePermission("can_manage_settings"),
  async (req, res) => {
    try {
      console.log("🔄 Starting Shopify sync process...");

      const userId = req.user.id;
      const requestedStoreId = getRequestedStoreId(req);
      const isAdmin = await resolveIsAdmin(req);

      console.log(
        `👤 User ID: ${userId}, Store ID: ${requestedStoreId}, Admin: ${isAdmin}`,
      );

      // Try to get token data with better error handling
      let tokenData;
      try {
        tokenData = await resolveSyncToken({
          userId,
          requestedStoreId,
          isAdmin,
        });
      } catch (tokenError) {
        console.error("❌ Error resolving sync token:", tokenError);
        return res.status(500).json({
          error: "Failed to resolve Shopify connection",
          details: tokenError.message,
        });
      }

      if (!tokenData) {
        console.log("❌ No Shopify token found");
        return res.status(400).json({
          error: "Shopify is not connected for this account/store.",
          code: "SHOPIFY_NOT_CONNECTED",
        });
      }

      console.log(`🏪 Found Shopify connection: ${tokenData.shop}`);

      const syncOwnerUserId = tokenData.user_id || userId;

      // Force store ID to ensure data linking
      let syncStoreId = requestedStoreId || tokenData.store_id;

      // If no store ID, use default store
      if (!syncStoreId) {
        syncStoreId = "59b47070-f018-4919-b628-1009af216fd7"; // Default store UUID
        console.log("🏪 Using default store ID for sync:", syncStoreId);
      }

      console.log(
        `🔄 Starting sync for user: ${syncOwnerUserId}, store: ${syncStoreId}`,
      );

      // Try to sync data with better error handling
      let syncResult;
      try {
        syncResult = await ShopifyService.syncAllData(
          syncOwnerUserId,
          tokenData.shop,
          tokenData.access_token,
          syncStoreId,
        );
      } catch (syncError) {
        console.error("❌ Shopify sync failed:", syncError);
        return res.status(500).json({
          error: "Failed to sync data from Shopify",
          details: syncError.message,
          shop: tokenData.shop,
        });
      }

      const { products, orders, customers } = syncResult;

      console.log(
        `✅ Sync completed: ${products?.length || 0} products, ${orders?.length || 0} orders, ${customers?.length || 0} customers`,
      );

      // Try webhook registration (optional, don't fail if it doesn't work)
      let webhookSync = null;
      try {
        webhookSync = await ensureWebhooksRegistered({
          shop: tokenData.shop,
          accessToken: tokenData.access_token,
          webhookAddress: getWebhookAddress(req),
        });
      } catch (webhookError) {
        console.error(
          "⚠️ Webhook registration failed (non-critical):",
          webhookError,
        );
        webhookSync = {
          error: "Webhook registration failed",
        };
      }

      // Get latest synced order
      const latestSyncedOrder =
        [...(orders || [])].sort(
          (a, b) =>
            parseTimestampValue(b?.updated_at) -
            parseTimestampValue(a?.updated_at),
        )[0] || null;

      const response = {
        success: true,
        message: "Data synced successfully",
        store_id: syncStoreId,
        webhook_sync: webhookSync,
        counts: {
          products: products?.length || 0,
          orders: orders?.length || 0,
          customers: customers?.length || 0,
        },
        latest_order: latestSyncedOrder
          ? {
              shopify_id: latestSyncedOrder.shopify_id || null,
              order_number: latestSyncedOrder.order_number || null,
              financial_status: latestSyncedOrder.status || null,
              created_at: latestSyncedOrder.created_at || null,
              updated_at: latestSyncedOrder.updated_at || null,
            }
          : null,
      };

      console.log("✅ Sync response:", response);
      res.json(response);
    } catch (error) {
      console.error("💥 Critical error in sync endpoint:", error);
      res.status(500).json({
        error: "Internal server error during sync",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  },
);

// ====================================
// تعليمات التطبيق:
// 1. انسخ الكود أعلاه
// 2. في backend/src/routes/shopify.js، ابحث عن router.post("/sync"
// 3. استبدل الـ sync route الحالي بالكود أعلاه
// 4. احفظ الملف
// 5. ارفع التحديثات على GitHub
// ====================================
