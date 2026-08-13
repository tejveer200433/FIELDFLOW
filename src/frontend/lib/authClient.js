"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/frontend/lib/supabase";
import { workspaceForAccess } from "@/shared/permissions";

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
      let [{ data: profile, error }, { data: accessData, error: accessError }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,role,department,approval_status,active,avatar_path").eq("id", user.id).single(),
        supabase.rpc("get_my_access_context")
      ]);
      if (error?.code === "42703" || error?.code === "PGRST204") {
        const fallback = await supabase.from("profiles").select("id,email,full_name,role,department,approval_status,active").eq("id", user.id).single();
        profile = fallback.data;
        error = fallback.error;
      }
      if (error || !profile || profile.approval_status !== "approved" || !profile.active) {
        await supabase.auth.signOut();
        router.replace(`/login/${portal}?error=access`);
        return;
      }
      if (accessError || !accessData) {
        router.replace(`/login/${portal}?error=permissions`);
        return;
      }
      const resolvedAccess = accessData;
      const workspace = workspaceForAccess(resolvedAccess);
      if (portal !== workspace) {
        router.replace(`/${workspace}`);
        return;
      }
      profile.avatarUrl = null;
      saveIdentity({ role: profile.role, email: profile.email, name: profile.full_name, id: profile.id, access: resolvedAccess });
      if (active) setAccess({ ...resolvedAccess, profile });
      if (profile.avatar_path) {
        const { data: avatar } = await supabase.storage.from("profile-images").createSignedUrl(profile.avatar_path, 60 * 60);
        if (active && avatar?.signedUrl) {
          setAccess(current => current ? { ...current, profile: { ...current.profile, avatarUrl: avatar.signedUrl } } : current);
        }
      }
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
