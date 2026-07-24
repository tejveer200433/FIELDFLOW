"use client";

import { createContext, useContext } from "react";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";

const AccessContext = createContext(null);

export function AccessProvider({ access, children }) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  return useContext(AccessContext);
}

export function useCan(permission) {
  return hasPermission(useAccess(), permission);
}

export function useCanAny(permissions) {
  return hasAnyPermission(useAccess(), permissions);
}
