import { NextResponse } from "next/server";
import store from "@/lib/workflowStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const employeeId = new URL(request.url).searchParams.get("employeeId");
  const data = employeeId ? store.reports.filter(item => item.employeeId === employeeId) : store.reports;
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.employeeId || !body.employee || !body.task || !body.workCompleted || !Number(body.hours)) return NextResponse.json({ error: "Task, completed work and hours are required." }, { status: 400 });
  const report = { id: `r-${Date.now()}`, employeeId: body.employeeId, employee: body.employee, date: new Date().toISOString().slice(0, 10), hours: String(body.hours), task: body.task, workCompleted: body.workCompleted, problems: body.problems || "None", tomorrowPlan: body.tomorrowPlan || "Not specified", status: "Submitted", managerComment: "" };
  store.reports.unshift(report);
  return NextResponse.json({ data: report }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();
  const report = store.reports.find(item => item.id === body.id);
  if (!report || !["Approved", "Rejected", "Needs Update"].includes(body.status)) return NextResponse.json({ error: "Valid report and decision are required." }, { status: 400 });
  report.status = body.status;
  report.managerComment = String(body.managerComment || "").slice(0, 500);
  return NextResponse.json({ data: report });
}
