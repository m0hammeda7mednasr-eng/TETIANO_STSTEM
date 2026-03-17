import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import ProductAnalysis from "./pages/ProductAnalysis";
import ProductDetails from "./pages/ProductDetails";
import Orders from "./pages/Orders";
import MissingOrders from "./pages/MissingOrders";
import OrderDetails from "./pages/OrderDetails";
import WarehouseStock from "./pages/WarehouseStock";
import WarehouseScanner from "./pages/WarehouseScanner";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Reports from "./pages/Reports";
import MyReports from "./pages/MyReports";
import RequestAccess from "./pages/RequestAccess";
import Tasks from "./pages/Tasks";
import MyTasks from "./pages/MyTasks";
import ActivityLog from "./pages/ActivityLog";
import NetProfit from "./pages/NetProfit";
import Analytics from "./pages/Analytics";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AdminPage from "./pages/Admin";
import "./index.css";

function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute permission="can_view_dashboard">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute permission="can_view_customers">
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute permission="can_view_products">
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/analysis"
              element={
                <ProtectedRoute permission="can_view_products">
                  <ProductAnalysis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/:id"
              element={
                <ProtectedRoute permission="can_view_products">
                  <ProductDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/warehouse"
              element={
                <ProtectedRoute permission="can_view_products">
                  <WarehouseStock />
                </ProtectedRoute>
              }
            />
            <Route
              path="/warehouse/scanner"
              element={
                <ProtectedRoute permission="can_view_products">
                  <WarehouseScanner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute permission="can_view_orders">
                  <Orders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/missing"
              element={
                <ProtectedRoute permission="can_view_orders">
                  <MissingOrders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute permission="can_view_orders">
                  <OrderDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute permission="can_manage_users">
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute permission="can_view_all_reports">
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-reports"
              element={
                <ProtectedRoute>
                  <MyReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/request-access"
              element={
                <ProtectedRoute>
                  <RequestAccess />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute permission="can_manage_tasks">
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tasks"
              element={
                <ProtectedRoute>
                  <MyTasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity-log"
              element={
                <ProtectedRoute permission="can_view_activity_log">
                  <ActivityLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="/net-profit"
              element={
                <AdminRoute>
                  <NetProfit />
                </AdminRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <AdminRoute>
                  <Analytics />
                </AdminRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </StoreProvider>
  );
}

export default App;
