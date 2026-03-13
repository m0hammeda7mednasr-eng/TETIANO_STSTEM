# عناصر Dashboard بالتفصيل 📊

## 🎨 تخطيط Dashboard للمدير

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                      │
│  ┌──────────────────────────────┐  ┌──────────────────────┐ │
│  │ لوحة التحكم                  │  │ مزامنة Shopify       │ │
│  │ مرحباً بك في لوحة تحكم المدير│  └──────────────────────┘ │
│  │ 👨‍💼 مدير النظام              │                          │
│  │ 📋 إدارة المستخدمين          │                          │
│  └──────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Stats Cards (4 كروت بيضاء)                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                    │
│  │ 💰   │  │ 🛒   │  │ 📦   │  │ 👥   │                    │
│  │ Sales│  │Orders│  │Produc│  │Custom│                    │
│  └──────┘  └──────┘  └──────┘  └──────┘                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Admin Quick Actions (3 كروت كبيرة ملونة)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 👥 المستخدمين│  │ 📋 المهام    │  │ 🛡️ التقارير  │      │
│  │ (بنفسجي)     │  │ (أزرق)       │  │ (أخضر)       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Admin Sections (قسمين جنب بعض)                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ 🛡️ طلبات الصلاحيات  │  │ 📄 التقارير اليومية │        │
│  │ المعلقة (أصفر)       │  │ الأخيرة (أزرق)       │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Charts (رسوم بيانية)                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ 📈 اتجاه المبيعات   │  │ 📊 اتجاه الطلبات     │        │
│  │ (Line Chart)         │  │ (Bar Chart)          │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 تفاصيل كل عنصر

### 1. Header (الرأس)

#### الجزء الأيسر:

```jsx
<div>
  <h1>لوحة التحكم</h1>
  <p>مرحباً بك في لوحة تحكم المدير - إدارة كاملة للنظام</p>

  {/* Admin Badge */}
  <span className="bg-purple-100 text-purple-800">👨‍💼 مدير النظام</span>

  {/* زر إدارة المستخدمين */}
  <button onClick={() => navigate("/users")}>📋 إدارة المستخدمين</button>
</div>
```

#### الجزء الأيمن:

```jsx
<button onClick={handleSync}>
  <RefreshCw /> مزامنة Shopify
</button>
```

---

### 2. Stats Cards (4 كروت)

```jsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
  {/* 1. Total Sales */}
  <div className="bg-white rounded-lg shadow">
    <TrendingUp className="text-green-500" />
    <p>إجمالي المبيعات</p>
    <p>${stats.total_sales}</p>
  </div>

  {/* 2. Total Orders */}
  <div className="bg-white rounded-lg shadow">
    <ShoppingCart className="text-blue-500" />
    <p>إجمالي الطلبات</p>
    <p>{stats.total_orders}</p>
  </div>

  {/* 3. Total Products */}
  <div className="bg-white rounded-lg shadow">
    <Package className="text-purple-500" />
    <p>إجمالي المنتجات</p>
    <p>{stats.total_products}</p>
  </div>

  {/* 4. Total Customers */}
  <div className="bg-white rounded-lg shadow">
    <Users className="text-orange-500" />
    <p>إجمالي العملاء</p>
    <p>{stats.total_customers}</p>
  </div>
</div>
```

---

### 3. Admin Quick Actions (3 كروت كبيرة)

```jsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* 1. Users Management Card (بنفسجي) */}
  <div
    onClick={() => navigate("/users")}
    className="bg-gradient-to-br from-purple-500 to-purple-700 cursor-pointer"
  >
    <p>إدارة المستخدمين</p>
    <p className="text-3xl">المستخدمين</p>
    <p>إضافة وتعديل الصلاحيات</p>
    <Users size={48} />
  </div>

  {/* 2. Tasks Management Card (أزرق) */}
  <div
    onClick={() => navigate("/tasks")}
    className="bg-gradient-to-br from-blue-500 to-blue-700 cursor-pointer"
  >
    <p>إدارة المهام</p>
    <p className="text-3xl">المهام</p>
    <p>إنشاء وتوزيع المهام</p>
    <FileText size={48} />
  </div>

  {/* 3. Reports Card (أخضر) */}
  <div
    onClick={() => navigate("/reports")}
    className="bg-gradient-to-br from-green-500 to-green-700 cursor-pointer"
  >
    <p>التقارير اليومية</p>
    <p className="text-3xl">التقارير</p>
    <p>مراجعة تقارير الموظفين</p>
    <Shield size={48} />
  </div>
</div>
```

---

### 4. Pending Requests Section (قسم طلبات الصلاحيات)

```jsx
<div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-200">
  {/* Header */}
  <div className="flex justify-between">
    <h2>
      <Shield className="text-yellow-600" />
      طلبات الصلاحيات المعلقة
    </h2>
    <span className="bg-yellow-600 text-white">{pendingRequests.length}</span>
  </div>

  {/* Content */}
  {pendingRequests.length === 0 ? (
    <div className="text-center">
      <Shield className="text-yellow-300" />
      <p>لا توجد طلبات معلقة</p>
      <p>عندما يطلب الموظفون صلاحيات جديدة، ستظهر هنا</p>
    </div>
  ) : (
    <div>
      {pendingRequests.slice(0, 3).map((request) => (
        <div onClick={() => navigate("/users")}>
          <p>{request.users?.name}</p>
          <p>{request.permission_requested}</p>
          <span>{new Date(request.created_at).toLocaleDateString()}</span>
        </div>
      ))}
      <button onClick={() => navigate("/users")}>
        عرض جميع الطلبات ({pendingRequests.length})
      </button>
    </div>
  )}
</div>
```

