import { NextResponse } from "next/server";
import store from "@/lib/workflowStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const employeeId = new URL(request.url).searchParams.get("employeeId");
  const data = employeeId ? store.expenses.filter(item => item.employeeId === employeeId) : store.expenses;
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.employeeId || !body.employee || !body.type || !Number(body.amount) || !body.note) return NextResponse.json({ error: "Type, amount and note are required." }, { status: 400 });
  const expense = { id: `x-${Date.now()}`, employeeId: body.employeeId, employee: body.employee, type: body.type, amount: Number(body.amount), date: new Date().toISOString().slice(0, 10), note: body.note, status: "Pending", managerComment: "" };
  store.expenses.unshift(expense);
  return NextResponse.json({ data: expense }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();
  const expense = store.expenses.find(item => item.id === body.id);
  if (!expense || !["Approved", "Rejected"].includes(body.status)) return NextResponse.json({ error: "Valid expense and decision are required." }, { status: 400 });
  expense.status = body.status;
  expense.managerComment = String(body.managerComment || "").slice(0, 500);
  return NextResponse.json({ data: expense });
}
