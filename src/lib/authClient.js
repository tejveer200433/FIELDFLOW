"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function saveIdentity({ role, email, name, id }) {
  localStorage.setItem("fieldflow-role", role);
  localStorage.setItem("fieldflow-user", email);
  localStorage.setItem("fieldflow-name", name);
  localStorage.setItem("fieldflow-employee-id", role === "employee" ? id : role);
}

export function useAuthGuard(requiredRole) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!supabase) {
        router.replace(`/login/${requiredRole}`);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) { router.replace(`/login/${requiredRole}`); return; }
      const { data: profile, error } = await supabase.from("profiles").select("id,email,full_name,role,approval_status,active").eq("id", user.id).single();
      if (error || !profile || profile.role !== requiredRole || profile.approval_status !== "approved" || !profile.active) {
        await supabase.auth.signOut();
        router.replace(`/login/${requiredRole}?error=access`);
        return;
      }
      saveIdentity({ role: profile.role, email: profile.email, name: profile.full_name, id: profile.id });
      if (active) setReady(true);
    }
    verify();
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace(`/login/${requiredRole}`);
    });
    return () => { active = false; listener?.data?.subscription?.unsubscribe(); };
  }, [requiredRole, router]);

  return ready;
}

export async function signOutUser() {
  if (supabase) await supabase.auth.signOut();
  ["fieldflow-role", "fieldflow-user", "fieldflow-name", "fieldflow-employee-id", "fieldflow-tracking"].forEach(key => localStorage.removeItem(key));
}
