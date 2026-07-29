"use client";

import ManagerTeamActivityPage from "@/components/activity/ManagerTeamActivityPage";
import RoleShell from "@/components/RoleShell";

export default function TeamActivityRoute() {
  return <RoleShell role="manager"><ManagerTeamActivityPage /></RoleShell>;
}
