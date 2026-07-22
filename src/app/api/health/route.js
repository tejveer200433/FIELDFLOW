import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "FieldFlow API", time: new Date().toISOString() });
}
