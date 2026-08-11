"use client";

import AdminWorkforceActivityPage from "@/frontend/features/activity/components/AdminWorkforceActivityPage";
import RoleShell from "@/frontend/components/layout/RoleShell";

export default function WorkforceActivityRoute() {
  return <RoleShell role="admin"><AdminWorkforceActivityPage /></RoleShell>;
}
