import { notFound } from "next/navigation";

const validRoles = new Set(["employee", "manager", "admin"]);

export default async function RoleLayout({ children, params }) {
  const { role } = await params;
  if (!validRoles.has(role)) notFound();
  return children;
}
