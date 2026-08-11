"use client";

import { useParams } from "next/navigation";
import EmployeeShell from "@/frontend/components/layout/EmployeeShell";
import EmployeeWorkspace from "@/frontend/features/employee/components/EmployeeWorkspace";

export default function EmployeePage() {
  const { section = [] } = useParams();
  return <EmployeeShell><EmployeeWorkspace section={section[0] || ""} /></EmployeeShell>;
}
