"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ClipboardList, Grid2X2, LogOut, ReceiptText, UserRound, WalletCards } from "lucide-react";
import { EmployeeTrackingProvider } from "@/components/EmployeeTrackingContext";
import { AccessProvider } from "@/components/AccessContext";
import { signOutUser, useAuthGuard } from "@/lib/authClient";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";

const nav = [
  ["", "Home", Grid2X2, [PERMISSIONS.dashboardView]],
  ["tasks", "My Work", ClipboardList, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf]],
  ["attendance", "Attendance", Bell, [PERMISSIONS.attendanceViewSelf]],
  ["reports", "Reports", ReceiptText, [PERMISSIONS.reportsSubmit]],
  ["expenses", "Expenses", WalletCards, [PERMISSIONS.expensesSubmit]],
  ["profile", "Me", UserRound, []]
];

export default function EmployeeShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAuthGuard("employee");
  const [notifications, setNotifications] = useState(false);

  if (!access) return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><p>Checking your session…</p></div>;

  const name = access.profile?.full_name || "FieldFlow user";
  const dynamicRoleName = access.role?.name || "Workspace member";
  const visibleNav = nav.filter(item => !item[3].length || hasAnyPermission(access, item[3]));

  async function logout() {
    await signOutUser();
    router.push("/login/employee");
  }

  return <AccessProvider access={access}><EmployeeTrackingProvider><div className="min-h-screen bg-[#f7f9fc] pb-24">
    <header className="sticky top-0 z-[700] bg-gradient-to-r from-[#07132d] to-[#1c2b5b] text-white">
      <div className="mx-auto flex h-20 max-w-[1540px] items-center px-5 sm:px-8">
        <div><strong className="text-lg">FieldFlow</strong><p className="max-w-44 truncate text-xs uppercase tracking-widest text-blue-200">{dynamicRoleName}</p></div>
        <div className="relative ml-auto flex items-center gap-3">
          <button onClick={() => setNotifications(value => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><Bell className="h-5 w-5" /></button>
          <button onClick={logout} aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><LogOut className="h-5 w-5" /></button>
          <div className="hidden text-right sm:block"><strong className="block text-sm">{name}</strong><span className="block text-xs text-blue-200">{dynamicRoleName}</span></div>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-500 font-bold">{name.charAt(0).toUpperCase()}</div>
          {notifications && <div className="absolute right-0 top-14 w-80 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl"><p className="font-bold">Notifications</p><p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">Your permitted work updates appear here.</p></div>}
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1540px] p-5 sm:p-8">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-3xl items-center justify-around overflow-x-auto px-2">
        {visibleNav.map(([slug, label, Icon]) => {
          const href = `/employee${slug ? `/${slug}` : ""}`;
          const active = pathname === href;
          return <Link href={href} key={href} className={`flex min-w-16 shrink-0 flex-col items-center gap-1 text-xs font-semibold ${active ? "text-blue-600" : "text-slate-500"}`}><Icon className="h-5 w-5" />{label}</Link>;
        })}
      </div>
    </nav>
  </div></EmployeeTrackingProvider></AccessProvider>;
}
