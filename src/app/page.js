import Link from "next/link";
import { ArrowRight, LogIn, UserPlus, Zap } from "lucide-react";

export default function Home() {
  return <main className="min-h-screen px-4 py-6 sm:px-8">
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-center">
      <section className="rounded-[2rem] bg-slate-950 px-7 py-14 text-white shadow-2xl sm:px-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold"><Zap className="h-4 w-4 text-yellow-300" />FieldFlow</div>
        <p className="mt-7 text-sm font-bold uppercase tracking-[0.18em] text-blue-200">Field workforce management</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Your field operations, in one flow.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Your company assigns your role. FieldFlow automatically opens only the modules and data that role permits.</p>
      </section>
      <section className="mt-6 grid gap-5 sm:grid-cols-2">
        <Link href="/login/workspace" className="group card p-6 transition hover:-translate-y-1 hover:shadow-xl"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><LogIn /></span><h2 className="mt-6 text-xl font-bold">Sign in</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use your work credentials. Your assigned permissions determine the workspace you enter.</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Continue<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>
        <Link href="/signup/workspace" className="group card p-6 transition hover:-translate-y-1 hover:shadow-xl"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white"><UserPlus /></span><h2 className="mt-6 text-xl font-bold">Request an account</h2><p className="mt-2 text-sm leading-6 text-slate-500">Create an account, then an Owner can assign your company-specific role and team.</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Create account<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>
      </section>
    </div>
  </main>;
}
