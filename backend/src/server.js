import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
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
import { supabase } from "./supabaseClient.js";
import { setRlsContext } from "./middleware/rls.js";

console.log("✅ operationalCostsRoutes loaded:", typeof operationalCostsRoutes);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      process.env.FRONTEND_URL,
      // Vercel domains
      /^https:\/\/.*\.vercel\.app$/,
      // Railway domains (for testing)
      /^https:\/\/.*\.railway\.app$/,
    ].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Export supabase for any legacy imports, but it's now initialized elsewhere
export { supabase };

// Routes
app.use("/api/auth", authRoutes);

// Apply RLS middleware to all routes below this line
app.use(setRlsContext);

// Add debugging middleware for dashboard routes
app.use("/api/dashboard", (req, res, next) => {
  console.log(`🔍 Dashboard route accessed: ${req.method} ${req.path}`);
  console.log(`🔍 Full URL: ${req.originalUrl}`);
  console.log(
    `🔍 Headers:`,
    req.headers.authorization ? "Token present" : "No token",
  );
  next();
});

app.use("/api/shopify", shopifyRoutes);
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
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
