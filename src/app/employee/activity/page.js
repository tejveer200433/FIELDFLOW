"use client";

import EmployeeActivityPage from "@/frontend/features/activity/components/EmployeeActivityPage";
import EmployeeShell from "@/frontend/components/layout/EmployeeShell";

export default function MyActivityRoute() {
  return <EmployeeShell><EmployeeActivityPage /></EmployeeShell>;
}
