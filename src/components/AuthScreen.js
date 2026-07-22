"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, ShieldCheck, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { saveIdentity } from "@/lib/authClient";

const allowed = ["employee", "manager", "admin"];
const roleCopy = { employee: ["Employee", "Field technicians · mobile-first console"], manager: ["Manager", "Coordinate teams, tasks and approvals"], admin: ["Administrator", "Workspace, access and operations control"] };

export default function AuthScreen({ role, mode }) {
  const router = useRouter();
  const currentRole = allowed.includes(role) ? role : "employee";
  const signingUp = mode === "signup";
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");

  async function submit(event) {
    event.preventDefault(); setError(""); setMessage("");
    if (signingUp && password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase is not configured. Add the project URL and anon key to .env.local.");
      if (signingUp) {
        const {data,error:authError}=await supabase.auth.signUp({email,password,options:{data:{full_name:name.trim(),requested_role:currentRole}}});
        if(authError) throw authError;
        if(!data.session){setMessage("Account created. Check your email to confirm it, then sign in.");return;}
        const {data:profile,error:profileError}=await supabase.from("profiles").select("id,email,full_name,role,approval_status").eq("id",data.user.id).single();
        if(profileError) throw profileError;
        if(profile.approval_status!=="approved"){await supabase.auth.signOut();setMessage(`Your ${currentRole} account request was submitted and must be approved by an administrator.`);return;}
        saveIdentity({role:profile.role,email:profile.email,name:profile.full_name,id:profile.id}); router.push(`/${profile.role}`);
      } else {
        const {data,error:authError}=await supabase.auth.signInWithPassword({email,password}); if(authError) throw authError;
        const {data:profile,error:profileError}=await supabase.from("profiles").select("id,email,full_name,role,approval_status,active").eq("id",data.user.id).single(); if(profileError) throw profileError;
        if(profile.approval_status==="pending"){await supabase.auth.signOut();throw new Error("Your account is waiting for administrator approval.");}
        if(!profile.active||profile.approval_status==="rejected"){await supabase.auth.signOut();throw new Error("This account is not active. Contact your administrator.");}
        if(profile.role!==currentRole){await supabase.auth.signOut();throw new Error(`This account belongs to the ${profile.role} workspace. Choose the correct role.`);}
        saveIdentity({role:profile.role,email:profile.email,name:profile.full_name,id:profile.id}); router.push(`/${currentRole}`);
      }
    } catch (failure) { setError(failure.message || "Authentication failed."); } finally { setLoading(false); }
  }

  async function resetPassword(){setError("");setMessage("");if(!email)return setError("Enter your email first.");if(!supabase)return setError("Supabase is not configured.");const{error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/reset-password`});if(resetError)setError(resetError.message);else setMessage("Password reset instructions were sent to your email.");}

  return <main className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="hidden min-h-screen flex-col bg-gradient-to-br from-[#09152f] to-[#1c2855] p-14 text-white lg:flex"><Link href="/" className="inline-flex items-center gap-2 text-slate-200"><ArrowLeft className="h-4 w-4"/>Back to home</Link><div className="mt-auto max-w-xl"><span className="grid h-16 w-16 place-items-center rounded-full bg-blue-500">{signingUp?<ShieldCheck/>:<Zap/>}</span><h1 className="mt-8 text-4xl font-extrabold">{roleCopy[currentRole][0]} {signingUp?"registration":"sign in"}</h1><p className="mt-4 text-xl text-slate-300">{roleCopy[currentRole][1]}</p><div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6"><p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Role-protected account</p><p className="mt-3 leading-7 text-slate-200">Employee accounts activate after email confirmation. Manager and administrator requests require approval by an existing administrator.</p></div></div></section>
    <section className="grid min-h-screen place-items-center bg-[#f8fafc] px-6 py-12"><div className="w-full max-w-lg"><p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-600">FieldFlow · {currentRole}</p><h2 className="mt-3 text-4xl font-extrabold">{signingUp?"Create your account":"Sign in to continue"}</h2><p className="mt-2 text-lg text-slate-500">{signingUp?`Join the ${currentRole} workspace.`:"Use your work credentials to enter the workspace."}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">{signingUp&&<label className="block"><span className="label font-bold">Full name</span><input required value={name} onChange={e=>setName(e.target.value)} className="input py-3.5"/></label>}<label className="block"><span className="label font-bold">Work email</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="input py-3.5" placeholder="you@company.com"/></label><label className="block"><span className="label font-bold">Password</span><span className="relative block"><input required minLength="8" type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} className="input py-3.5 pr-12"/><button type="button" aria-label="Toggle password" onClick={()=>setShowPassword(v=>!v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">{showPassword?<EyeOff/>:<Eye/>}</button></span></label>{signingUp&&<label className="block"><span className="label font-bold">Confirm password</span><input required minLength="8" type={showPassword?"text":"password"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="input py-3.5"/></label>}{!signingUp&&<button type="button" onClick={resetPassword} className="text-sm font-bold text-blue-600">Forgot password?</button>}{error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{message&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<button disabled={loading} className="btn-primary w-full rounded-full py-4">{loading?"Please wait…":signingUp?"Create account":"Sign in"}</button></form>
      <p className="mt-7 text-center text-sm text-slate-500">{signingUp?"Already registered?":"New to FieldFlow?"} <Link className="font-bold text-blue-600" href={`/${signingUp?"login":"signup"}/${currentRole}`}>{signingUp?"Sign in":"Create an account"}</Link></p><p className="mt-3 text-center text-sm text-slate-500">Wrong role? <Link className="font-bold text-blue-600" href="/">Choose a different role</Link></p>{!supabase&&<p className="mt-5 rounded-xl bg-amber-50 p-3 text-center text-xs font-semibold text-amber-700">Configuration required: add Supabase credentials to .env.local. Demo login is disabled.</p>}
    </div></section>
  </main>;
}
