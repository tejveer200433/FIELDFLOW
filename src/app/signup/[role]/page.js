"use client";

import { useParams } from "next/navigation";
import AuthScreen from "@/frontend/features/auth/components/AuthScreen";

export default function SignupPage() {
  const { role } = useParams();
  return <AuthScreen role={role} mode="signup" />;
}
