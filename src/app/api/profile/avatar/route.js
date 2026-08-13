import { ApiError, apiFailure, requireSession } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

const BUCKET = "profile-images";
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

async function signedAvatar(client, path) {
  if (!path) return null;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function POST(request) {
  let uploadedPath = null;
  let client = null;
  try {
    const session = await requireSession(request);
    client = session.client;
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File) || file.size === 0) throw new ApiError("Choose a profile image to upload.");
    const extension = EXTENSIONS.get(file.type);
    if (!extension) throw new ApiError("Profile images must be JPEG, PNG, or WebP.");
    if (file.size > MAX_BYTES) throw new ApiError("Profile images must be 5 MB or smaller.");

    uploadedPath = `${session.profile.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await client.storage.from(BUCKET).upload(uploadedPath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await client.rpc("set_my_avatar_path", { p_avatar_path: uploadedPath });
    if (updateError) throw updateError;

    const oldPath = session.profile.avatar_path;
    if (oldPath && oldPath !== uploadedPath) {
      const { error: removeError } = await client.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.error("Previous profile image could not be removed.", removeError);
    }

    return Response.json({ data: { avatarPath: uploadedPath, avatarUrl: await signedAvatar(client, uploadedPath) } });
  } catch (error) {
    if (client && uploadedPath) await client.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
    return apiFailure(error);
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSession(request);
    const oldPath = session.profile.avatar_path;
    const { error: updateError } = await session.client.rpc("set_my_avatar_path", { p_avatar_path: null });
    if (updateError) throw updateError;
    if (oldPath) {
      const { error: removeError } = await session.client.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.error("Removed profile image reference but storage cleanup failed.", removeError);
    }
    return Response.json({ data: { avatarPath: null, avatarUrl: null } });
  } catch (error) {
    return apiFailure(error);
  }
}
