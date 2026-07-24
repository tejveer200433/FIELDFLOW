"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { legacyAccess, workspaceForAccess } from "@/lib/permissions";

export function saveIdentity({ role, email, name, id, access }) {
  localStorage.setItem("fieldflow-role", role);
  localStorage.setItem("fieldflow-user", email);
  localStorage.setItem("fieldflow-name", name);
  localStorage.setItem("fieldflow-employee-id", id);
  localStorage.setItem("fieldflow-dynamic-role", access?.role?.name || role);
  localStorage.setItem("fieldflow-permissions", JSON.stringify(access?.permissions || []));
}

export function useAuthGuard(portal) {
  const router = useRouter();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!supabase) {
        router.replace(`/login/${portal}`);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) { router.replace(`/login/${portal}`); return; }
      const { data: profile, error } = await supabase.from("profiles").select("id,email,full_name,role,approval_status,active").eq("id", user.id).single();
      if (error || !profile || profile.approval_status !== "approved" || !profile.active) {
        await supabase.auth.signOut();
        router.replace(`/login/${portal}?error=access`);
        return;
      }
      const { data: accessData, error: accessError } = await supabase.rpc("get_my_access_context");
      const resolvedAccess = accessError || !accessData ? legacyAccess(profile.role) : accessData;
      const workspace = workspaceForAccess(resolvedAccess);
      if (portal !== workspace) {
        router.replace(`/${workspace}`);
        return;
      }
      saveIdentity({ role: profile.role, email: profile.email, name: profile.full_name, id: profile.id, access: resolvedAccess });
      if (active) setAccess({ ...resolvedAccess, profile });
    }
    verify();
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace(`/login/${portal}`);
    });
    return () => { active = false; listener?.data?.subscription?.unsubscribe(); };
  }, [portal, router]);

  return access;
}

export async function signOutUser() {
  if (supabase) await supabase.auth.signOut();
  ["fieldflow-role", "fieldflow-user", "fieldflow-name", "fieldflow-employee-id", "fieldflow-dynamic-role", "fieldflow-permissions", "fieldflow-tracking"].forEach(key => localStorage.removeItem(key));
}
