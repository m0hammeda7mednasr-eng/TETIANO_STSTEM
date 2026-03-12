import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
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
  products: "\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
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

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      section: "shared",
      icon: Home,
      label: AR.dashboard,
      path: "/dashboard",
    },
    {
      section: "shared",
      icon: ShoppingCart,
      label: AR.orders,
      path: "/orders",
      permission: "can_view_orders",
    },
    {
      section: "shared",
      icon: Package,
      label: AR.products,
      path: "/products",
      permission: "can_view_products",
    },
    {
      section: "shared",
      icon: Users,
      label: AR.customers,
      path: "/customers",
      permission: "can_view_customers",
    },
    {
      section: "shared",
      icon: DollarSign,
      label: AR.netProfit,
      path: "/net-profit",
      adminOnly: true,
    },
    {
      section: "employee",
      icon: ClipboardList,
      label: AR.myTasks,
      path: "/my-tasks",
    },
    {
      section: "employee",
      icon: FileText,
      label: AR.myReports,
      path: "/my-reports",
    },
    {
      section: "employee",
      icon: UserPlus,
      label: AR.accessRequests,
      path: "/request-access",
    },
    {
      section: "admin",
      icon: BarChart3,
      label: AR.analytics,
      path: "/analytics",
      adminOnly: true,
    },
    {
      section: "admin",
      icon: Server,
      label: AR.adminPanel,
      path: "/admin",
      adminOnly: true,
    },
    {
      section: "admin",
      icon: ClipboardList,
      label: AR.taskManagement,
      path: "/tasks",
      permission: "can_manage_tasks",
    },
    {
      section: "admin",
      icon: FileText,
      label: AR.employeeReports,
      path: "/reports",
      permission: "can_view_all_reports",
    },
    {
      section: "admin",
      icon: Shield,
      label: AR.userManagement,
      path: "/users",
      permission: "can_manage_users",
    },
    {
      section: "admin",
      icon: Activity,
      label: AR.activityLog,
      path: "/activity-log",
      permission: "can_view_activity_log",
    },
  ];

  const canSeeItem = (item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.section === "employee" && isAdmin) return false;
    if (item.section === "admin" && !isAdmin) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  };

  const visibleSharedItems = menuItems.filter(
    (item) => item.section === "shared" && canSeeItem(item),
  );
  const visibleEmployeeItems = menuItems.filter(
    (item) => item.section === "employee" && canSeeItem(item),
  );
  const visibleAdminItems = menuItems.filter(
    (item) => item.section === "admin" && canSeeItem(item),
  );

  const handleLogout = () => {
    logout();
    navigate("/login");
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
        } lg:translate-x-0 w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white transition-transform duration-300 z-40 flex flex-col overflow-visible`}
      >
        <div className="p-6 border-b border-slate-700/90 bg-slate-900/40 backdrop-blur shrink-0 relative z-40">
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

        <nav className="mt-2 flex-1 overflow-y-auto pb-4">
          {visibleSharedItems.map((item) => (
            <SidebarItem
              key={item.path}
              item={item}
              isActive={location.pathname === item.path}
              onClick={() => setIsOpen(false)}
            />
          ))}

          {visibleEmployeeItems.length > 0 && (
            <>
              <SectionTitle title={AR.mySection} />
              {visibleEmployeeItems.map((item) => (
                <SidebarItem
                  key={item.path}
                  item={item}
                  isActive={location.pathname === item.path}
                  onClick={() => setIsOpen(false)}
                />
              ))}
            </>
          )}

          {visibleAdminItems.length > 0 && (
            <>
              <SectionTitle title={AR.systemSection} />
              {visibleAdminItems.map((item) => (
                <SidebarItem
                  key={item.path}
                  item={item}
                  isActive={location.pathname === item.path}
                  onClick={() => setIsOpen(false)}
                />
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-700/80 bg-slate-900/70 backdrop-blur shrink-0 space-y-2">
          {isAdmin && (
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition text-right"
            >
              <Settings size={18} />
              <span>{AR.settings}</span>
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition"
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

function SidebarItem({ item, isActive, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 px-6 py-3 ${
        isActive
          ? "bg-sky-700/60 border-r-4 border-sky-400"
          : "hover:bg-slate-700/60"
      } transition`}
    >
      <item.icon size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

function SectionTitle({ title }) {
  return (
    <div className="px-6 py-3 mt-4 border-t border-slate-700">
      <p className="text-slate-400 text-xs font-semibold uppercase">{title}</p>
    </div>
  );
}
