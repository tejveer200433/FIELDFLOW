"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Play,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { supabase } from "@/frontend/lib/supabase";
import { saveIdentity } from "@/frontend/lib/authClient";
import { workspaceForAccess } from "@/shared/permissions";

const allowed = ["workspace", "employee", "manager", "admin"];
const roleCopy = {
  employee: ["Employee", "Field technicians · mobile-first console"],
  manager: ["Manager", "Coordinate teams, tasks and approvals"],
  admin: ["Administrator", "Workspace, access and operations control"],
  workspace: [
    "Workspace",
    "Your access is determined by your assigned role and permissions",
  ],
};

function BrandMark() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 shadow-[0_12px_30px_rgba(52,211,153,0.2)]">
        <Zap className="h-5 w-5 fill-white text-white" />
      </span>
      <span>
        <span className="block text-xl font-extrabold tracking-tight text-white">
          FieldFlow
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          Field workforce management
        </span>
      </span>
    </span>
  );
}

function PhonePreview() {
  return (
    <div className="absolute bottom-10 right-[7%] hidden h-[66%] w-[31%] min-w-56 rotate-3 rounded-[2.4rem] border-[7px] border-slate-950 bg-[#07111f] p-3 shadow-[0_35px_80px_rgba(0,0,0,0.65)] xl:block">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-700" />
      <div className="flex items-center justify-between text-[9px] text-slate-300">
        <span>9:41</span>
        <span className="font-semibold text-emerald-300">Live tracking</span>
      </div>
      <div className="relative mt-3 h-[45%] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1c2d]">
        <svg
          viewBox="0 0 220 220"
          className="absolute inset-0 h-full w-full opacity-80"
          aria-hidden="true"
        >
          <path d="M0 45 220 8M0 98 220 55M0 157 220 116M40 220 220 170" stroke="#1e3345" strokeWidth="2" />
          <path d="M35 0 70 220M100 0 130 220M170 0 194 220" stroke="#1e3345" strokeWidth="2" />
          <path d="M45 190 C58 151 122 165 111 121 S133 59 184 43" fill="none" stroke="#34d399" strokeLinecap="round" strokeWidth="6" />
          <circle cx="45" cy="190" r="11" fill="#2563eb" stroke="#93c5fd" strokeWidth="4" />
          <circle cx="184" cy="43" r="9" fill="#10b981" stroke="#a7f3d0" strokeWidth="4" />
        </svg>
        <span className="absolute left-3 top-3 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300">
          Team B · in progress
        </span>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-white">
        <div className="flex items-center gap-2 text-[10px] text-emerald-300">
          <MapPin className="h-3 w-3" /> Current job
        </div>
        <p className="mt-2 text-sm font-bold">Site inspection</p>
        <p className="mt-1 text-[9px] text-slate-400">Gurugram · Phase 2</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" />
        </div>
        <div className="mt-2 flex justify-between text-[8px] text-slate-400">
          <span>65% complete</span>
          <span className="text-emerald-300">On schedule</span>
        </div>
      </div>
      <div className="absolute inset-x-8 bottom-4 grid grid-cols-3 gap-2 text-center text-[8px] text-slate-400">
        <span>Details</span><span>Update</span><span>More</span>
      </div>
    </div>
  );
}

function HeroPanel() {
  const stats = [
    ["250+", "Active teams"],
    ["1.2K+", "Jobs completed"],
    ["98.5%", "On-time rate"],
    ["24/7", "Support"],
  ];

  return (
    <section
      className="relative hidden min-h-screen overflow-hidden bg-[#06111f] p-10 text-white lg:flex lg:flex-col xl:p-14"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(3,10,22,.94) 0%, rgba(3,10,22,.72) 48%, rgba(3,10,22,.16) 100%), linear-gradient(0deg, rgba(3,10,22,.78) 0%, transparent 52%), url('/images/fieldflow-login-hero.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="relative z-10">
        <BrandMark />
      </div>

      <div className="relative z-10 my-auto max-w-lg pb-20 xl:max-w-xl">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Connected operations
        </p>
        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] xl:text-6xl">
          One platform.
          <br />
          Every field, <span className="text-emerald-400">connected.</span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-7 text-slate-300 xl:text-lg">
          From job assignment to real-time tracking, manage your entire field
          operation seamlessly.
        </p>

        <div className="mt-9 grid max-w-xl grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45 shadow-2xl backdrop-blur-md">
          {stats.map(([value, label]) => (
            <div key={label} className="border-r border-white/10 px-3 py-5 last:border-r-0 xl:px-5">
              <p className="text-lg font-extrabold xl:text-2xl">{value}</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-400 xl:text-[10px]">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-9 flex items-center gap-4 text-sm text-slate-200">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.18)]">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
          <span><strong className="block text-white">See FieldFlow in action</strong><span className="text-xs text-slate-400">A connected workday, at a glance</span></span>
        </div>
      </div>

      <PhonePreview />
      <Link href="/" className="absolute bottom-8 left-10 z-20 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white xl:left-14">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </Link>
    </section>
  );
}

