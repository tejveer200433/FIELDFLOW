import { ActivityValidationError } from "@/lib/activity/validation.mjs";

export class ActivityError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = "ActivityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function activitySuccess(data, { status = 200, message, headers } = {}) {
  return Response.json(
    { success: true, data, ...(message ? { message } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...(headers || {}) } }
  );
}

export function activityFailure(error) {
  if (error instanceof ActivityValidationError) {
    return Response.json({
      success: false,
      error: { code: error.code || "INVALID_REQUEST", message: error.message }
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof ActivityError) {
    return Response.json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    }, {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error.status === 429 && error.details?.retryAfterSeconds
          ? { "Retry-After": String(error.details.retryAfterSeconds) }
          : {})
      }
    });
  }
  const knownStatus = [401, 403].includes(error?.status) ? error.status : 500;
  if (knownStatus === 500) console.error("[Activity API]", error);
  return Response.json({
    success: false,
    error: {
      code: knownStatus === 401 ? "AUTHENTICATION_REQUIRED" : knownStatus === 403 ? "ACCESS_DENIED" : "INTERNAL_ERROR",
      message: knownStatus === 401
        ? "Authentication required."
        : knownStatus === 403
          ? "You do not have permission for this activity resource."
          : "The activity request could not be completed."
    }
  }, { status: knownStatus, headers: { "Cache-Control": "no-store" } });
}

export async function readActivityJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ActivityError("INVALID_JSON", "A valid JSON request body is required.", 400);
  }
}
