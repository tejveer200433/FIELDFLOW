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
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        const role = user?.user_metadata?.role;
        if (!user || role !== requiredRole) {
          router.replace(`/login/${requiredRole}`);
          return;
        }
        saveIdentity({ role, email: user.email || "", name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User", id: user.id });
      } else if (localStorage.getItem("fieldflow-role") !== requiredRole) {
        router.replace(`/login/${requiredRole}`);
        return;
      }
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
