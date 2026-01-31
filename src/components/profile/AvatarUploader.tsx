"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getInitials } from "@/lib/user/initials"

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]

type PresignResponse = {
  ok: boolean
  uploadUrl: string
  publicUrl: string
}

type AvatarUploaderProps = {
  name: string
  avatarUrl?: string | null
  fallbackLabel?: string
}

export default function AvatarUploader({
  name,
  avatarUrl: initialAvatarUrl,
  fallbackLabel,
}: AvatarUploaderProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialAvatarUrl ?? null
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl ?? null)
  }, [initialAvatarUrl])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Envie um arquivo JPG, PNG ou WEBP.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("A imagem deve ter no máximo 2MB.")
      event.target.value = ""
      return
    }

    const tempPreview = URL.createObjectURL(file)
    setPreviewUrl(tempPreview)

    try {
      setIsUploading(true)

      const presignResponse = await fetch("/api/storage/avatar/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentType: file.type }),
      })

      const presignData = (await presignResponse.json()) as PresignResponse

      if (!presignResponse.ok || !presignData.ok) {
        throw new Error("Nao foi possivel gerar o link de upload.")
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Falha ao enviar a imagem.")
      }

      const saveResponse = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publicUrl: presignData.publicUrl }),
      })

      if (!saveResponse.ok) {
        throw new Error("Falha ao salvar o avatar.")
      }

      setAvatarUrl(presignData.publicUrl)
      setPreviewUrl(null)
      router.refresh()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Erro ao enviar a imagem."
      )
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const initials = getInitials(name)
  const label = fallbackLabel?.trim() ? fallbackLabel : initials
  const displayUrl = previewUrl ?? avatarUrl

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{label}</span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Foto de perfil
          </p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG ou WEBP ate 2MB.
          </p>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="sr-only"
          onChange={handleSelect}
          aria-label="Selecionar foto de perfil"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Enviando..." : "Trocar foto"}
        </Button>
      </div>
    </div>
  )
}
