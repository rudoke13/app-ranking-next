const contentTypeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export function inferExtFromContentType(contentType: string) {
  return contentTypeToExt[contentType.toLowerCase()] ?? "jpg"
}

export function buildAvatarKey(userId: string | number, ext: string) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "jpg"
  return `avatars/${userId}/${Date.now()}.${safeExt}`
}
