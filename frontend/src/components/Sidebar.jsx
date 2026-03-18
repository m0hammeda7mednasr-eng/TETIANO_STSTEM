import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ClipboardList,
  DollarSign,
  FileText,
  Home,
  LogOut,
  Menu,
  Package,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import NotificationBell from "./NotificationBell";
import LanguageToggle from "./LanguageToggle";
import tetianoLogo from "../assets/tetiano-logo.jpeg";

const buildSharedNav = (t, select) => [
  {
    type: "item",
    icon: Home,
    label: t("sidebar.dashboard", "Dashboard"),
    path: "/dashboard",
    subtitle: t("sidebar.dashboardSubtitle", "Quick view of daily performance"),
  },
  {
    type: "group",
    id: "orders",
    icon: ShoppingCart,
    label: t("sidebar.ordersSection", "Orders & Follow-up"),
    subtitle: t("sidebar.ordersSectionSubtitle", "Active orders and alerts"),
    items: [
      {
        icon: ShoppingCart,
        label: t("sidebar.orders", "Orders"),
        path: "/orders",
        permission: "can_view_orders",
      },
      {
        icon: AlertTriangle,
        label: t("sidebar.missingOrders", "Missing Orders"),
        path: "/orders/missing",
        permission: "can_view_orders",
      },
    ],
  },
  {
    type: "group",
    id: "catalog",
    icon: Package,
    label: t("sidebar.catalogSection", "Catalog & Analysis"),
    subtitle: t(
      "sidebar.catalogSectionSubtitle",
      "Products and performance insights",
    ),
    items: [
      {
        icon: Package,
        label: t("sidebar.products", "Products"),
        path: "/products",
        permission: "can_view_products",
      },
      {
        icon: Truck,
        label: t("sidebar.suppliers", "Suppliers"),
        path: "/suppliers",
        permission: "can_view_products",
      },
      {
        icon: Package,
        label: t(
          "sidebar.fabricModels",
          select("موديلات القماش", "Fabric Models"),
        ),
        path: "/suppliers/fabric-models",
        permission: "can_view_products",
      },
      {
        icon: BarChart3,
        label: t("sidebar.productAnalysis", "Product Analysis"),
        path: "/products/analysis",
        permission: "can_view_products",
      },
    ],
  },
  {
    type: "group",
    id: "inventory",
    icon: Server,
    label: t("sidebar.inventorySection", "Inventory & Movement"),
    subtitle: t(
      "sidebar.inventorySectionSubtitle",
      "Warehouse, scanner, and movements",
    ),
    items: [
      {
        icon: Server,
        label: t("sidebar.warehouse", "Warehouse"),
        path: "/warehouse",
        permission: "can_view_products",
      },
      {
        icon: Activity,
        label: t("sidebar.scanner", "Scanner"),
        path: "/warehouse/scanner",
        permission: "can_view_products",
      },
    ],
  },
  {
    type: "item",
    icon: Users,
    label: t("sidebar.customers", "Customers"),
    path: "/customers",
    subtitle: t("sidebar.customersSubtitle", "Customer data and follow-up"),
    permission: "can_view_customers",
  },
  {
    type: "item",
    icon: DollarSign,
    label: t("sidebar.netProfit", "Net Profit"),
    path: "/net-profit",
    subtitle: t("sidebar.netProfitSubtitle", "Net profit and indicators"),
    adminOnly: true,
  },
];

const buildEmployeeNav = (t) => [
  {
    icon: ClipboardList,
    label: t("sidebar.myTasks", "My Tasks"),
    path: "/my-tasks",
  },
  {
    icon: FileText,
    label: t("sidebar.myReports", "My Reports"),
    path: "/my-reports",
  },
  {
    icon: UserPlus,
    label: t("sidebar.accessRequests", "Access Requests"),
    path: "/request-access",
  },
];

const buildAdminNav = (t) => [
  {
    icon: BarChart3,
    label: t("sidebar.analytics", "Analytics"),
    path: "/analytics",
    adminOnly: true,
  },
  {
    icon: Server,
    label: t("sidebar.adminPanel", "Admin Panel"),
    path: "/admin",
    adminOnly: true,
  },
  {
    icon: ClipboardList,
    label: t("sidebar.taskManagement", "Task Management"),
    path: "/tasks",
    permission: "can_manage_tasks",
  },
  {
    icon: FileText,
    label: t("sidebar.employeeReports", "Employee Reports"),
    path: "/reports",
    permission: "can_view_all_reports",
  },
  {
    icon: Shield,
    label: t("sidebar.userManagement", "User Management"),
    path: "/users",
    permission: "can_manage_users",
  },
  {
    icon: Activity,
    label: t("sidebar.activityLog", "Activity Log"),
    path: "/activity-log",
    permission: "can_view_activity_log",
  },
];

const getAutoExpandedGroups = (pathname) => ({
  orders: pathname.startsWith("/orders"),
  catalog: pathname.startsWith("/products") || pathname.startsWith("/suppliers"),
  inventory: pathname.startsWith("/warehouse"),
});

