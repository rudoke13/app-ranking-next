import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { buildAvatarKey, inferExtFromContentType } from "@/lib/storage/avatar"
import {
  createPresignedPutUrl,
  ensureBucketExists,
  getPublicObjectUrl,
} from "@/lib/storage/s3"

const bodySchema = z.object({
  contentType: z.string().min(1),
})
const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookies()
    if (!session) {
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
    const key = buildAvatarKey(session.userId, ext)

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
    console.error("Avatar presign failed", error)
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel gerar o link de upload." },
      { status: 500 }
    )
  }
}
