import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { dashboardAPI } from "../utils/api";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  RefreshCw,
  XCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Package,
  Users,
  Calendar,
  Target,
  Award,
  AlertCircle,
  Eye,
  Filter,
  Download,
} from "lucide-react";

const Analytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("6months");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await dashboardAPI.getAnalytics();
      setAnalytics(response.data);
      setError("");
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setError("فشل تحميل التحليلات");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value}%`;
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat("ar-EG").format(num);
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    subtitle,
    trend,
    trendValue,
  }) => (
    <div
      className="bg-white rounded-xl shadow-lg p-6 border-l-4"
      style={{
        borderLeftColor: color.replace("text-", "").replace("-600", ""),
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className={`p-3 rounded-full ${color.replace("text-", "bg-").replace("-600", "-100")}`}
        >
          <Icon className={color} size={24} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
              trend === "up"
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-600"
            }`}
          >
            <TrendingUp
              size={12}
              className={trend === "down" ? "rotate-180" : ""}
            />
            {trendValue}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p className={`text-2xl font-bold ${color} mb-1`}>{value}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );

  const MetricCard = ({ title, value, change, changeType, icon: Icon }) => (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="text-gray-400" size={20} />
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            changeType === "positive"
              ? "bg-green-100 text-green-600"
              : changeType === "negative"
                ? "bg-red-100 text-red-600"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {change}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{title}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg">
                جاري تحميل التحليلات المتقدمة...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-center gap-3">
              <AlertCircle className="text-red-600" size={24} />
              <div>
                <p className="text-red-800 font-semibold">{error}</p>
                <button
                  onClick={fetchAnalytics}
                  className="text-red-600 hover:text-red-700 text-sm underline mt-1"
                >
                  إعادة المحاولة
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                  <BarChart3 className="text-blue-600" size={32} />
                  التحليلات المتقدمة
                </h1>
                <p className="text-gray-600">
                  تحليل شامل ومفصل لأداء المتجر والمبيعات والعملاء
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1month">آخر شهر</option>
                  <option value="3months">آخر 3 شهور</option>
                  <option value="6months">آخر 6 شهور</option>
                  <option value="1year">آخر سنة</option>
                </select>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                  <Download size={16} />
                  تصدير التقرير
                </button>
              </div>
            </div>
          </div>

          {analytics && (
            <div className="space-y-8">
              {/* Key Performance Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="إجمالي الإيرادات"
                  value={formatCurrency(analytics.financial.totalRevenue)}
                  icon={DollarSign}
                  color="text-green-600"
                  subtitle="الإيرادات المحققة"
                  trend="up"
                  trendValue="+12.5%"
                />
                <StatCard
                  title="إجمالي الطلبات"
                  value={formatNumber(analytics.summary.totalOrders)}
                  icon={ShoppingCart}
                  color="text-blue-600"
                  subtitle="جميع الطلبات"
                  trend="up"
                  trendValue="+8.3%"
                />
                <StatCard
                  title="معدل النجاح"
                  value={formatPercentage(analytics.summary.successRate)}
                  icon={CheckCircle}
                  color="text-emerald-600"
                  subtitle="الطلبات المدفوعة"
                  trend="up"
                  trendValue="+2.1%"
                />
                <StatCard
                  title="صافي الربح"
                  value={formatCurrency(analytics.financial.netRevenue)}
                  icon={Target}
                  color="text-purple-600"
                  subtitle="بعد خصم الاستردادات"
                  trend="up"
                  trendValue="+15.7%"
                />
              </div>

              {/* Performance Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <MetricCard
                  title="معدل الإلغاء"
                  value={formatPercentage(analytics.summary.cancellationRate)}
                  change="-1.2%"
                  changeType="positive"
                  icon={XCircle}
                />
                <MetricCard
                  title="معدل الاسترداد"
                  value={formatPercentage(analytics.summary.refundRate)}
                  change="-0.8%"
                  changeType="positive"
                  icon={RefreshCw}
                />
                <MetricCard
                  title="متوسط قيمة الطلب"
                  value={formatCurrency(
                    analytics.financial.totalRevenue /
                      analytics.summary.totalOrders || 0,
                  )}
                  change="+5.3%"
                  changeType="positive"
                  icon={TrendingUp}
                />
                <MetricCard
                  title="الطلبات المعلقة"
                  value={formatNumber(analytics.ordersByStatus.pending)}
                  change="3"
                  changeType="neutral"
                  icon={Clock}
                />
                <MetricCard
                  title="العملاء النشطين"
                  value={formatNumber(analytics.topCustomers.length)}
                  change="+12"
                  changeType="positive"
                  icon={Users}
                />
                <MetricCard
                  title="المنتجات الأكثر مبيعاً"
                  value={formatNumber(analytics.topProducts.length)}
                  change="5"
                  changeType="neutral"
                  icon={Award}
                />
              </div>

              {/* Order Status Analysis */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <ShoppingCart size={24} />
                    تحليل حالة الطلبات
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Eye size={16} />
                    عرض تفصيلي
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  <div className="text-center p-6 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
                    <Clock className="mx-auto text-yellow-600 mb-3" size={32} />
                    <p className="text-3xl font-bold text-yellow-700 mb-1">
                      {analytics.ordersByStatus.pending}
                    </p>
                    <p className="text-sm text-yellow-600 font-medium">معلقة</p>
                    <p className="text-xs text-yellow-500 mt-1">
                      في انتظار الدفع
                    </p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                    <CheckCircle
                      className="mx-auto text-green-600 mb-3"
                      size={32}
                    />
                    <p className="text-3xl font-bold text-green-700 mb-1">
                      {analytics.ordersByStatus.paid}
                    </p>
                    <p className="text-sm text-green-600 font-medium">مدفوعة</p>
                    <p className="text-xs text-green-500 mt-1">
                      تم الدفع بنجاح
                    </p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200">
                    <XCircle className="mx-auto text-red-600 mb-3" size={32} />
                    <p className="text-3xl font-bold text-red-700 mb-1">
                      {analytics.ordersByStatus.cancelled}
                    </p>
                    <p className="text-sm text-red-600 font-medium">ملغية</p>
                    <p className="text-xs text-red-500 mt-1">تم إلغاؤها</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                    <RefreshCw
                      className="mx-auto text-orange-600 mb-3"
                      size={32}
                    />
                    <p className="text-3xl font-bold text-orange-700 mb-1">
                      {analytics.ordersByStatus.refunded}
                    </p>
                    <p className="text-sm text-orange-600 font-medium">
                      مستردة
                    </p>
                    <p className="text-xs text-orange-500 mt-1">تم الاسترداد</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                    <Package className="mx-auto text-blue-600 mb-3" size={32} />
                    <p className="text-3xl font-bold text-blue-700 mb-1">
                      {analytics.ordersByStatus.fulfilled}
                    </p>
                    <p className="text-sm text-blue-600 font-medium">مُسلمة</p>
                    <p className="text-xs text-blue-500 mt-1">تم التسليم</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                    <Clock className="mx-auto text-gray-600 mb-3" size={32} />
                    <p className="text-3xl font-bold text-gray-700 mb-1">
                      {analytics.ordersByStatus.unfulfilled}
                    </p>
                    <p className="text-sm text-gray-600 font-medium">
                      غير مُسلمة
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      في انتظار التسليم
                    </p>
                  </div>
                </div>

                {/* Order Status Chart Visualization */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>توزيع الطلبات</span>
                    <span>إجمالي: {analytics.summary.totalOrders} طلب</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="bg-green-500"
                        style={{
                          width: `${(analytics.ordersByStatus.paid / analytics.summary.totalOrders) * 100}%`,
                        }}
                      ></div>
                      <div
                        className="bg-yellow-500"
                        style={{
                          width: `${(analytics.ordersByStatus.pending / analytics.summary.totalOrders) * 100}%`,
                        }}
                      ></div>
                      <div
                        className="bg-blue-500"
                        style={{
                          width: `${(analytics.ordersByStatus.fulfilled / analytics.summary.totalOrders) * 100}%`,
                        }}
                      ></div>
                      <div
                        className="bg-red-500"
                        style={{
                          width: `${(analytics.ordersByStatus.cancelled / analytics.summary.totalOrders) * 100}%`,
                        }}
                      ></div>
                      <div
                        className="bg-orange-500"
                        style={{
                          width: `${(analytics.ordersByStatus.refunded / analytics.summary.totalOrders) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Overview */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <DollarSign size={24} />
                  نظرة عامة مالية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <DollarSign
                      className="mx-auto text-green-600 mb-3"
                      size={28}
                    />
                    <p className="text-sm text-gray-600 mb-1">
                      إجمالي الإيرادات
                    </p>
                    <p className="text-2xl font-bold text-green-600 mb-2">
                      {formatCurrency(analytics.financial.totalRevenue)}
                    </p>
                    <p className="text-xs text-green-500">من جميع المبيعات</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-red-50 to-pink-50 rounded-xl border border-red-200">
                    <RefreshCw
                      className="mx-auto text-red-600 mb-3"
                      size={28}
                    />
                    <p className="text-sm text-gray-600 mb-1">
                      المبالغ المستردة
                    </p>
                    <p className="text-2xl font-bold text-red-600 mb-2">
                      {formatCurrency(analytics.financial.refundedAmount)}
                    </p>
                    <p className="text-xs text-red-500">استردادات العملاء</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-200">
                    <Clock className="mx-auto text-yellow-600 mb-3" size={28} />
                    <p className="text-sm text-gray-600 mb-1">
                      المبالغ المعلقة
                    </p>
                    <p className="text-2xl font-bold text-yellow-600 mb-2">
                      {formatCurrency(analytics.financial.pendingAmount)}
                    </p>
                    <p className="text-xs text-yellow-500">في انتظار الدفع</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                    <Target
                      className="mx-auto text-purple-600 mb-3"
                      size={28}
                    />
                    <p className="text-sm text-gray-600 mb-1">صافي الإيرادات</p>
                    <p className="text-2xl font-bold text-purple-600 mb-2">
                      {formatCurrency(analytics.financial.netRevenue)}
                    </p>
                    <p className="text-xs text-purple-500">الربح الصافي</p>
                  </div>
                </div>
              </div>

              {/* Monthly Trends */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <TrendingUp size={24} />
                  الاتجاهات الشهرية (آخر 6 شهور)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          الشهر
                        </th>
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          الطلبات
                        </th>
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          الإيرادات
                        </th>
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          ملغية
                        </th>
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          مستردة
                        </th>
                        <th className="text-right py-4 px-4 font-semibold text-gray-700">
                          معدل النجاح
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.monthlyTrends.map((month, index) => (
                        <tr
                          key={index}
                          className="border-b border-gray-100 hover:bg-gray-50 transition"
                        >
                          <td className="py-4 px-4 font-medium">
                            {month.month}
                          </td>
                          <td className="py-4 px-4">
                            {formatNumber(month.orders)}
                          </td>
                          <td className="py-4 px-4 text-green-600 font-semibold">
                            {formatCurrency(month.revenue)}
                          </td>
                          <td className="py-4 px-4 text-red-600">
                            {formatNumber(month.cancelled)}
                          </td>
                          <td className="py-4 px-4 text-orange-600">
                            {formatNumber(month.refunded)}
                          </td>
                          <td className="py-4 px-4">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                ((month.orders -
                                  month.cancelled -
                                  month.refunded) /
                                  month.orders) *
                                  100 >
                                80
                                  ? "bg-green-100 text-green-600"
                                  : "bg-yellow-100 text-yellow-600"
                              }`}
                            >
                              {month.orders > 0
                                ? formatPercentage(
                                    (
                                      ((month.orders -
                                        month.cancelled -
                                        month.refunded) /
                                        month.orders) *
                                      100
                                    ).toFixed(1),
                                  )
                                : "0%"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Products & Customers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Products */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <Award size={24} />
                    أفضل المنتجات (حسب الإيرادات)
                  </h3>
                  <div className="space-y-4">
                    {analytics.topProducts.slice(0, 8).map((product, index) => (
                      <div
                        key={
                          product.product_id ||
                          product.shopify_id ||
                          `${product.title || "product"}-${index}`
                        }
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                      >
                        <div className="flex items-center gap-4">
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                              index === 0
                                ? "bg-yellow-500"
                                : index === 1
                                  ? "bg-gray-400"
                                  : index === 2
                                    ? "bg-amber-600"
                                    : "bg-blue-500"
                            }`}
                          >
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-gray-800">
                              {product.title}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatNumber(product.total_quantity)} قطعة •{" "}
                              {formatNumber(product.orders_count)} طلب
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-green-600 text-lg">
                          {formatCurrency(product.total_revenue)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <Users size={24} />
                    أفضل العملاء (حسب الإنفاق)
                  </h3>
                  <div className="space-y-4">
                    {analytics.topCustomers
                      .slice(0, 8)
                      .map((customer, index) => (
                        <div
                          key={
                            customer.customer_id ||
                            customer.email ||
                            `${customer.name || "customer"}-${index}`
                          }
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                        >
                          <div className="flex items-center gap-4">
                            <span
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                                index === 0
                                  ? "bg-purple-500"
                                  : index === 1
                                    ? "bg-indigo-500"
                                    : index === 2
                                      ? "bg-pink-500"
                                      : "bg-blue-500"
                              }`}
                            >
                              #{index + 1}
                            </span>
                            <div>
                              <p className="font-medium text-gray-800">
                                {customer.email}
                              </p>
                              <p className="text-sm text-gray-600">
                                {formatNumber(customer.orders_count)} طلب
                              </p>
                            </div>
                          </div>
                          <p className="font-bold text-green-600 text-lg">
                            {formatCurrency(customer.total_spent)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Analytics;
