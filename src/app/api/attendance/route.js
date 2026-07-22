import { NextResponse } from "next/server";
import store from "@/lib/workflowStore";
import { durationSeconds, formatDuration } from "@/lib/time";

export const dynamic = "force-dynamic";
const validLocation = location => location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));
function localDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}`, hour: Number(value("hour")) };
}

export async function GET(request) {
  const employeeId = new URL(request.url).searchParams.get("employeeId");
  const data = employeeId ? store.attendance.filter(item => item.employeeId === employeeId) : store.attendance;
  const enriched = data.map(item => ({ ...item, durationSeconds: durationSeconds(item), hours: item.checkOut ? formatDuration(durationSeconds(item)) : formatDuration(durationSeconds(item)) }));
  return NextResponse.json({ data: enriched }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.employeeId || !body.employee || !["check-in", "check-out"].includes(body.action) || !validLocation(body.location)) {
    return NextResponse.json({ error: "Employee, action and a valid GPS location are required." }, { status: 400 });
  }
  const now = new Date();
  let timeZone = String(body.timeZone || "Asia/Kolkata");
  try { new Intl.DateTimeFormat("en-CA", { timeZone }).format(now); } catch { timeZone = "Asia/Kolkata"; }
  const local = localDateTime(now, timeZone);
  const { date, time } = local;
  if (body.action === "check-in") {
    const open = store.attendance.find(item => item.employeeId === body.employeeId && !item.checkOut);
    if (open) return NextResponse.json({ data: open, message: "Already checked in." });
    const record = { id: `a-${Date.now()}`, employeeId: body.employeeId, employee: body.employee, date, checkIn: time, checkOut: null, checkInAt: now.toISOString(), checkOutAt: null, durationSeconds: 0, hours: "0s", timeZone, status: local.hour >= 9 ? "Late" : "On time", checkInLocation: body.location };
    store.attendance.unshift(record);
    return NextResponse.json({ data: record }, { status: 201 });
  }
  const open = store.attendance.find(item => item.employeeId === body.employeeId && !item.checkOut);
  if (!open) return NextResponse.json({ error: "No active check-in was found." }, { status: 409 });
  const start = open.checkInAt ? new Date(open.checkInAt) : new Date(`${open.date}T${open.checkIn}:00`);
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  open.checkOut = time;
  open.checkOutAt = now.toISOString();
  open.durationSeconds = totalSeconds;
  open.hours = formatDuration(totalSeconds);
  open.checkOutLocation = body.location;
  return NextResponse.json({ data: open });
}
