import express from "express";
import jwt from "jsonwebtoken";
import { isAdmin } from "../middleware/permissions.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Get date range
const getDateRange = (range) => {
  const now = new Date();
  let startDate = new Date();

  switch (range) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "7days":
      startDate.setDate(now.getDate() - 7);
      break;
    case "30days":
      startDate.setDate(now.getDate() - 30);
      break;
    case "90days":
      startDate.setDate(now.getDate() - 90);
      break;
    case "year":
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 7);
  }

  return { startDate: startDate.toISOString(), endDate: now.toISOString() };
};

// Get Reports (Admin only)
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { range = "7days" } = req.query;
    const { startDate, endDate } = getDateRange(range);

    // Get orders in date range
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (ordersError) throw ordersError;

    // Get customers in date range
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (customersError) throw customersError;

    // Get products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*");

    if (productsError) throw productsError;

    // Calculate summary
    const totalSales = orders.reduce(
      (sum, order) => sum + parseFloat(order.total_price || 0),
      0,
    );
    const totalOrders = orders.length;
    const newCustomers = customers.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Daily sales
    const dailySalesMap = {};
    orders.forEach((order) => {
      const date = new Date(order.created_at).toISOString().split("T")[0];
      if (!dailySalesMap[date]) {
        dailySalesMap[date] = 0;
      }
      dailySalesMap[date] += parseFloat(order.total_price || 0);
    });

    const dailySales = Object.entries(dailySalesMap)
      .map(([date, sales]) => ({
        date,
        sales: parseFloat(sales.toFixed(2)),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Orders by status
    const statusMap = {};
    orders.forEach((order) => {
      const status = order.status || "pending";
      statusMap[status] = (statusMap[status] || 0) + 1;
    });

    const ordersByStatus = Object.entries(statusMap).map(([name, value]) => ({
      name:
        name === "pending"
          ? "قيد الانتظار"
          : name === "completed"
            ? "مكتمل"
            : name === "cancelled"
              ? "ملغي"
              : name,
      value,
    }));

    // Top products (mock data - you can enhance this with real product sales data)
    const topProducts = products.slice(0, 5).map((product) => ({
      name: product.title || product.name,
      sales: Math.floor(Math.random() * 10000) + 1000,
      quantity: Math.floor(Math.random() * 100) + 10,
    }));

    // Customer growth
    const customerGrowthMap = {};
    customers.forEach((customer) => {
      const date = new Date(customer.created_at).toISOString().split("T")[0];
      customerGrowthMap[date] = (customerGrowthMap[date] || 0) + 1;
    });

    let cumulativeCustomers = 0;
    const customerGrowth = Object.entries(customerGrowthMap)
      .map(([date, count]) => {
        cumulativeCustomers += count;
        return { date, customers: cumulativeCustomers };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      summary: {
        totalSales,
        totalOrders,
        newCustomers,
        avgOrderValue,
      },
      dailySales,
      ordersByStatus,
      topProducts,
      customerGrowth,
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: error.message });
  }
});

// Download Report as CSV (Admin only)
router.get("/download", verifyToken, isAdmin, async (req, res) => {
  try {
    const { range = "7days" } = req.query;
    const { startDate, endDate } = getDateRange(range);

    // Get orders
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (error) throw error;

    // Create CSV
    let csv = "التاريخ,رقم الطلب,العميل,المبلغ,الحالة\n";
    orders.forEach((order) => {
      const date = new Date(order.created_at).toLocaleDateString("ar-EG");
      csv += `${date},${order.order_number || order.id},${order.customer_name || "غير معروف"},${order.total_price || 0},${order.status || "pending"}\n`;
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=report-${range}.csv`,
    );
    res.send("\uFEFF" + csv); // Add BOM for Excel Arabic support
  } catch (error) {
    console.error("Error downloading report:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

