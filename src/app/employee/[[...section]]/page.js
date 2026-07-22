"use client";

import { useParams } from "next/navigation";
import EmployeeShell from "@/components/EmployeeShell";
import EmployeeWorkspace from "@/components/EmployeeWorkspace";

export default function EmployeePage() {
  const { section = [] } = useParams();
  return <EmployeeShell><EmployeeWorkspace section={section[0] || ""} /></EmployeeShell>;
}