const isPathActive = (pathname, itemPath) => {
  switch (itemPath) {
    case "/dashboard":
      return pathname === "/dashboard";
    case "/orders":
      return (
        pathname === "/orders" ||
        (/^\/orders\/[^/]+$/.test(pathname) && pathname !== "/orders/missing")
      );
    case "/products":
      return (
        pathname === "/products" ||
        (/^\/products\/[^/]+$/.test(pathname) &&
          pathname !== "/products/analysis")
      );
    case "/suppliers":
      return pathname === "/suppliers";
    case "/suppliers/fabric-models":
      return pathname === "/suppliers/fabric-models";
    default:
      return pathname === itemPath;
  }
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() =>
    getAutoExpandedGroups(window.location.pathname),
  );
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const { isRTL, select, t } = useLocale();
  const canManageSettings = hasPermission("can_manage_settings");
  const navigate = useNavigate();
  const location = useLocation();

  const sharedNav = useMemo(() => buildSharedNav(t, select), [select, t]);
  const employeeNav = useMemo(() => buildEmployeeNav(t), [t]);
  const adminNav = useMemo(() => buildAdminNav(t), [t]);

  useEffect(() => {
    setExpandedGroups((current) => {
      const autoExpanded = getAutoExpandedGroups(location.pathname);
      let changed = false;
      const nextState = { ...current };

      for (const [groupId, shouldOpen] of Object.entries(autoExpanded)) {
        if (shouldOpen && !nextState[groupId]) {
          nextState[groupId] = true;
          changed = true;
        }
      }

      return changed ? nextState : current;
    });
  }, [location.pathname]);

  const canSeeItem = useCallback(
    (item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.permission && !hasPermission(item.permission)) return false;
      return true;
    },
    [hasPermission, isAdmin],
  );

  const visibleSharedEntries = useMemo(
    () =>
      sharedNav
        .map((entry) => {
          if (entry.type !== "group") {
            return entry;
          }

          return {
            ...entry,
            items: entry.items.filter(canSeeItem),
          };
        })
        .filter((entry) =>
          entry.type === "group" ? entry.items.length > 0 : canSeeItem(entry),
        ),
    [canSeeItem, sharedNav],
  );

  const visibleEmployeeItems = useMemo(
    () => (isAdmin ? [] : employeeNav.filter(canSeeItem)),
    [canSeeItem, employeeNav, isAdmin],
  );

  const visibleAdminItems = useMemo(
    () => (isAdmin ? adminNav.filter(canSeeItem) : []),
    [adminNav, canSeeItem, isAdmin],
  );

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleItemClick = () => {
    setIsOpen(false);
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const renderNavEntry = (entry) => {
    if (entry.type === "group") {
      const isGroupActive = entry.items.some((item) =>
        isPathActive(location.pathname, item.path),
      );

      return (
        <SidebarGroup
          key={entry.id}
          group={entry}
          expanded={Boolean(expandedGroups[entry.id])}
          isActive={isGroupActive}
          isRTL={isRTL}
          locationPath={location.pathname}
          onToggle={() => toggleGroup(entry.id)}
          onItemClick={handleItemClick}
        />
      );
    }

    return (
      <SidebarPrimaryItem
        key={entry.path}
        item={entry}
        isActive={isPathActive(location.pathname, entry.path)}
        onClick={handleItemClick}
      />
    );
  };

  const mobileButtonPosition = isRTL ? "right-4" : "left-4";
  const sidePositionClass = isRTL ? "right-0" : "left-0";
  const hiddenTransformClass = isRTL ? "translate-x-full" : "-translate-x-full";
  const headerTextAlignClass = isRTL ? "text-right" : "text-left";
  const settingsTextAlignClass = isRTL ? "text-right" : "text-left";
  const logoRowClass = isRTL ? "flex-row" : "flex-row-reverse";

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`lg:hidden fixed top-4 ${mobileButtonPosition} z-50 rounded-lg bg-sky-700 p-2 text-white shadow-lg hover:bg-sky-800`}
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        className={`fixed lg:static top-0 ${sidePositionClass} h-screen ${
          isOpen ? "translate-x-0" : hiddenTransformClass
        } lg:translate-x-0 w-72 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white transition-transform duration-300 z-40 flex flex-col overflow-visible shadow-2xl`}
      >
        <div className="relative z-40 border-b border-slate-800 bg-slate-950/70 p-6 backdrop-blur shrink-0">
          <div className={`flex items-center justify-between gap-3 ${logoRowClass}`}>
            <div className={`${headerTextAlignClass} min-w-0`}>
              <h1 className="text-xl font-bold tracking-wide text-white">Tetiano</h1>
              <p className="mt-1 truncate text-sm text-slate-300">
                {user?.name || t("sidebar.userFallback", "User")}
              </p>
            </div>
            <img
              src={tetianoLogo}
              alt="Tetiano logo"
              className="h-12 w-12 rounded-xl object-cover ring-2 ring-sky-500/40 shadow-lg"
              loading="lazy"
            />
          </div>

          <div
            className={`mt-4 flex items-center gap-2 ${
              isRTL ? "justify-end" : "justify-start"
            }`}
          >
            <NotificationBell />
            {isAdmin && (
              <span className="inline-block rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
                {t("sidebar.adminBadge", "Admin")}
              </span>
            )}
          </div>

          <div className={`mt-4 flex ${isRTL ? "justify-end" : "justify-start"}`}>
            <LanguageToggle className="border-slate-700 bg-slate-900/70 text-white shadow-none" />
          </div>
        </div>

        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          <div className="space-y-2">{visibleSharedEntries.map(renderNavEntry)}</div>

          {visibleEmployeeItems.length > 0 && (
            <NavSection title={t("sidebar.mySection", "My Work")} isRTL={isRTL}>
              {visibleEmployeeItems.map((item) => (
                <SidebarListItem
                  key={item.path}
                  item={item}
                  isActive={isPathActive(location.pathname, item.path)}
                  onClick={handleItemClick}
                />
              ))}
            </NavSection>
          )}

          {visibleAdminItems.length > 0 && (
            <NavSection
              title={t("sidebar.systemSection", "System Management")}
              isRTL={isRTL}
            >
              {visibleAdminItems.map((item) => (
                <SidebarListItem
                  key={item.path}
                  item={item}
                  isActive={isPathActive(location.pathname, item.path)}
                  onClick={handleItemClick}
                />
              ))}
            </NavSection>
          )}
        </nav>

        <div className="mt-auto space-y-2 border-t border-slate-800 bg-slate-950/70 p-4 backdrop-blur shrink-0">
          {canManageSettings && (
            <Link
              to="/settings"
              onClick={handleItemClick}
              className={`w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 transition hover:bg-slate-700 ${settingsTextAlignClass}`}
            >
              <Settings size={18} />
              <span>{t("sidebar.settings", "Settings")}</span>
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl border border-red-500/70 bg-red-600 px-4 py-3 transition hover:bg-red-700"
          >
            <LogOut size={18} />
            <span>{t("sidebar.logout", "Log out")}</span>
          </button>
        </div>
      </aside>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}
    </>
  );
}

