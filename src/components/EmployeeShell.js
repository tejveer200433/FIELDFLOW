"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ClipboardList, Grid2X2, LogOut, ReceiptText, UserRound } from "lucide-react";
import { EmployeeTrackingProvider } from "@/components/EmployeeTrackingContext";
import { signOutUser, useAuthGuard } from "@/lib/authClient";

const nav = [["", "Home", Grid2X2], ["tasks", "Tasks", ClipboardList], ["attendance", "Attendance", Bell], ["reports", "Reports", ReceiptText], ["profile", "Me", UserRound]];

export default function EmployeeShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const authReady = useAuthGuard("employee");
  const [name, setName] = useState("Employee");
  const [notifications, setNotifications] = useState(false);
  useEffect(() => setName(localStorage.getItem("fieldflow-name") || "Employee"), []);
  async function logout() { await signOutUser(); router.push("/login/employee"); }
  if (!authReady) return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><p>Checking your session…</p></div>;
  return <EmployeeTrackingProvider><div className="min-h-screen bg-[#f7f9fc] pb-24"><header className="sticky top-0 z-[700] bg-gradient-to-r from-[#07132d] to-[#1c2b5b] text-white"><div className="mx-auto flex h-20 max-w-[1540px] items-center px-5 sm:px-8"><div><strong className="text-lg">FieldFlow</strong><p className="text-xs uppercase tracking-widest text-blue-200">Employee</p></div><div className="relative ml-auto flex items-center gap-3"><button onClick={() => setNotifications(value => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><Bell className="h-5 w-5" /></button><button onClick={logout} aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><LogOut className="h-5 w-5" /></button><div className="grid h-11 w-11 place-items-center rounded-full bg-blue-500 font-bold">{name.charAt(0)}</div>{notifications && <div className="absolute right-0 top-14 w-80 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl"><p className="font-bold">Notifications</p><p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">Your latest report status is available.</p></div>}</div></div></header><main className="mx-auto max-w-[1540px] p-5 sm:p-8">{children}</main><nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-20 max-w-2xl items-center justify-around">{nav.map(([slug, label, Icon]) => { const href = `/employee${slug ? `/${slug}` : ""}`; const active = pathname === href; return <Link href={href} key={href} className={`flex min-w-16 flex-col items-center gap-1 text-xs font-semibold ${active ? "text-blue-600" : "text-slate-500"}`}><Icon className="h-5 w-5" />{label}</Link>; })}</div></nav></div></EmployeeTrackingProvider>;
}
