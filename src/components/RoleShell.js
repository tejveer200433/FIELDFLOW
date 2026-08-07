"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, BarChart3, Bell, BriefcaseBusiness, ChevronLeft, CircleHelp, ClipboardList, Clock3, LogOut, Map, Menu, ReceiptText, Search, Settings, ShieldCheck, Users, X, Zap } from "lucide-react";
import { signOutUser, useAuthGuard } from "@/lib/authClient";
import { AccessProvider } from "@/components/AccessContext";
import { formatTimeAgo, useNotifications } from "@/lib/notificationsClient";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";

const managementNav = [
  ["", "Dashboard", Zap, [PERMISSIONS.dashboardView]],
  ["map", "Live Map", Map, [PERMISSIONS.locationsViewTeam, PERMISSIONS.locationsViewAll]],
  ["employees", "Users", Users, [PERMISSIONS.employeesViewAll, PERMISSIONS.employeesManage, PERMISSIONS.tasksAssign, PERMISSIONS.teamsManage]],
  ["field-tasks", "Tasks", ClipboardList, [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll]],
  ["tasks", "Projects", ClipboardList, [PERMISSIONS.projectsManage, PERMISSIONS.projectsReview]],
  ["reports", "Reports", ReceiptText, [PERMISSIONS.reportsReview]],
  ["attendance", "Attendance", Clock3, [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll]],
  ["expenses", "Expenses", BriefcaseBusiness, [PERMISSIONS.expensesApprove]],
  ["analytics", "Analytics", BarChart3, [PERMISSIONS.employeesViewAll]]
];

const nav = {
  manager: [
    ...managementNav,
    ["activity", "Team Activity", Activity, ["activity.view_team", "activity.view_all"]]
  ],
  admin: [
    ...managementNav,
    ["attendance-locations", "Attendance locations", Map, [PERMISSIONS.settingsManage]],
    ["settings", "Roles & permissions", Settings, [PERMISSIONS.rolesManage, PERMISSIONS.teamsManage]],
    ["activity", "Workforce Activity", Activity, ["activity.view_all"]],
    ["monitoring-settings", "Monitoring Settings", ShieldCheck, ["activity.policies.manage"]]
  ]
};

