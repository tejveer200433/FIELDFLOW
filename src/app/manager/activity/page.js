"use client";

import ManagerTeamActivityPage from "@/frontend/features/activity/components/ManagerTeamActivityPage";
import RoleShell from "@/frontend/components/layout/RoleShell";

export default function TeamActivityRoute() {
  return <RoleShell role="manager"><ManagerTeamActivityPage /></RoleShell>;
}
