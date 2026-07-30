import { NextResponse } from "next/server";

const activityAgentOrigins = new Set([
  "http://localhost:1420",
  "http://tauri.localhost",
  "tauri://localhost"
]);
const activityExtensionOrigins = new Set(
  (process.env.ACTIVITY_BROWSER_EXTENSION_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)
    .map(id => `chrome-extension://${id}`)
);

const activityCorsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

function addActivityCorsHeaders(response, origin) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  for (const [name, value] of Object.entries(activityCorsHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export function middleware(request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && (activityAgentOrigins.has(origin) || activityExtensionOrigins.has(origin));

  if (request.method === "OPTIONS") {
    if (!allowedOrigin) {
      return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
    }
    return addActivityCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  const response = NextResponse.next();
  return allowedOrigin ? addActivityCorsHeaders(response, origin) : response;
}

export const config = {
  matcher: "/api/activity/:path*"
};
