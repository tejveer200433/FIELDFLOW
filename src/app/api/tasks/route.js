import { NextResponse } from "next/server";
import { tasks } from "@/lib/data";

export async function GET() {
  return NextResponse.json({ data: tasks });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.title || !body.employee || !body.address) {
    return NextResponse.json({ error: "title, employee and address are required" }, { status: 400 });
  }
  const task = { id: `t-${Date.now()}`, status: "Assigned", priority: "Medium", time: "Today", client: "Unassigned", ...body };
  return NextResponse.json({ data: task }, { status: 201 });
}
