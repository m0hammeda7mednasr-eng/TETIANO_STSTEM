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
import NotificationBell from "./NotificationBell";
import tetianoLogo from "../assets/tetiano-logo.jpeg";

const AR = {
  dashboard: "\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645",
  orders: "\u0627\u0644\u0637\u0644\u0628\u0627\u062A",
  missingOrders: "\u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0641\u0642\u0648\u062F\u0629",
  products: "\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
  suppliers: "\u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646",
  productAnalysis: "\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
  warehouse: "\u0627\u0644\u0645\u062E\u0632\u0646",
  scanner: "\u0627\u0644\u0633\u0643\u0627\u0646\u0631",
  customers: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621",
  netProfit: "\u0635\u0627\u0641\u064A \u0627\u0644\u0631\u0628\u062D",
  myTasks: "\u0645\u0647\u0627\u0645\u064A",
  myReports: "\u062A\u0642\u0627\u0631\u064A\u0631\u064A",
  accessRequests: "\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A",
  analytics: "\u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A",
  adminPanel: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u062F\u0645\u0646",
  taskManagement: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0647\u0627\u0645",
  employeeReports: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646",
  userManagement: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646",
  activityLog: "\u0633\u062C\u0644 \u0627\u0644\u0646\u0634\u0627\u0637",
  mySection: "\u0645\u0647\u0627\u0645\u064A \u0648\u062A\u0642\u0627\u0631\u064A\u0631\u064A",
  systemSection: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0646\u0638\u0627\u0645",
  settings: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A",
  logout: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C",
  user: "\u0645\u0633\u062A\u062E\u062F\u0645",
};

const SHARED_NAV = [
  {
    type: "item",
    icon: Home,
    label: AR.dashboard,
    path: "/dashboard",
    subtitle: "نظرة سريعة على الأداء اليومي",
  },
  {
    type: "group",
    id: "orders",
    icon: ShoppingCart,
    label: "الطلبات والمتابعة",
    subtitle: "الطلبات النشطة والتنبيهات",
    items: [
      {
        icon: ShoppingCart,
        label: AR.orders,
        path: "/orders",
        permission: "can_view_orders",
      },
      {
        icon: AlertTriangle,
        label: AR.missingOrders,
        path: "/orders/missing",
        permission: "can_view_orders",
      },
    ],
  },
  {
    type: "group",
    id: "catalog",
    icon: Package,
    label: "المنتجات والتحليل",
    subtitle: "المنتجات وفهم الأداء",
    items: [
      {
        icon: Package,
        label: AR.products,
        path: "/products",
        permission: "can_view_products",
      },
      {
        icon: Truck,
        label: AR.suppliers,
        path: "/suppliers",
        permission: "can_view_products",
      },
      {
        icon: BarChart3,
        label: AR.productAnalysis,
        path: "/products/analysis",
        permission: "can_view_products",
      },
    ],
  },
  {
    type: "group",
    id: "inventory",
    icon: Server,
    label: "المخزون والحركة",
    subtitle: "المخزن والسكانر والحركات",
    items: [
      {
        icon: Server,
        label: AR.warehouse,
        path: "/warehouse",
        permission: "can_view_products",
      },
      {
        icon: Activity,
        label: AR.scanner,
        path: "/warehouse/scanner",
        permission: "can_view_products",
      },
    ],
  },
  {
    type: "item",
    icon: Users,
    label: AR.customers,
    path: "/customers",
    subtitle: "بيانات العملاء والمتابعة",
    permission: "can_view_customers",
  },
  {
    type: "item",
    icon: DollarSign,
    label: AR.netProfit,
    path: "/net-profit",
    subtitle: "الأرباح الصافية والمؤشرات",
    adminOnly: true,
  },
];

const EMPLOYEE_NAV = [
  {
    icon: ClipboardList,
    label: AR.myTasks,
    path: "/my-tasks",
  },
  {
    icon: FileText,
    label: AR.myReports,
    path: "/my-reports",
  },
  {
    icon: UserPlus,
    label: AR.accessRequests,
    path: "/request-access",
  },
];

