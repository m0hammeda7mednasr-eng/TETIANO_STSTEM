export const PERMISSION_LABELS = {
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
};

export const PERMISSION_DESCRIPTIONS = {
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
};

export const getPermissionLabel = (key) =>
  PERMISSION_LABELS[key] ||
  String(key || "")
    .replace(/_/g, " ")
    .replace(/^can\s+/i, "")
    .trim();

export const getPermissionDescription = (key) =>
  PERMISSION_DESCRIPTIONS[key] || "";