export default function RoleShell({ role, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAuthGuard(role);
  const { items: notifications, unreadCount, markAllRead } = useNotifications();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [query, setQuery] = useState("");

  if (!access) return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><span className="mx-auto grid h-12 w-12 animate-pulse place-items-center rounded-full bg-blue-600"><Zap /></span><p className="mt-4 text-sm text-slate-300">Checking your session…</p></div></div>;

  const displayName = access.profile?.full_name || "FieldFlow user";
  const dynamicRoleName = access.role?.name || "Workspace member";
  const visibleNav = nav[role].filter(item => hasAnyPermission(access, item[3]));

  async function logout() {
    await signOutUser();
    router.push(`/login/${role}`);
  }

  function search(event) {
    event.preventDefault();
    const value = query.toLowerCase();
    if (!value.trim()) return;
    if (/employee|user|team/.test(value)) router.push(`/${role}/employees`);
    else if (/project|module|review/.test(value)) router.push(`/${role}/tasks`);
    else if (/task|assign/.test(value)) router.push(`/${role}/field-tasks`);
    else if (/report/.test(value)) router.push(`/${role}/reports`);
    else if (/attendance|check/.test(value)) router.push(`/${role}/attendance`);
    else if (/expense/.test(value)) router.push(`/${role}/expenses`);
    else router.push(`/${role}`);
    setQuery("");
  }

  const aside = <aside className={`flex h-full flex-col bg-[#0d1834] p-5 text-white transition-all ${collapsed ? "w-24" : "w-[310px]"}`}>
    <div className="flex items-center gap-3 px-1">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-500"><Zap className="h-6 w-6" /></span>
      {!collapsed && <div className="min-w-0"><p className="text-lg font-extrabold leading-none">FieldFlow</p><p className="mt-1 truncate text-xs font-bold uppercase tracking-widest text-blue-200">{dynamicRoleName}</p></div>}
      <button aria-label="Close menu" className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)}><X /></button>
    </div>
    <nav className="mt-10 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {visibleNav.map(([slug, label, Icon]) => {
        const href = `/${role}${slug ? `/${slug}` : ""}`;
        const active = pathname === href;
        return <Link title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} key={href} href={href} className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 font-semibold transition ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><Icon className={`h-5 w-5 shrink-0 ${active ? "text-blue-400" : ""}`} />{!collapsed && <span>{label}</span>}{active && !collapsed && <span className="ml-auto h-2 w-2 rounded-full bg-blue-400" />}</Link>;
      })}
    </nav>
    <div className="mt-auto border-t border-white/10 pt-5">
      <button onClick={() => setCollapsed(value => !value)} className="hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 hover:text-white lg:flex"><ChevronLeft className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} />{!collapsed && "Collapse"}</button>
      <button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10"><LogOut className="h-5 w-5" />{!collapsed && "Sign out"}</button>
    </div>
  </aside>;

  return <AccessProvider access={access}><div className="min-h-screen bg-[#f7f9fc] lg:flex">
    <div className={`fixed inset-y-0 left-0 z-[900] transition-transform lg:sticky lg:top-0 lg:h-screen ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>{aside}</div>
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[800] bg-slate-950/40 lg:hidden" />}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-[700] flex h-20 items-center gap-4 border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8">
        <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="icon-button lg:hidden"><Menu className="h-5 w-5" /></button>
        <form onSubmit={search} className="relative w-full max-w-xl"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="input py-3 pl-12" placeholder="Search users, tasks, reports…" aria-label="Search workspace" /></form>
        <div className="relative ml-auto flex items-center gap-2">
          <button aria-label="Notifications" onClick={() => setPanel(panel === "notifications" ? "" : "notifications")} className="icon-button">
            <Bell className="h-5 w-5 text-amber-500" />
            {unreadCount > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <button aria-label="Help" onClick={() => setPanel(panel === "help" ? "" : "help")} className="icon-button"><CircleHelp className="h-5 w-5" /></button>
          <button onClick={() => setPanel(panel === "profile" ? "" : "profile")} className="ml-1 flex items-center gap-3 rounded-full border border-slate-200 p-1.5 pr-4 text-left"><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{displayName.charAt(0).toUpperCase()}</span><span className="hidden sm:block"><strong className="block text-sm">{displayName}</strong><small className="block max-w-36 truncate uppercase tracking-wide text-slate-500">{dynamicRoleName}</small></span></button>
          {panel && <div className="absolute right-0 top-14 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            {panel === "notifications" && <>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Notifications</h3>
                {unreadCount > 0 && <button onClick={markAllRead} className="text-xs font-semibold text-blue-600 hover:underline">Mark all read</button>}
              </div>
              <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                {notifications.length === 0 && <p className="rounded-xl bg-blue-50 p-3 text-sm text-slate-500">Your permitted work queues update automatically.</p>}
                {notifications.map(item => <div key={item.id} className={`rounded-xl border p-3 text-sm ${item.read ? "border-slate-100 bg-white" : "border-blue-100 bg-blue-50"}`}>
                  <p className="font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-slate-600">{item.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatTimeAgo(item.createdAt)}</p>
                </div>)}
              </div>
            </>}
            {panel === "help" && <><h3 className="font-bold">Need help?</h3><p className="mt-2 text-sm leading-6 text-slate-500">Your sidebar contains only modules allowed by your assigned role.</p><button onClick={() => setPanel("")} className="btn-primary mt-4 w-full">Got it</button></>}
            {panel === "profile" && <><p className="font-bold">{displayName}</p><p className="text-sm text-slate-500">{access.profile?.email}</p><p className="mt-2 text-sm font-semibold text-blue-700">{dynamicRoleName}</p><button onClick={logout} className="btn-secondary mt-4 w-full"><LogOut className="h-4 w-4" />Sign out</button></>}
          </div>}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  </div></AccessProvider>;
}
