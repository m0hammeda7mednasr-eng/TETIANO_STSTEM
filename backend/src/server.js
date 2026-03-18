import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
// import { createClient } from "@supabase/supabase-js"; // Not used directly here
import authRoutes from "./routes/auth.js";
import shopifyRoutes from "./routes/shopify.js";
import dashboardRoutes from "./routes/dashboard.js";
import usersRoutes from "./routes/users.js";
import reportsRoutes from "./routes/reports.js";
import dailyReportsRoutes from "./routes/dailyReports.js";
import accessRequestsRoutes from "./routes/accessRequests.js";
import tasksRoutes from "./routes/tasks.js";
import activityLogRoutes from "./routes/activityLog.js";
import operationalCostsRoutes from "./routes/operationalCosts.js";
import adminRoutes from "./routes/admin.js";
import orderCommentsRoutes from "./routes/orderComments.js";
import notificationsRoutes from "./routes/notifications.js";
import shopifyWebhooksRoutes from "./routes/shopifyWebhooks.js";
import eventsRoutes from "./routes/events.js";
import warehouseRoutes from "./routes/warehouse.js";
import productAnalysisRoutes from "./routes/productAnalysis.js";
import suppliersRoutes from "./routes/suppliers.js";
import { supabase } from "./supabaseClient.js";
import { setRlsContext } from "./middleware/rls.js";
import { emitRealtimeEvent } from "./services/realtimeEventService.js";
import { startShopifyBackgroundSync } from "./services/shopifyBackgroundSyncService.js";

const app = express();
const PORT = process.env.PORT || 5000;
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const isDevelopment = process.env.NODE_ENV === "development";

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      process.env.FRONTEND_URL,
      "https://tetiano.me",
      "https://www.tetiano.me",
      // Vercel domains
      /^https:\/\/.*\.vercel\.app$/,
      // Railway domains (for testing)
      /^https:\/\/.*\.railway\.app$/,
    ].filter(Boolean),
    credentials: true,
  }),
);
app.use(
  "/api/shopify/webhooks",
  express.raw({ type: "application/json" }),
  shopifyWebhooksRoutes,
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Export supabase for any legacy imports, but it's now initialized elsewhere
export { supabase };

// Routes
app.use("/api/auth", authRoutes);

// Apply RLS middleware to all routes below this line
app.use(setRlsContext);

app.use((req, res, next) => {
  const requestPath = String(req.originalUrl || "").split("?")[0];
  const isTrackedMutation =
    MUTATION_METHODS.has(String(req.method || "").toUpperCase()) &&
    requestPath.startsWith("/api/") &&
    !requestPath.startsWith("/api/auth");

  if (!isTrackedMutation) {
    next();
    return;
  }

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }

    const userId = String(req.user?.id || "").trim();
    if (!userId) {
      return;
    }

    const storeId =
      typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"].trim()
        : "";

    emitRealtimeEvent({
      type: "data.updated",
      source: requestPath,
      userIds: [userId],
      storeIds: storeId ? [storeId] : [],
      payload: {
        method: String(req.method || "").toUpperCase(),
      },
    });
  });

  next();
});

app.use("/api/shopify", shopifyRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/daily-reports", dailyReportsRoutes);
app.use("/api/access-requests", accessRequestsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/activity-log", activityLogRoutes);
app.use("/api/operational-costs", operationalCostsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/order-comments", orderCommentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/warehouse", warehouseRoutes);
app.use("/api/product-analysis", productAnalysisRoutes);
app.use("/api/suppliers", suppliersRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal server error",
    ...(isDevelopment ? { message: err.message } : {}),
  });
});

app.listen(PORT, () => {
  startShopifyBackgroundSync();
  console.log(`Server running on port ${PORT}`);
});
