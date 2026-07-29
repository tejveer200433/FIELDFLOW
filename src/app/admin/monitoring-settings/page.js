"use client";

import MonitoringSettingsPage from "@/components/activity/MonitoringSettingsPage";
import RoleShell from "@/components/RoleShell";

export default function MonitoringSettingsRoute() {
  return <RoleShell role="admin"><MonitoringSettingsPage /></RoleShell>;
}
