"use client";

import { useParams } from "next/navigation";
import ManagerWorkspace from "@/components/ManagerWorkspace";
import RoleShell from "@/components/RoleShell";

export default function ManagerPage() {
  const { section = [] } = useParams();
  return <RoleShell role="manager"><ManagerWorkspace section={section[0] || ""} /></RoleShell>;
}
