"use client";

import { useParams } from "next/navigation";
import ManagerWorkspace from "@/frontend/features/manager/components/ManagerWorkspace";
import RoleShell from "@/frontend/components/layout/RoleShell";

export default function AdminPage() {
  const { section = [] } = useParams();
  return <RoleShell role="admin"><ManagerWorkspace role="admin" section={section[0] || ""} /></RoleShell>;
}
