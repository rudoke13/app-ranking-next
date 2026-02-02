"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import SectionTitle from "@/components/app/SectionTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiGet, apiPatch, apiPost } from "@/lib/http"

type AppSettingsData = {
  appName: string | null
  logoUrl: string | null
  faviconUrl: string | null
  pwaIconUrl: string | null
  maintenanceEnabled: boolean
  maintenanceMessage: string | null
}

type RankingItem = {
  id: number
  name: string
  slug: string
  description: string | null
  isActive: boolean
  activePlayers: number
}

type PresignResponse = {
  ok: boolean
  uploadUrl: string
  publicUrl: string
  message?: string
}

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
]

type BrandingKind = "logo" | "favicon" | "pwa"
type BrandingField = "logoUrl" | "faviconUrl" | "pwaIconUrl"

const brandingMeta: Record<
  BrandingKind,
  { label: string; hint: string; field: BrandingField }
> = {
  logo: {
    label: "Logo do app",
    hint: "Recomendado 512x512 em PNG ou WEBP.",
    field: "logoUrl",
  },
  favicon: {
    label: "Favicon",
    hint: "Recomendado 32x32 em PNG, SVG ou ICO.",
    field: "faviconUrl",
  },
  pwa: {
    label: "Icone PWA",
    hint: "Recomendado 512x512 em PNG.",
    field: "pwaIconUrl",
  },
}

