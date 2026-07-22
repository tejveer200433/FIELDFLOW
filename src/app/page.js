import Link from "next/link";
import { BriefcaseBusiness, ShieldCheck, UsersRound, Zap, ArrowRight } from "lucide-react";

const roles = [
  ["employee", "Employee", "See assigned work, check in, submit reports and share your location.", UsersRound, "bg-blue-600"],
  ["manager", "Manager", "Coordinate your field team, assign work and track daily operations.", BriefcaseBusiness, "bg-violet-600"],
  ["admin", "Administrator", "Manage employees, clients, departments, roles and workspace settings.", ShieldCheck, "bg-emerald-600"]
];

export default function Home() {
  return <main className="min-h-screen px-4 py-6 sm:px-8"><div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-center">
    <section className="rounded-[2rem] bg-slate-950 px-7 py-14 text-white shadow-2xl sm:px-12">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold"><Zap className="h-4 w-4 text-yellow-300" /> FieldFlow</div>
      <p className="mt-7 text-sm font-bold uppercase tracking-[0.18em] text-blue-200">Field workforce management</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Your field operations, in one flow.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Manage tasks, attendance, expenses, daily reports, teams and live locations from one secure workspace.</p>
    </section>
    <section className="mt-6 grid gap-5 md:grid-cols-3">{roles.map(([role, title, description, Icon, color]) => <Link key={role} href={`/login/${role}`} className="group card p-6 transition hover:-translate-y-1 hover:shadow-xl"><div className={`grid h-12 w-12 place-items-center rounded-2xl ${color} text-white`}><Icon className="h-6 w-6" /></div><h2 className="mt-6 text-xl font-bold">{title}</h2><p className="mt-2 min-h-14 text-sm leading-6 text-slate-500">{description}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Continue as {title}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>)}</section>
  </div></main>;
}