const ADMIN_NAV = [
  {
    icon: BarChart3,
    label: AR.analytics,
    path: "/analytics",
    adminOnly: true,
  },
  {
    icon: Server,
    label: AR.adminPanel,
    path: "/admin",
    adminOnly: true,
  },
  {
    icon: ClipboardList,
    label: AR.taskManagement,
    path: "/tasks",
    permission: "can_manage_tasks",
  },
  {
    icon: FileText,
    label: AR.employeeReports,
    path: "/reports",
    permission: "can_view_all_reports",
  },
  {
    icon: Shield,
    label: AR.userManagement,
    path: "/users",
    permission: "can_manage_users",
  },
  {
    icon: Activity,
    label: AR.activityLog,
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
  const canManageSettings = hasPermission("can_manage_settings");
  const navigate = useNavigate();
  const location = useLocation();

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

  const canSeeItem = useCallback((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  }, [hasPermission, isAdmin]);

  const visibleSharedEntries = useMemo(
    () =>
      SHARED_NAV.map((entry) => {
        if (entry.type !== "group") {
          return entry;
        }

        return {
          ...entry,
          items: entry.items.filter(canSeeItem),
        };
      }).filter((entry) =>
        entry.type === "group" ? entry.items.length > 0 : canSeeItem(entry),
      ),
    [canSeeItem],
  );

  const visibleEmployeeItems = useMemo(
    () => (isAdmin ? [] : EMPLOYEE_NAV.filter(canSeeItem)),
    [canSeeItem, isAdmin],
  );

  const visibleAdminItems = useMemo(
    () => (isAdmin ? ADMIN_NAV.filter(canSeeItem) : []),
    [canSeeItem, isAdmin],
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

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 bg-sky-700 text-white p-2 rounded-lg hover:bg-sky-800 shadow-lg"
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        className={`fixed lg:static top-0 right-0 h-screen ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } lg:translate-x-0 w-72 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white transition-transform duration-300 z-40 flex flex-col overflow-visible shadow-2xl`}
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/70 backdrop-blur shrink-0 relative z-40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right min-w-0">
              <h1 className="text-xl font-bold tracking-wide text-white">Tetiano</h1>
              <p className="text-slate-300 text-sm mt-1 truncate">
                {user?.name || AR.user}
              </p>
            </div>
            <img
              src={tetianoLogo}
              alt="Tetiano logo"
              className="h-12 w-12 rounded-xl object-cover ring-2 ring-sky-500/40 shadow-lg"
              loading="lazy"
            />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <NotificationBell />
            {isAdmin && (
              <span className="inline-block bg-sky-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                Admin
              </span>
            )}
          </div>
        </div>

        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          <div className="space-y-2">{visibleSharedEntries.map(renderNavEntry)}</div>

          {visibleEmployeeItems.length > 0 && (
            <NavSection title={AR.mySection}>
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
            <NavSection title={AR.systemSection}>
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

        <div className="mt-auto p-4 border-t border-slate-800 bg-slate-950/70 backdrop-blur shrink-0 space-y-2">
          {canManageSettings && (
            <Link
              to="/settings"
              onClick={handleItemClick}
              className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 px-4 py-3 rounded-xl transition text-right border border-slate-700"
            >
              <Settings size={18} />
              <span>{AR.settings}</span>
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 bg-red-600 hover:bg-red-700 px-4 py-3 rounded-xl transition border border-red-500/70"
          >
            <LogOut size={18} />
            <span>{AR.logout}</span>
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
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isActive ? "bg-sky-500/20 text-sky-100" : "bg-slate-800 text-slate-200"
          }`}
        >
          <item.icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-white truncate">{item.label}</p>
          {item.subtitle && (
            <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
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
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isActive ? "bg-sky-500/20 text-sky-100" : "bg-slate-800 text-slate-200"
            }`}
          >
            <group.icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{group.label}</p>
            <p className="text-xs text-slate-400 truncate">{group.subtitle}</p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="border-r border-slate-800/90 pr-3 space-y-1">
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

function NavSection({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-[0.2em]">
          {title}
        </p>
      </div>
      <div className="p-2 space-y-1">{children}</div>
    </div>
  );
}
