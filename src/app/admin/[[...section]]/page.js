"use client";

import { useParams } from "next/navigation";
import ManagerWorkspace from "@/components/ManagerWorkspace";
import RoleShell from "@/components/RoleShell";

export default function AdminPage() {
  const { section = [] } = useParams();
  return <RoleShell role="admin"><ManagerWorkspace section={section[0] || ""} /></RoleShell>;
}
