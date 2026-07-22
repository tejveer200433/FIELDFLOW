"use client";

import { useParams } from "next/navigation";
import AuthScreen from "@/components/AuthScreen";

export default function LoginPage() {
  const { role } = useParams();
  return <AuthScreen role={role} mode="signin" />;
}
