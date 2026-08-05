"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Supabase exchanges the recovery link's code for a session asynchronously, in the
// background, right after the client is created -- it is not guaranteed to be ready the
// instant this page renders. Waiting for either a PASSWORD_RECOVERY auth event or an
// existing session (and giving up after a short timeout) avoids submitting against a
// session that hasn't been established yet, and lets us show a clear message when the
// link itself is invalid, expired, or already used, instead of a raw "session missing" error.
function useRecoverySession() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    if (!supabase) { setStatus("unavailable"); return undefined; }
    let settled = false;
    const settle = value => { if (!settled) { settled = true; setStatus(value); } };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle("ready");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) settle("ready");
    });
    const timeout = window.setTimeout(() => settle("invalid"), 5000);

    return () => {
      listener?.subscription?.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  return status;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const recoveryStatus = useRecoverySession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    if (!supabase) return setError("Connect Supabase before using password recovery.");
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); return; }
    const { data } = await supabase.auth.getUser();
    const role = data.user?.user_metadata?.role || "employee";
    await supabase.auth.signOut();
    router.push(`/login/${role}`);
  }

  const invalidLink = recoveryStatus === "invalid" || recoveryStatus === "unavailable";

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="card w-full max-w-lg p-8"><Link href="/" className="inline-flex items-center gap-2 font-bold"><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white"><Zap className="h-5 w-5" /></span>FieldFlow</Link><span className="mt-8 grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600"><KeyRound /></span><h1 className="mt-5 text-3xl font-extrabold">Set a new password</h1>
    {recoveryStatus === "checking" && <p className="mt-2 text-slate-500">Verifying your password reset link…</p>}
    {invalidLink && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">This password reset link is invalid, expired, or has already been used. Request a new one from the sign-in page.</p>}
    {recoveryStatus === "ready" && <>
      <p className="mt-2 text-slate-500">Choose a secure password with at least eight characters.</p>
      <form onSubmit={submit} className="mt-7 space-y-4"><label><span className="label font-bold">New password</span><input required minLength="8" type="password" value={password} onChange={event => setPassword(event.target.value)} className="input py-3.5" /></label><label><span className="label font-bold">Confirm password</span><input required minLength="8" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} className="input py-3.5" /></label>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={loading} className="btn-primary w-full py-4">{loading ? "Updating…" : "Update password"}</button></form>
    </>}
  </section></main>;
}