export default function AdminConfiguracoesPage() {
  const [settings, setSettings] = useState<AppSettingsData>({
    appName: "",
    logoUrl: null,
    faviconUrl: null,
    pwaIconUrl: null,
    maintenanceEnabled: false,
    maintenanceMessage: "",
  })
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<Record<BrandingKind, boolean>>({
    logo: false,
    favicon: false,
    pwa: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const [settingsResponse, rankingsResponse] = await Promise.all([
      apiGet<AppSettingsData>("/api/admin/app-settings"),
      apiGet<RankingItem[]>("/api/admin/rankings"),
    ])

    if (!settingsResponse.ok) {
      setError(settingsResponse.message)
    } else {
      setSettings({
        appName: settingsResponse.data.appName ?? "",
        logoUrl: settingsResponse.data.logoUrl ?? null,
        faviconUrl: settingsResponse.data.faviconUrl ?? null,
        pwaIconUrl: settingsResponse.data.pwaIconUrl ?? null,
        maintenanceEnabled: settingsResponse.data.maintenanceEnabled ?? false,
        maintenanceMessage: settingsResponse.data.maintenanceMessage ?? "",
      })
    }

    if (rankingsResponse.ok) {
      setRankings(rankingsResponse.data)
    } else {
      setError(rankingsResponse.message)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const response = await apiPatch<AppSettingsData>(
      "/api/admin/app-settings",
      {
        appName: settings.appName,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        pwaIconUrl: settings.pwaIconUrl,
        maintenanceEnabled: settings.maintenanceEnabled,
        maintenanceMessage: settings.maintenanceMessage,
      }
    )

    if (!response.ok) {
      setError(response.message)
      setSaving(false)
      return
    }

    setSettings({
      appName: response.data.appName ?? "",
      logoUrl: response.data.logoUrl ?? null,
      faviconUrl: response.data.faviconUrl ?? null,
      pwaIconUrl: response.data.pwaIconUrl ?? null,
      maintenanceEnabled: response.data.maintenanceEnabled ?? false,
      maintenanceMessage: response.data.maintenanceMessage ?? "",
    })
    setSuccess("Configuracoes salvas com sucesso.")
    setSaving(false)
  }

  const updateSettingField = async (
    field: BrandingField,
    value: string | null
  ) => {
    setError(null)
    setSuccess(null)

    const response = await apiPatch<AppSettingsData>(
      "/api/admin/app-settings",
      {
        [field]: value ?? "",
      }
    )

    if (!response.ok) {
      setError(response.message)
      return false
    }

    setSettings({
      appName: response.data.appName ?? "",
      logoUrl: response.data.logoUrl ?? null,
      faviconUrl: response.data.faviconUrl ?? null,
      pwaIconUrl: response.data.pwaIconUrl ?? null,
      maintenanceEnabled: response.data.maintenanceEnabled ?? false,
      maintenanceMessage: response.data.maintenanceMessage ?? "",
    })
    return true
  }

  const handleUpload = async (kind: BrandingKind, file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Envie uma imagem JPG, PNG, WEBP, SVG ou ICO.")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("A imagem deve ter no maximo 2MB.")
      return
    }

    setUploading((current) => ({ ...current, [kind]: true }))
    setError(null)
    setSuccess(null)

    try {
      const presignResponse = await fetch("/api/storage/branding/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, kind }),
      })

      let presignData: PresignResponse | null = null
      try {
        presignData = (await presignResponse.json()) as PresignResponse
      } catch {
        presignData = null
      }

      if (!presignResponse.ok || !presignData?.ok) {
        throw new Error(
          presignData?.message ?? "Nao foi possivel gerar o link de upload."
        )
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Falha ao enviar a imagem.")
      }

      const field = brandingMeta[kind].field
      const success = await updateSettingField(field, presignData.publicUrl)
      if (success) {
        setSuccess("Imagem atualizada com sucesso.")
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Erro ao enviar a imagem."
      )
    } finally {
      setUploading((current) => ({ ...current, [kind]: false }))
    }
  }

  const handleCreateRanking = async () => {
    if (!createName.trim()) {
      setError("Informe o nome da categoria.")
      return
    }

    setCreating(true)
    setError(null)
    setSuccess(null)

    const response = await apiPost<RankingItem>("/api/admin/rankings", {
      name: createName.trim(),
      description: createDescription.trim() || null,
    })

    if (!response.ok) {
      setError(response.message)
      setCreating(false)
      return
    }

    setRankings((current) =>
      [...current, response.data].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    )
    setCreateName("")
    setCreateDescription("")
    setSuccess("Categoria criada com sucesso.")
    setCreating(false)
  }

  const handleToggleRanking = async (ranking: RankingItem) => {
    setError(null)
    setSuccess(null)

    const response = await apiPatch<RankingItem>(
      `/api/admin/rankings/${ranking.id}`,
      {
        isActive: !ranking.isActive,
      }
    )

    if (!response.ok) {
      setError(response.message)
      return
    }

    setRankings((current) =>
      current.map((item) =>
        item.id === ranking.id
          ? { ...item, isActive: response.data.isActive }
          : item
      )
    )
  }

  const BrandingUploader = ({
    kind,
  }: {
    kind: BrandingKind
  }) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const meta = brandingMeta[kind]
    const currentUrl = settings[meta.field] as string | null
    const isUploading = uploading[kind]

    const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      handleUpload(kind, file)
      event.target.value = ""
    }

    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-background">
            {currentUrl ? (
              <img
                src={currentUrl}
                alt={meta.label}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted-foreground">Sem imagem</span>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {meta.label}
            </p>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            className="sr-only"
            onChange={handleSelect}
            aria-label={`Selecionar ${meta.label}`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Enviando..." : "Enviar"}
          </Button>
          {currentUrl ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => updateSettingField(meta.field, null)}
              disabled={isUploading}
            >
              Remover
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const activeCount = useMemo(
    () => rankings.filter((item) => item.isActive).length,
    [rankings]
  )

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Configuracoes do aplicativo"
        subtitle="Personalize o app e as categorias"
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? (
            <p className="text-sm text-emerald-600">{success}</p>
          ) : null}

          <Tabs defaultValue="app">
            <TabsList>
              <TabsTrigger value="app">Aplicativo</TabsTrigger>
              <TabsTrigger value="rankings">Categorias</TabsTrigger>
            </TabsList>

            <TabsContent value="app" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Identidade do app</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do aplicativo</Label>
                    <Input
                      value={settings.appName ?? ""}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          appName: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <BrandingUploader kind="logo" />
                    <BrandingUploader kind="favicon" />
                    <BrandingUploader kind="pwa" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Modo manutencao</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Status do app
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Quando ativo, apenas o admin consegue acessar o app.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={settings.maintenanceEnabled ? "default" : "outline"}
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          maintenanceEnabled: !current.maintenanceEnabled,
                        }))
                      }
                    >
                      {settings.maintenanceEnabled ? "Em manutencao" : "Ativo"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem de manutencao</Label>
                    <textarea
                      className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm"
                      value={settings.maintenanceMessage ?? ""}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          maintenanceMessage: event.target.value,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar configuracoes"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="rankings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Criar categoria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descricao</Label>
                      <Input
                        value={createDescription}
                        onChange={(event) =>
                          setCreateDescription(event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateRanking} disabled={creating}>
                      {creating ? "Criando..." : "Criar categoria"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Categorias cadastradas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rankings.map((ranking) => (
                    <div
                      key={ranking.id}
                      className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {ranking.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ranking.description ?? "Sem descricao"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          slug: {ranking.slug}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={ranking.isActive ? "secondary" : "outline"}
                        >
                          {ranking.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="secondary">
                          {ranking.activePlayers} ativos
                        </Badge>
                        <Button
                          type="button"
                          variant={ranking.isActive ? "outline" : "default"}
                          size="sm"
                          onClick={() => handleToggleRanking(ranking)}
                        >
                          {ranking.isActive ? "Inativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!rankings.length ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma categoria cadastrada.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground">
                {activeCount} categorias ativas.
              </p>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
