// app/context/PermissionButton.tsx
import React from "react";
import {
    StyleSheet,
    TouchableOpacity,
    TouchableOpacityProps,
} from "react-native";
import { usePermissions } from "../context/PermissionsContext";

interface PermissionButtonProps extends TouchableOpacityProps {
  permission: string;
  /** Optional: Show button as disabled instead of hiding it */
  showDisabled?: boolean;
  children: React.ReactNode;
}

export const PermissionButton: React.FC<PermissionButtonProps> = ({
  permission,
  showDisabled = false,
  children,
  style,
  ...props
}) => {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    if (showDisabled) {
      return (
        <TouchableOpacity
          {...props}
          style={[style, styles.disabled]}
          disabled
          activeOpacity={1}
        >
          {children}
        </TouchableOpacity>
      );
    }
    return null; // Hide completely
  }

  return (
    <TouchableOpacity {...props} style={style}>
      {children}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4,
  },
});
