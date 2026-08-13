"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  Grid2X2,
  LogOut,
  Menu,
  Search,
  Sparkles,
  UserRound,
  WalletCards,
  X,
  Zap
} from "lucide-react";
import { EmployeeTrackingProvider } from "@/frontend/features/activity/context/EmployeeTrackingContext";
import { AccessProvider } from "@/frontend/contexts/AccessContext";
import { signOutUser, useAuthGuard } from "@/frontend/lib/authClient";
import { formatTimeAgo, useNotifications } from "@/frontend/lib/notificationsClient";
import { hasAnyPermission, PERMISSIONS } from "@/shared/permissions";
import WorkspaceLoadingShell from "@/frontend/components/layout/WorkspaceLoadingShell";

const nav = [
  ["", "My Workday", Grid2X2, [PERMISSIONS.dashboardView]],
  ["tasks", "My Work", ClipboardList, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf]],
  ["attendance", "Attendance", Clock3, [PERMISSIONS.attendanceViewSelf]],
  ["reports", "Daily Reports", FileText, [PERMISSIONS.reportsSubmit]],
  ["expenses", "Expenses", WalletCards, [PERMISSIONS.expensesSubmit]],
  ["profile", "Me", UserRound, []],
  ["activity", "My Activity", Activity, ["activity.view_self"]]
];

