import { NextResponse } from "next/server";

import { resolveAgentRelease } from "@/lib/activity/agentRelease.mjs";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { target, arch, currentVersion } = await params;
  const result = resolveAgentRelease({
    target,
    arch,
    currentVersion,
    environment: process.env
  });
  if (result.status === 204) return new NextResponse(null, { status: 204 });
  if (result.status !== 200) {
    return NextResponse.json(
      { error: "Agent release configuration is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(result.release, {
    headers: { "Cache-Control": "private, max-age=300" }
  });
}
