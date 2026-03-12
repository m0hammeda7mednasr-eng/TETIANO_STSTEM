import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, permission }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    // You can add a loading spinner here
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // If a permission is required, check for it.
  // If no permission prop is passed, just being logged in is enough.
  if (permission && !hasPermission(permission)) {
    // Redirect to dashboard if user doesn't have permission
    return <Navigate to="/dashboard" />;
  }

  return children;
}