export default function EmployeeShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAuthGuard("employee");
  const { items: notifications, unreadCount, markAllRead } = useNotifications({ enabled: Boolean(access) });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [query, setQuery] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    setAvatarUrl(access?.profile?.avatarUrl || "");
    const updateAvatar = event => setAvatarUrl(event.detail?.avatarUrl || "");
    window.addEventListener("fieldflow:profile-avatar", updateAvatar);
    return () => window.removeEventListener("fieldflow:profile-avatar", updateAvatar);
  }, [access?.profile?.avatarUrl]);

  if (!access) return <WorkspaceLoadingShell employee />;

  const name = access.profile?.full_name || "FieldFlow user";
  const dynamicRoleName = access.role?.name || "Workspace member";
  const department = access.profile?.department || "";
  const visibleNav = nav.filter(item => !item[3].length || hasAnyPermission(access, item[3]));

  async function logout() {
    await signOutUser();
    router.push("/login/employee");
  }

  function search(event) {
    event.preventDefault();
    const value = query.trim().toLowerCase();
    if (!value) return;
    if (/attendance|time|shift|break|leave/.test(value)) router.push("/employee/attendance");
    else if (/expense|claim|cost/.test(value)) router.push("/employee/expenses");
    else if (/report|summary/.test(value)) router.push("/employee/reports");
    else if (/activity|tracking|session/.test(value)) router.push("/employee/activity");
    else if (/profile|account|me/.test(value)) router.push("/employee/profile");
    else router.push("/employee/tasks");
    setQuery("");
  }

  const sidebar = <aside className={`flex h-full flex-col border-r border-slate-200 bg-white p-4 text-slate-900 transition-[width] duration-200 ${collapsed ? "w-[82px]" : "w-[226px]"}`}>
    <div className="flex items-center gap-3 px-1 py-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600"><Zap className="h-5 w-5" /></span>
      {!collapsed && <div className="min-w-0"><p className="text-lg font-extrabold leading-none tracking-tight">FieldFlow</p><p className="mt-1.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">My workspace</p></div>}
      <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 lg:hidden"><X className="h-5 w-5" /></button>
    </div>
    <nav aria-label="Employee navigation" className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto">
      {visibleNav.map(([slug, label, Icon]) => {
        const href = `/employee${slug ? `/${slug}` : ""}`;
        const active = pathname === href;
        return <Link title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} key={href} href={href} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? "bg-gradient-to-r from-indigo-50 to-violet-100 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-800"}`} />{!collapsed && <span>{label}</span>}</Link>;
      })}
    </nav>
    <div className="mt-4 border-t border-slate-200 pt-4">
      {!collapsed && <div className="mb-3 flex items-center gap-3 rounded-xl p-2.5"><span role={avatarUrl ? "img" : undefined} aria-label={avatarUrl ? `${name} profile photo` : undefined} style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 bg-cover bg-center text-sm font-extrabold text-white ${avatarUrl ? "text-transparent" : ""}`}>{name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{name}</strong><small className="mt-1 block truncate text-[10px] text-slate-500">{dynamicRoleName}</small></span><button aria-label="Sign out" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut className="h-4 w-4" /></button></div>}
      <button onClick={() => setCollapsed(value => !value)} className="hidden min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-800 lg:flex"><ChevronLeft className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} />{!collapsed && "Collapse"}</button>
      {collapsed && <button aria-label="Sign out" onClick={logout} className="mt-2 flex min-h-10 w-full items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut className="h-4 w-4" /></button>}
    </div>
  </aside>;

  return <AccessProvider access={access}><EmployeeTrackingProvider><div className="min-h-screen bg-[#f0f3f8] lg:flex lg:p-2">
    <div className={`fixed inset-y-0 left-0 z-[900] overflow-hidden transition-transform lg:sticky lg:top-2 lg:h-[calc(100vh-1rem)] lg:rounded-l-2xl ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>{sidebar}</div>
    {mobileOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[800] bg-slate-950/45 backdrop-blur-sm lg:hidden" />}
    <div className="min-w-0 flex-1 bg-white lg:rounded-r-2xl lg:shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
      <header className="sticky top-0 z-[700] flex h-[68px] items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="icon-button h-11 w-11 lg:hidden"><Menu className="h-5 w-5" /></button>
        <form onSubmit={search} className="relative ml-auto hidden w-full max-w-[360px] sm:block"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="input border-slate-200 bg-slate-50/80 py-2.5 pl-11" placeholder="Search anything…" aria-label="Search employee workspace" /></form>
        <div className="relative ml-auto flex items-center gap-2">
          <button aria-label="Open FieldFlow AI" onClick={() => router.push("/employee#fieldflow-ai")} className="icon-button h-11 w-11 text-violet-600" title="FieldFlow AI"><Sparkles className="h-[18px] w-[18px]" /></button>
          <button aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} onClick={() => setPanel(panel === "notifications" ? "" : "notifications")} className="icon-button h-11 w-11"><Bell className="h-[18px] w-[18px]" />{unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-extrabold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
          <button aria-label="Help" onClick={() => setPanel(panel === "help" ? "" : "help")} className="icon-button hidden h-11 w-11 sm:grid"><CircleHelp className="h-[18px] w-[18px]" /></button>
          <button aria-label="Open profile menu" onClick={() => setPanel(panel === "profile" ? "" : "profile")} className="ml-1 flex min-h-11 items-center gap-3 rounded-full border border-slate-200 bg-white p-1.5 pr-3 text-left transition hover:border-blue-200 hover:shadow-sm"><span style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} className={`grid h-9 w-9 place-items-center rounded-full bg-blue-100 bg-cover bg-center text-sm font-extrabold text-blue-700 ${avatarUrl ? "text-transparent" : ""}`}>{name.charAt(0).toUpperCase()}</span><span className="hidden min-w-0 sm:block"><strong className="block max-w-36 truncate text-xs text-slate-900">{name}</strong><small className="mt-0.5 block max-w-36 truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{dynamicRoleName}</small></span></button>
          {panel && <div className="absolute right-0 top-14 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            {panel === "notifications" && <><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Inbox</p><h3 className="mt-1 font-extrabold">Notifications</h3></div>{unreadCount > 0 && <button onClick={markAllRead} className="text-xs font-bold text-blue-600 hover:underline">Mark all read</button>}</div><div className="mt-3 max-h-96 space-y-2 overflow-y-auto">{notifications.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">You’re all caught up.</p>}{notifications.map(item => <article key={item.id} className={`rounded-xl border p-3 text-sm ${item.read ? "border-slate-100" : "border-blue-100 bg-blue-50/70"}`}><p className="font-bold text-slate-800">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.body}</p><time className="mt-1 block text-[10px] text-slate-400">{formatTimeAgo(item.createdAt)}</time></article>)}</div></>}
            {panel === "help" && <><h3 className="font-extrabold">Your FieldFlow workspace</h3><p className="mt-2 text-sm leading-6 text-slate-500">Navigation only shows capabilities granted by your organisation. Contact your administrator if something you need is unavailable.</p><button onClick={() => setPanel("")} className="btn-primary mt-4 w-full">Got it</button></>}
            {panel === "profile" && <><div className="flex items-center gap-3"><span style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} className={`grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 bg-cover bg-center text-lg font-extrabold text-blue-700 ${avatarUrl ? "text-transparent" : ""}`}>{name.charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{name}</p><p className="truncate text-xs text-slate-500">{access.profile?.email}</p></div></div><dl className="mt-4 rounded-xl bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Role</dt><dd className="font-bold text-slate-800">{dynamicRoleName}</dd></div>{department && <div className="mt-2 flex justify-between gap-3"><dt className="text-slate-500">Department</dt><dd className="font-bold text-slate-800">{department}</dd></div>}</dl><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => { setPanel(""); router.push("/employee/profile"); }} className="btn-secondary">Profile</button><button onClick={logout} className="btn-secondary text-rose-600"><LogOut className="h-4 w-4" />Sign out</button></div></>}
          </div>}
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] overflow-x-clip bg-[#fbfcfe] p-4 pb-28 sm:p-6 sm:pb-28 lg:p-7 lg:pb-8 xl:p-8">{children}</main>
    </div>
    <nav aria-label="Mobile employee navigation" className="fixed inset-x-3 bottom-3 z-[700] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_16px_45px_rgba(15,23,42,0.2)] backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-around overflow-x-auto">{visibleNav.slice(0, 5).map(([slug, label, Icon]) => { const href = `/employee${slug ? `/${slug}` : ""}`; const active = pathname === href; return <Link aria-current={active ? "page" : undefined} href={href} key={href} className={`flex min-h-14 min-w-[66px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-bold transition ${active ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}><Icon className="h-[18px] w-[18px]" /><span className="max-w-16 truncate">{label}</span></Link>; })}</div>
    </nav>
  </div></EmployeeTrackingProvider></AccessProvider>;
}
