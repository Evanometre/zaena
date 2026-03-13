//app/context/PermissionGuard.tsx
import React from "react";
import { ActivityIndicator } from "react-native";
import { usePermissions } from "../context/PermissionsContext";

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  /** Optional: What to show if access is denied */
  fallback?: React.ReactNode;
  /** Optional: Show a spinner while checking permissions */
  showLoading?: boolean;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  children,
  fallback = null,
  showLoading = false,
}) => {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return showLoading ? <ActivityIndicator /> : null;
  }

  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
};
