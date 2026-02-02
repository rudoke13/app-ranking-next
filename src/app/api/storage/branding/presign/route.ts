import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { inferExtFromContentType } from "@/lib/storage/avatar"
import {
  createPresignedPutUrl,
  ensureBucketExists,
  getPublicObjectUrl,
} from "@/lib/storage/s3"

const bodySchema = z.object({
  contentType: z.string().min(1),
  kind: z.enum(["logo", "favicon", "pwa"]),
})

const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
]

const buildBrandingKey = (kind: string, ext: string) => {
  const safeKind = kind.replace(/[^a-z0-9-]/gi, "") || "logo"
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "jpg"
  return `branding/${safeKind}/${Date.now()}.${safeExt}`
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookies()
    if (!hasAdminAccess(session)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const payload = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(payload)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Tipo de arquivo invalido." },
        { status: 400 }
      )
    }

    if (
      !parsed.data.contentType.startsWith("image/") ||
      !allowedTypes.includes(parsed.data.contentType.toLowerCase())
    ) {
      return NextResponse.json(
        { ok: false, message: "Tipo de imagem invalido." },
        { status: 400 }
      )
    }

    const bucket = process.env.S3_BUCKET
    const baseUrl = process.env.S3_PUBLIC_BASE_URL

    if (!bucket || !baseUrl) {
      return NextResponse.json(
        { ok: false, message: "Storage nao configurado." },
        { status: 500 }
      )
    }

    const ext = inferExtFromContentType(parsed.data.contentType)
    const key = buildBrandingKey(parsed.data.kind, ext)

    await ensureBucketExists(bucket)

    const uploadUrl = await createPresignedPutUrl({
      bucket,
      key,
      contentType: parsed.data.contentType,
    })

    const publicUrl = getPublicObjectUrl({ baseUrl, bucket, key })

    return NextResponse.json({
      ok: true,
      uploadUrl,
      key,
      publicUrl,
    })
  } catch (error) {
    console.error("Branding presign failed", error)
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel gerar o link de upload." },
      { status: 500 }
    )
  }
}
