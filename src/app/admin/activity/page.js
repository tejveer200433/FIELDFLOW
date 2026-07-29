"use client";

import AdminWorkforceActivityPage from "@/components/activity/AdminWorkforceActivityPage";
import RoleShell from "@/components/RoleShell";

export default function WorkforceActivityRoute() {
  return <RoleShell role="admin"><AdminWorkforceActivityPage /></RoleShell>;
}
