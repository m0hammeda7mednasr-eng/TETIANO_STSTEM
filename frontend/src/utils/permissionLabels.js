const PERMISSION_COPY = {
  ar: {
    labels: {
      can_view_dashboard: "عرض لوحة التحكم",
      can_view_products: "عرض المنتجات والموردين والمخزن",
      can_edit_products: "إدارة المنتجات والموردين",
      can_view_orders: "عرض الطلبات",
      can_edit_orders: "تعديل الطلبات",
      can_view_customers: "عرض العملاء",
      can_edit_customers: "تعديل العملاء",
      can_manage_users: "إدارة المستخدمين والصلاحيات",
      can_manage_settings: "إدارة الإعدادات",
      can_view_profits: "عرض الأرباح",
      can_manage_tasks: "إدارة المهام",
      can_view_all_reports: "عرض جميع التقارير",
      can_view_activity_log: "عرض سجل النشاط",
    },
    descriptions: {
      can_view_dashboard:
        "يعرض لوحة التحكم والإحصائيات الرئيسية للمتجر.",
      can_view_products:
        "يعرض المنتجات وتفاصيلها وتحليل المنتجات والموردين والمخزن والسكانر.",
      can_edit_products:
        "يسمح بتعديل المنتجات وSKU والسعر والمخزون، وإدارة الموردين وحركات المخزن.",
      can_view_orders:
        "يعرض الطلبات والطلبات المفقودة وتفاصيل الطلب وصور المنتجات داخل الطلب.",
      can_edit_orders:
        "يسمح بتعديل حالة الطلب والدفع وتنفيذ أو restock الطلب كله أو عناصر محددة منه.",
      can_view_customers:
        "يعرض قائمة العملاء وبيانات التواصل والطلبات المرتبطة بهم.",
      can_edit_customers:
        "يسمح بتعديل بيانات العملاء والإجراءات المرتبطة بهم.",
      can_manage_users:
        "يسمح بإدارة المستخدمين والصلاحيات وطلبات الوصول.",
      can_manage_settings:
        "يسمح بالدخول إلى الإعدادات وإدارة المزامنة والتكوين العام.",
      can_view_profits:
        "يعرض صافي الربح وهوامش الربحية والتكلفة.",
      can_manage_tasks:
        "يسمح بإدارة المهام وتعيينها ومتابعتها.",
      can_view_all_reports:
        "يعرض جميع التقارير وتقارير الموظفين.",
      can_view_activity_log:
        "يعرض سجل النشاط والعمليات التي تمت داخل النظام.",
    },
  },
  en: {
    labels: {
      can_view_dashboard: "View Dashboard",
      can_view_products: "View Products, Suppliers, and Warehouse",
      can_edit_products: "Manage Products and Suppliers",
      can_view_orders: "View Orders",
      can_edit_orders: "Edit Orders",
      can_view_customers: "View Customers",
      can_edit_customers: "Edit Customers",
      can_manage_users: "Manage Users and Permissions",
      can_manage_settings: "Manage Settings",
      can_view_profits: "View Profits",
      can_manage_tasks: "Manage Tasks",
      can_view_all_reports: "View All Reports",
      can_view_activity_log: "View Activity Log",
    },
    descriptions: {
      can_view_dashboard:
        "Shows the main dashboard and key store metrics.",
      can_view_products:
        "Shows products, product details, product analysis, suppliers, warehouse, and scanner views.",
      can_edit_products:
        "Allows editing products, SKU, price, stock, suppliers, and warehouse movements.",
      can_view_orders:
        "Shows orders, missing orders, order details, and product images inside orders.",
      can_edit_orders:
        "Allows changing order/payment status and fulfilling or restocking full orders or selected items.",
      can_view_customers:
        "Shows the customer list, contact details, and linked orders.",
      can_edit_customers:
        "Allows updating customer data and related actions.",
      can_manage_users:
        "Allows managing users, permissions, and access requests.",
      can_manage_settings:
        "Allows entering settings and managing sync plus general configuration.",
      can_view_profits:
        "Shows net profit, margins, and cost breakdowns.",
      can_manage_tasks:
        "Allows managing, assigning, and following up on tasks.",
      can_view_all_reports:
        "Shows all reports and employee reports.",
      can_view_activity_log:
        "Shows the activity log and operations done inside the system.",
    },
  },
};

const normalizeLocale = (locale) =>
  String(locale || "").trim().toLowerCase() === "ar" ? "ar" : "en";

const buildFallbackLabel = (key) =>
  String(key || "")
    .replace(/_/g, " ")
    .replace(/^can\s+/i, "")
    .trim();

export const getPermissionLabel = (key, locale = "ar") => {
  const normalizedLocale = normalizeLocale(locale);
  return (
    PERMISSION_COPY[normalizedLocale]?.labels?.[key] ||
    PERMISSION_COPY.ar.labels?.[key] ||
    buildFallbackLabel(key)
  );
};

export const getPermissionDescription = (key, locale = "ar") => {
  const normalizedLocale = normalizeLocale(locale);
  return (
    PERMISSION_COPY[normalizedLocale]?.descriptions?.[key] ||
    PERMISSION_COPY.ar.descriptions?.[key] ||
    ""
  );
};
