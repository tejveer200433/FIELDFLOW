"use client";

import MonitoringSettingsPage from "@/frontend/features/activity/components/MonitoringSettingsPage";
import RoleShell from "@/frontend/components/layout/RoleShell";

export default function MonitoringSettingsRoute() {
  return <RoleShell role="admin"><MonitoringSettingsPage /></RoleShell>;
}