function SidebarPrimaryItem({ item, isActive, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
        isActive
          ? "border-sky-500/60 bg-sky-700/30 shadow-lg shadow-sky-900/30"
          : "border-slate-800 bg-slate-900/70 hover:bg-slate-800/90"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isActive ? "bg-sky-500/20 text-sky-100" : "bg-slate-800 text-slate-200"
          }`}
        >
          <item.icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{item.label}</p>
          {item.subtitle && (
            <p className="truncate text-xs text-slate-400">{item.subtitle}</p>
          )}
        </div>
      </div>
      <span
        className={`h-2.5 w-2.5 rounded-full transition ${
          isActive ? "bg-sky-300" : "bg-transparent"
        }`}
      />
    </Link>
  );
}

function SidebarGroup({
  group,
  expanded,
  isActive,
  isRTL,
  locationPath,
  onToggle,
  onItemClick,
}) {
  return (
    <div
      className={`rounded-2xl border transition ${
        isActive
          ? "border-sky-500/60 bg-slate-900/90 shadow-lg shadow-sky-950/30"
          : "border-slate-800 bg-slate-900/70"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${
          isRTL ? "text-right" : "text-left"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isActive ? "bg-sky-500/20 text-sky-100" : "bg-slate-800 text-slate-200"
            }`}
          >
            <group.icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{group.label}</p>
            <p className="truncate text-xs text-slate-400">{group.subtitle}</p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div
            className={`space-y-1 ${
              isRTL
                ? "border-r border-slate-800/90 pr-3"
                : "border-l border-slate-800/90 pl-3"
            }`}
          >
            {group.items.map((item) => (
              <SidebarSubItem
                key={item.path}
                item={item}
                isActive={isPathActive(locationPath, item.path)}
                onClick={onItemClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarSubItem({ item, isActive, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
        isActive ? "bg-sky-700/25 text-white" : "text-slate-300 hover:bg-slate-800"
      }`}
    >
      <item.icon size={16} />
      <span className="text-sm font-medium">{item.label}</span>
    </Link>
  );
}

function SidebarListItem({ item, isActive, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${
        isActive ? "bg-sky-700/25 text-white" : "text-slate-200 hover:bg-slate-800"
      }`}
    >
      <item.icon size={17} />
      <span className="font-medium">{item.label}</span>
    </Link>
  );
}

function NavSection({ title, isRTL, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
      <div className="border-b border-slate-800 px-4 py-3">
        <p
          className={`text-xs font-semibold tracking-[0.2em] text-slate-400 ${
            isRTL ? "" : "uppercase"
          }`}
        >
          {title}
        </p>
      </div>
      <div className="space-y-1 p-2">{children}</div>
    </div>
  );
}
