import { apiFailure, mapProfile, requireSession } from "@/lib/supabaseServer";

export async function GET(request) {
  try {
    const { profile } = await requireSession(request);
    return Response.json({ data: mapProfile(profile) });
  } catch (error) {
    return apiFailure(error);
  }
}
