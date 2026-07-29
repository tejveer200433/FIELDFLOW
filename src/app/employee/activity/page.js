"use client";

import EmployeeActivityPage from "@/components/activity/EmployeeActivityPage";
import EmployeeShell from "@/components/EmployeeShell";

export default function MyActivityRoute() {
  return <EmployeeShell><EmployeeActivityPage /></EmployeeShell>;
}