---

### 5. Recent Reports Section (قسم التقارير الأخيرة)

```jsx
<div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
  {/* Header */}
  <div className="flex justify-between">
    <h2>
      <FileText className="text-blue-600" />
      التقارير اليومية الأخيرة
    </h2>
    <span className="bg-blue-600 text-white">{recentReports.length}</span>
  </div>

  {/* Content */}
  {recentReports.length === 0 ? (
    <div className="text-center">
      <FileText className="text-blue-300" />
      <p>لا توجد تقارير حديثة</p>
      <p>عندما يكتب الموظفون تقارير يومية، ستظهر هنا</p>
    </div>
  ) : (
    <div>
      {recentReports.map((report) => (
        <div onClick={() => navigate("/users")}>
          <p>{report.users?.name}</p>
          <p>{report.title}</p>
          <span>{new Date(report.report_date).toLocaleDateString()}</span>
        </div>
      ))}
      <button onClick={() => navigate("/users")}>عرض جميع التقارير</button>
    </div>
  )}
</div>
```

---

### 6. Charts (الرسوم البيانية)

```jsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Sales Chart */}
  <div className="bg-white rounded-lg shadow">
    <h2>اتجاه المبيعات</h2>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="sales" stroke="#3b82f6" />
      </LineChart>
    </ResponsiveContainer>
  </div>

  {/* Orders Chart */}
  <div className="bg-white rounded-lg shadow">
    <h2>اتجاه الطلبات</h2>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="orders" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>
```

---

## 🎨 الألوان المستخدمة

### Stats Cards:

- 💰 Sales: أخضر (`text-green-500`)
- 🛒 Orders: أزرق (`text-blue-500`)
- 📦 Products: بنفسجي (`text-purple-500`)
- 👥 Customers: برتقالي (`text-orange-500`)

### Admin Quick Actions:

- 👥 Users: بنفسجي (`from-purple-500 to-purple-700`)
- 📋 Tasks: أزرق (`from-blue-500 to-blue-700`)
- 🛡️ Reports: أخضر (`from-green-500 to-green-700`)

### Admin Sections:

- 🛡️ Pending Requests: أصفر (`from-yellow-50 to-yellow-100`)
- 📄 Recent Reports: أزرق (`from-blue-50 to-blue-100`)

---

## 📏 الأحجام والمسافات

### Grid Layouts:

- Stats Cards: `grid-cols-1 md:grid-cols-4 gap-6`
- Admin Quick Actions: `grid-cols-1 md:grid-cols-3 gap-6`
- Admin Sections: `grid-cols-1 lg:grid-cols-2 gap-6`
- Charts: `grid-cols-1 lg:grid-cols-2 gap-6`

### Spacing:

- Main padding: `p-8`
- Section margin: `mb-8`
- Card padding: `p-6`
- Gap between items: `gap-6`

### Icons:

- Small icons: `size={20}`
- Medium icons: `size={24}`
- Large icons: `size={40}`
- Extra large icons: `size={48}`

---

## 🔍 الشروط (Conditions)

### عرض ميزات المدير:

```jsx
{userRole === "admin" && (
  // Admin Badge
  // زر إدارة المستخدمين
  // Admin Quick Actions
  // Pending Requests Section
  // Recent Reports Section
)}
```

### عرض Loading State:

```jsx
{loading ? (
  // Skeleton Cards
) : (
  // Actual Stats Cards
)}
```

### عرض Error State:

```jsx
{
  error && (
    <div className="bg-red-50 border border-red-200">
      <AlertCircle className="text-red-600" />
      <p>{error}</p>
    </div>
  );
}
```

---

## ✅ Checklist للتحقق

عند فتح Dashboard كمدير، يجب أن ترى:

- [ ] عنوان "لوحة التحكم"
- [ ] نص "مرحباً بك في لوحة تحكم المدير - إدارة كاملة للنظام"
- [ ] Badge بنفسجي: "👨‍💼 مدير النظام"
- [ ] زر أزرق: "📋 إدارة المستخدمين"
- [ ] زر "مزامنة Shopify"
- [ ] 4 Stats Cards (أبيض)
- [ ] 3 Admin Quick Actions Cards (بنفسجي، أزرق، أخضر)
- [ ] قسم "طلبات الصلاحيات المعلقة" (أصفر)
- [ ] قسم "التقارير اليومية الأخيرة" (أزرق)
- [ ] رسم بياني "اتجاه المبيعات" (Line Chart)
- [ ] رسم بياني "اتجاه الطلبات" (Bar Chart)

---

## 🎉 الخلاصة

**Dashboard للمدير يحتوي على 7 أقسام رئيسية:**

1. ✅ Header (مع Admin Badge وزر إدارة المستخدمين)
2. ✅ Stats Cards (4 كروت)
3. ✅ Admin Quick Actions (3 كروت كبيرة)
4. ✅ Pending Requests Section
5. ✅ Recent Reports Section
6. ✅ Charts (2 رسم بياني)
7. ✅ Sidebar (مع عنصر المستخدمين)

**كل شيء موجود في الكود! 🚀**

---

**الملف:** `frontend/src/pages/Dashboard.jsx`
**السطور:** 1-500+
**الحالة:** ✅ كامل وشغال
