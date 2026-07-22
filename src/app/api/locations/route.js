import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const seedLocations = [
  { employeeId: "e-2", name: "Neha Verma", latitude: 28.4946, longitude: 77.0888, accuracy: 24, updatedAt: new Date().toISOString(), sharing: true },
  { employeeId: "e-5", name: "Vikram Rao", latitude: 28.6448, longitude: 77.2167, accuracy: 31, updatedAt: new Date().toISOString(), sharing: true }
];

const store = globalThis.fieldflowLocationStore || new Map(seedLocations.map(location => [location.employeeId, location]));
globalThis.fieldflowLocationStore = store;

export async function GET() {
  return NextResponse.json(
    { data: Array.from(store.values()), storage: "demo-memory" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request) {
  const body = await request.json();
  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  if (body.sharing === false) {
    const existing = store.get(employeeId);
    if (existing) store.set(employeeId, { ...existing, sharing: false, updatedAt: new Date().toISOString() });
    return NextResponse.json({ data: store.get(employeeId) || null });
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Valid latitude and longitude are required" }, { status: 400 });
  }

  const location = {
    employeeId,
    name: String(body.name || "Employee").slice(0, 80),
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    updatedAt: new Date().toISOString(),
    sharing: true
  };
  store.set(employeeId, location);
  return NextResponse.json({ data: location }, { status: 201 });
}