export default function AuthScreen({ role, mode }) {
  const router = useRouter();
  const currentRole = allowed.includes(role) ? role : "workspace";
  const requestedRole = currentRole === "workspace" ? "employee" : currentRole;
  const signingUp = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (signingUp && password !== confirmPassword) {
      return setError("Passwords do not match.");
    }
    setLoading(true);
    try {
      if (!supabase) {
        throw new Error(
          "Supabase is not configured. Add the project URL and anon key to .env.local.",
        );
      }
      if (signingUp) {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim(), requested_role: requestedRole } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage("Account created. Check your email to confirm it, then sign in.");
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,email,full_name,role,approval_status")
          .eq("id", data.user.id)
          .single();
        if (profileError) throw profileError;
        if (profile.approval_status !== "approved") {
          await supabase.auth.signOut();
          setMessage(
            "Your account request was submitted and must be approved by an access administrator.",
          );
          return;
        }
        const { data: accessData, error: accessError } = await supabase.rpc(
          "get_my_access_context",
        );
        if (accessError || !accessData) {
          throw new Error("Your permissions could not be verified. Please try again.");
        }
        const access = accessData;
        saveIdentity({
          role: profile.role,
          email: profile.email,
          name: profile.full_name,
          id: profile.id,
          access,
        });
        router.push(`/${workspaceForAccess(access)}`);
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,email,full_name,role,approval_status,active")
          .eq("id", data.user.id)
          .single();
        if (profileError) throw profileError;
        if (profile.approval_status === "pending") {
          await supabase.auth.signOut();
          throw new Error("Your account is waiting for administrator approval.");
        }
        if (!profile.active || profile.approval_status === "rejected") {
          await supabase.auth.signOut();
          throw new Error("This account is not active. Contact your administrator.");
        }
        const { data: accessData, error: accessError } = await supabase.rpc(
          "get_my_access_context",
        );
        if (accessError || !accessData) {
          throw new Error("Your permissions could not be verified. Please try again.");
        }
        const access = accessData;
        saveIdentity({
          role: profile.role,
          email: profile.email,
          name: profile.full_name,
          id: profile.id,
          access,
        });
        router.push(`/${workspaceForAccess(access)}`);
      }
    } catch (failure) {
      setError(failure.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setError("");
    setMessage("");
    if (!email) return setError("Enter your email first.");
    if (!supabase) return setError("Supabase is not configured.");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) setError(resetError.message);
    else setMessage("Password reset instructions were sent to your email.");
  }

  return (
    <main className="grid min-h-screen bg-[#06111f] lg:grid-cols-[1.12fr_0.88fr]">
      <HeroPanel />

      <section className="relative grid min-h-screen place-items-center overflow-hidden bg-[#06111f] px-6 py-12 text-white sm:px-10 lg:px-12">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_85%_18%,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_20%_80%,rgba(37,99,235,0.10),transparent_28%)]" />
        <div className="pointer-events-none absolute right-[-8rem] top-[20%] h-80 w-80 rounded-full border border-emerald-400/10 shadow-[0_0_100px_rgba(16,185,129,0.05)]" />

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-10 lg:hidden"><BrandMark /></div>

          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> Secure {roleCopy[currentRole][0]} access
          </p>
          <h2 className="text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl">
            {signingUp ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {signingUp
              ? `Join the ${currentRole} workspace with your company credentials.`
              : "Log in to your workspace and continue your workday."}
          </p>

          <form onSubmit={submit} className="mt-9 space-y-5">
            {signingUp && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-300">Full name</span>
                <span className="relative block">
                  <CheckCircle2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10" placeholder="Your full name" />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-300">Work email</span>
              <span className="relative block">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10" placeholder="you@company.com" />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-300">Password</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input required minLength="8" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-3.5 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10" placeholder="Enter your password" />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-white">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {signingUp && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-300">Confirm password</span>
                <span className="relative block">
                  <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input required minLength="8" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10" placeholder="Repeat your password" />
                </span>
              </label>
            )}

            {!signingUp && (
              <div className="flex justify-end">
                <button type="button" onClick={resetPassword} className="text-xs font-bold text-emerald-400 transition hover:text-emerald-300">Forgot password?</button>
              </div>
            )}

            {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
            {message && <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}

            <button disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-5 py-4 text-sm font-extrabold text-[#03150e] shadow-[0_15px_45px_rgba(16,185,129,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_55px_rgba(16,185,129,0.3)] disabled:cursor-wait disabled:opacity-60">
              {loading ? "Please wait…" : signingUp ? "Create account" : "Log in"}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-400">
            {signingUp ? "Already registered?" : "Don't have access to FieldFlow?"}{" "}
            <Link className="font-bold text-emerald-400 transition hover:text-emerald-300" href={`/${signingUp ? "login" : "signup"}/${currentRole}`}>
              {signingUp ? "Sign in" : "Request an account"}
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-slate-500 lg:hidden">
            <Link className="transition hover:text-white" href="/">Back to FieldFlow home</Link>
          </p>

          <div className="mt-10 flex items-center justify-center gap-3 border-t border-white/10 pt-7 text-slate-500">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-emerald-400/15 bg-emerald-400/5 text-emerald-400"><ShieldCheck className="h-5 w-5" /></span>
            <span className="text-xs leading-5"><strong className="block text-slate-300">Enterprise-grade security</strong>Your access is protected at every step.</span>
          </div>

          {!supabase && (
            <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-center text-xs font-semibold text-amber-200">
              Configuration required: add Supabase credentials to .env.local. Demo login is disabled.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
