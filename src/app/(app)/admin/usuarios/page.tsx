"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Eye, EyeOff } from "lucide-react"

import SectionTitle from "@/components/app/SectionTitle"
import UserAvatar from "@/components/app/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet, apiPatch, apiPost } from "@/lib/http"

const roleLabel = (role: string) =>
  role === "admin"
    ? "Admin"
    : role === "collaborator"
    ? "Colaborador"
    : "Jogador"

const roleValue = (role: string) =>
  role === "admin"
    ? "admin"
    : role === "collaborator"
    ? "collaborator"
    : "player"

const toDateInputValue = (value?: string | null) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toISOString().split("T")[0]
}

type Membership = {
  id: number
  rankingId: number
  rankingName: string
  position: number | null
  licensePosition?: number | null
  isBluePoint: boolean
  isAccessChallenge: boolean
  isSuspended: boolean
}

type RankingItem = {
  id: number
  name: string
  slug: string
}

type AdminUser = {
  id: number
  name: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string
  birthDate: string | null
  phone: string | null
  role: string
  avatarUrl: string | null
  memberships: Membership[]
  collaboratorRankings: { id: number; name: string }[]
}

type UsersPayload = {
  users: AdminUser[]
  viewer: {
    role: string
    allowedRankingIds: number[] | null
  }
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [viewerRole, setViewerRole] = useState<string>("player")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<{
    firstName: string
    lastName: string
    nickname: string
    email: string
    birthDate: string
    phone: string
    role: string
    status: "active" | "inactive"
    password: string
    passwordConfirm: string
    rankingId: string
    collaboratorRankingIds: string[]
  } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    email: "",
    birthDate: "",
    phone: "",
    role: "player",
    rankingId: "",
    collaboratorRankingIds: [] as string[],
    password: "",
    passwordConfirm: "",
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [showCreatePasswordConfirm, setShowCreatePasswordConfirm] =
    useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [showEditPasswordConfirm, setShowEditPasswordConfirm] = useState(false)
  const [editingHasMembership, setEditingHasMembership] = useState<boolean | null>(
    null
  )
  const [draftStatusInitial, setDraftStatusInitial] = useState<
    "active" | "inactive" | null
  >(null)
  const [saving, setSaving] = useState(false)
  const [membershipRankingMap, setMembershipRankingMap] = useState<
    Record<number, string>
  >({})

  const loadUsers = async () => {
    setLoading(true)
    setLoadError(null)
    const [usersResponse, rankingsResponse] = await Promise.all([
      apiGet<UsersPayload>("/api/admin/users"),
      apiGet<RankingItem[]>("/api/rankings"),
    ])
    if (!usersResponse.ok) {
      setLoadError(usersResponse.message)
      setLoading(false)
      return
    }

    setUsers(usersResponse.data.users)
    setViewerRole(usersResponse.data.viewer.role)
    setMembershipRankingMap({})
    if (rankingsResponse.ok) {
      const nextRankings = rankingsResponse.data
      if (
        usersResponse.data.viewer.role === "collaborator" &&
        usersResponse.data.viewer.allowedRankingIds
      ) {
        setRankings(
          nextRankings.filter((ranking) =>
            usersResponse.data.viewer.allowedRankingIds?.includes(ranking.id)
          )
        )
      } else {
        setRankings(nextRankings)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => {
      const haystack = [
        user.name,
        user.firstName,
        user.lastName,
        user.nickname ?? "",
        user.email,
        user.phone ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [search, users])

  const startEdit = (user: AdminUser) => {
    const isActive = user.memberships.some((membership) => !membership.isSuspended)
    const statusValue: "active" | "inactive" = isActive ? "active" : "inactive"
    setEditingId(user.id)
    setShowEditPassword(false)
    setShowEditPasswordConfirm(false)
    setEditingHasMembership(user.memberships.length > 0)
    setDraft({
      firstName: user.firstName,
      lastName: user.lastName,
      nickname: user.nickname ?? "",
      email: user.email,
      birthDate: toDateInputValue(user.birthDate),
      phone: user.phone ?? "",
      role: roleValue(user.role),
      status: statusValue,
      password: "",
      passwordConfirm: "",
      rankingId: user.memberships[0]?.rankingId
        ? String(user.memberships[0].rankingId)
        : "",
      collaboratorRankingIds: user.collaboratorRankings.map((entry) =>
        String(entry.id)
      ),
    })
    setDraftStatusInitial(statusValue)
  }

  const openCreate = () => {
    setShowCreate(true)
    setCreateError(null)
    setCreateDraft({
      firstName: "",
      lastName: "",
      nickname: "",
      email: "",
      birthDate: "",
      phone: "",
      role: "player",
      rankingId: "",
      collaboratorRankingIds: [],
      password: "",
      passwordConfirm: "",
    })
    setEditingId(null)
    setDraft(null)
  }

  const closeCreate = () => {
    setShowCreate(false)
    setCreateError(null)
  }

  const handleCreate = async () => {
    const firstName = createDraft.firstName.trim()
    const lastName = createDraft.lastName.trim()
    const email = createDraft.email.trim()
    const rankingId = createDraft.rankingId
    const collaboratorRankingIds = createDraft.collaboratorRankingIds
    const password = createDraft.password.trim()
    const passwordConfirm = createDraft.passwordConfirm.trim()

    if ((createDraft.role === "player" || createDraft.role === "member") && !rankingId) {
      setCreateError("Selecione a categoria do ranking.")
      return
    }

    if (createDraft.role === "collaborator" && collaboratorRankingIds.length === 0) {
      setCreateError("Selecione ao menos uma categoria para o colaborador.")
      return
    }

    if (!firstName || !lastName || !email) {
      setCreateError("Preencha nome, sobrenome e email.")
      return
    }

    if (password || passwordConfirm) {
      if (password !== passwordConfirm) {
        setCreateError("Senha e confirmacao nao conferem.")
        return
      }
    }

    setCreating(true)
    setCreateError(null)

    const response = await apiPost("/api/admin/users", {
      first_name: firstName,
      last_name: lastName,
      nickname: createDraft.nickname.trim() || null,
      email,
      birth_date: createDraft.birthDate.trim() || null,
      phone: createDraft.phone.trim() || null,
      role: createDraft.role,
      ranking_id: rankingId ? Number(rankingId) : undefined,
      collaborator_ranking_ids:
        createDraft.role === "collaborator"
          ? collaboratorRankingIds.map((id) => Number(id))
          : undefined,
      password: password || undefined,
    })

    if (!response.ok) {
      setCreateError(response.message)
      setCreating(false)
      return
    }

    setCreating(false)
    setShowCreate(false)
    setCreateDraft({
      firstName: "",
      lastName: "",
      nickname: "",
      email: "",
      birthDate: "",
      phone: "",
      role: "player",
      rankingId: "",
      collaboratorRankingIds: [],
      password: "",
      passwordConfirm: "",
    })
    loadUsers()
  }

  const handleSave = async () => {
    if (!editingId || !draft) return
    setSaving(true)
    setActionError(null)

    const password = draft.password.trim()
    const passwordConfirm = draft.passwordConfirm.trim()

    if (password || passwordConfirm) {
      if (password !== passwordConfirm) {
        setActionError("Senha e confirmacao nao conferem.")
        setSaving(false)
        return
      }
    }

    if (
      editingHasMembership === false &&
      draft.status === "active" &&
      (draft.role === "player" || draft.role === "member") &&
      !draft.rankingId
    ) {
      setActionError("Selecione a categoria do ranking para ativar o jogador.")
      setSaving(false)
      return
    }

    if (
      viewerRole === "admin" &&
      draft.role === "collaborator" &&
      draft.collaboratorRankingIds.length === 0
    ) {
      setActionError("Selecione ao menos uma categoria para o colaborador.")
      setSaving(false)
      return
    }

    const payload: Record<string, unknown> = {
      first_name: draft.firstName,
      last_name: draft.lastName,
      nickname: draft.nickname || null,
      email: draft.email,
      birth_date: draft.birthDate.trim() || null,
      phone: draft.phone.trim() || null,
    }

    if (viewerRole === "admin") {
      payload.role = draft.role
      if (draft.role === "collaborator") {
        payload.collaborator_ranking_ids = draft.collaboratorRankingIds.map(
          (id) => Number(id)
        )
      }
    }

    if (password) {
      payload.password = password
    }

    if (editingHasMembership === false && draft.rankingId) {
      payload.membership = {
        ranking_id: Number(draft.rankingId),
        is_suspended: draft.status === "inactive",
      }
    }

    if (draftStatusInitial && draft.status !== draftStatusInitial) {
      payload.active = draft.status === "active"
    }

    const response = await apiPatch(`/api/admin/users/${editingId}`, payload)

    if (!response.ok) {
      setActionError(response.message)
      setSaving(false)
      return
    }

    setEditingId(null)
    setDraft(null)
    setEditingHasMembership(null)
    setDraftStatusInitial(null)
    setSaving(false)
    loadUsers()
  }

  const handleToggleMembership = async (
    userId: number,
    membership: Membership,
    field: "is_blue_point" | "is_access_challenge" | "is_suspended",
    value: boolean
  ) => {
    if (field === "is_suspended" && value) {
      const defaultPosition =
        membership.licensePosition ?? membership.position ?? null
      const input = window.prompt(
        "Informe a posicao que o jogador saiu para a licenca",
        defaultPosition ? String(defaultPosition) : ""
      )
      if (input === null) {
        return
      }
      const parsed = Number(input)
      if (!Number.isFinite(parsed) || parsed < 1) {
        setActionError("Posicao de licenca invalida.")
        return
      }
      setSaving(true)
      setActionError(null)
      const response = await apiPatch(`/api/admin/users/${userId}`, {
        membership: {
          id: membership.id,
          is_suspended: true,
          license_position: parsed,
        },
      })

      if (!response.ok) {
        setActionError(response.message)
        setSaving(false)
        return
      }

      setSaving(false)
      loadUsers()
      return
    }

    setSaving(true)
    setActionError(null)
    const response = await apiPatch(`/api/admin/users/${userId}`, {
      membership: {
        id: membership.id,
        [field]: value,
      },
    })

    if (!response.ok) {
      setActionError(response.message)
      setSaving(false)
      return
    }

    setSaving(false)
    loadUsers()
  }

  const handleMoveMembership = async (
    userId: number,
    membershipId: number,
    targetRankingId: number
  ) => {
    setSaving(true)
    setActionError(null)
    const response = await apiPatch(`/api/admin/users/${userId}`, {
      membership: {
        id: membershipId,
        move_to_ranking_id: targetRankingId,
      },
    })

    if (!response.ok) {
      setActionError(response.message)
      setSaving(false)
      return
    }

    setSaving(false)
    loadUsers()
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Administracao de usuarios"
        subtitle="Gerencie acessos e permissoes"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {viewerRole === "admin" ? (
              <Button asChild variant="outline">
                <Link href="/admin/configuracoes">Configuracoes</Link>
              </Button>
            ) : null}
            <Button onClick={showCreate ? closeCreate : openCreate}>
              {showCreate ? "Fechar cadastro" : "Novo usuario"}
            </Button>
          </div>
        }
      />

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastrar usuario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={createDraft.firstName}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Sobrenome</Label>
                <Input
                  value={createDraft.lastName}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Apelido</Label>
                <Input
                  value={createDraft.nickname}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      nickname: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={createDraft.email}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Celular</Label>
                <Input
                  type="tel"
                  value={createDraft.phone}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Data de nascimento</Label>
                <Input
                  type="date"
                  value={createDraft.birthDate}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      birthDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Permissao</Label>
                <Select
                  value={createDraft.role}
                  onValueChange={(value) =>
                    setCreateDraft((current) => ({ ...current, role: value }))
                  }
                  disabled={viewerRole !== "admin"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {viewerRole === "admin" ? (
                      <>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="collaborator">Colaborador</SelectItem>
                        <SelectItem value="player">Jogador</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="player">Jogador</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {createDraft.role === "player" || createDraft.role === "member" ? (
                <div className="space-y-2">
                  <Label>Categoria do ranking</Label>
                  <Select
                    value={createDraft.rankingId}
                    onValueChange={(value) =>
                      setCreateDraft((current) => ({
                        ...current,
                        rankingId: value,
                      }))
                    }
                    disabled={rankings.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          rankings.length === 0 ? "Carregando..." : "Selecione"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {rankings.map((ranking) => (
                        <SelectItem key={ranking.id} value={String(ranking.id)}>
                          {ranking.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {viewerRole === "admin" && createDraft.role === "collaborator" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Categorias permitidas</Label>
                  <div className="flex flex-wrap gap-2">
                    {rankings.map((ranking) => {
                      const value = String(ranking.id)
                      const selected =
                        createDraft.collaboratorRankingIds.includes(value)
                      return (
                        <label
                          key={ranking.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setCreateDraft((current) => ({
                                ...current,
                                collaboratorRankingIds: selected
                                  ? current.collaboratorRankingIds.filter(
                                      (item) => item !== value
                                    )
                                  : [...current.collaboratorRankingIds, value],
                              }))
                            }
                          />
                          <span>{ranking.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Senha inicial</Label>
                <div className="relative">
                  <Input
                    type={showCreatePassword ? "text" : "password"}
                    value={createDraft.password}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="player123"
                    className="pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    aria-label={
                      showCreatePassword ? "Ocultar senha" : "Mostrar senha"
                    }
                  >
                    {showCreatePassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se deixar em branco, usamos player123.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <div className="relative">
                  <Input
                    type={showCreatePasswordConfirm ? "text" : "password"}
                    value={createDraft.passwordConfirm}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        passwordConfirm: event.target.value,
                      }))
                    }
                    placeholder="Digite novamente"
                    className="pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setShowCreatePasswordConfirm((prev) => !prev)
                    }
                    aria-label={
                      showCreatePasswordConfirm
                        ? "Ocultar senha"
                        : "Mostrar senha"
                    }
                  >
                    {showCreatePasswordConfirm ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Salvando..." : "Cadastrar"}
              </Button>
              <Button variant="ghost" onClick={closeCreate} disabled={creating}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={`user-skeleton-${index}`} className="h-24" />
            ))}
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {loadError}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Usuarios cadastrados</CardTitle>
              <div className="w-full sm:max-w-xs">
                <Label htmlFor="user-search" className="sr-only">
                  Buscar por nome
                </Label>
                <Input
                  id="user-search"
                  placeholder="Buscar por nome ou email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError ? (
              <p className="text-sm text-destructive">{actionError}</p>
            ) : null}
            {filteredUsers.length ? (
              filteredUsers.map((user) => {
                const isActive = user.memberships.some(
                  (membership) => !membership.isSuspended
                )

                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={user.name} src={user.avatarUrl} size={40} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {user.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            user.role === "admin" || user.role === "collaborator"
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-muted text-muted-foreground"
                          }
                        >
                          {roleLabel(user.role)}
                        </Badge>
                        <Badge variant={isActive ? "secondary" : "outline"}>
                          {isActive ? "Ativo" : "Inativo"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(user)}
                        >
                          Editar
                        </Button>
                      </div>
                    </div>

                  {editingId === user.id && draft ? (
                    <div className="grid gap-3 rounded-lg border bg-background/60 p-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input
                          value={draft.firstName}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, firstName: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sobrenome</Label>
                        <Input
                          value={draft.lastName}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, lastName: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Apelido</Label>
                        <Input
                          value={draft.nickname}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, nickname: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={draft.email}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, email: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Celular</Label>
                        <Input
                          type="tel"
                          value={draft.phone}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, phone: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de nascimento</Label>
                        <Input
                          type="date"
                          value={draft.birthDate}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, birthDate: event.target.value }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={draft.status}
                          onValueChange={(value) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    status: value as "active" | "inactive",
                                  }
                                : current
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Ativo</SelectItem>
                            <SelectItem value="inactive">Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                        {editingHasMembership === false &&
                        (draft.role === "player" || draft.role === "member") ? (
                          <p className="text-xs text-muted-foreground">
                            Para ativar, escolha uma categoria de ranking abaixo.
                          </p>
                        ) : null}
                      </div>
                      {editingHasMembership === false &&
                      (draft.role === "player" || draft.role === "member") ? (
                        <div className="space-y-2">
                          <Label>Categoria do ranking</Label>
                          <Select
                            value={draft.rankingId}
                            onValueChange={(value) =>
                              setDraft((current) =>
                                current ? { ...current, rankingId: value } : current
                              )
                            }
                            disabled={rankings.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  rankings.length === 0
                                    ? "Carregando..."
                                    : "Selecione"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {rankings.map((ranking) => (
                                <SelectItem
                                  key={ranking.id}
                                  value={String(ranking.id)}
                                >
                                  {ranking.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label>Permissao</Label>
                        <Select
                          value={draft.role}
                          onValueChange={(value) =>
                            setDraft((current) =>
                              current ? { ...current, role: value } : current
                            )
                          }
                          disabled={viewerRole !== "admin"}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {viewerRole === "admin" ? (
                              <>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="collaborator">
                                  Colaborador
                                </SelectItem>
                                <SelectItem value="player">Jogador</SelectItem>
                              </>
                            ) : (
                              <SelectItem value={draft.role}>
                                {roleLabel(draft.role)}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {viewerRole === "admin" && draft.role === "collaborator" ? (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Categorias permitidas</Label>
                          <div className="flex flex-wrap gap-2">
                            {rankings.map((ranking) => {
                              const value = String(ranking.id)
                              const selected =
                                draft.collaboratorRankingIds.includes(value)
                              return (
                                <label
                                  key={ranking.id}
                                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      setDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              collaboratorRankingIds: selected
                                                ? current.collaboratorRankingIds.filter(
                                                    (item) => item !== value
                                                  )
                                                : [
                                                    ...current.collaboratorRankingIds,
                                                    value,
                                                  ],
                                            }
                                          : current
                                      )
                                    }
                                  />
                                  <span>{ranking.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label>Nova senha</Label>
                        <div className="relative">
                          <Input
                            type={showEditPassword ? "text" : "password"}
                            value={draft.password}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? { ...current, password: event.target.value }
                                  : current
                              )
                            }
                            placeholder="Digite a nova senha"
                            className="pr-12"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowEditPassword((prev) => !prev)}
                            aria-label={
                              showEditPassword
                                ? "Ocultar senha"
                                : "Mostrar senha"
                            }
                          >
                            {showEditPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Confirmar senha</Label>
                        <div className="relative">
                          <Input
                            type={showEditPasswordConfirm ? "text" : "password"}
                            value={draft.passwordConfirm}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      passwordConfirm: event.target.value,
                                    }
                                  : current
                              )
                            }
                            placeholder="Digite novamente"
                            className="pr-12"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setShowEditPasswordConfirm((prev) => !prev)
                            }
                            aria-label={
                              showEditPasswordConfirm
                                ? "Ocultar senha"
                                : "Mostrar senha"
                            }
                          >
                            {showEditPasswordConfirm ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={saving}
                        >
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null)
                            setDraft(null)
                            setEditingHasMembership(null)
                            setDraftStatusInitial(null)
                          }}
                          disabled={saving}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {user.memberships.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Vinculos de ranking
                      </p>
                      {user.memberships.map((membership) => {
                        const selectId = `membership-ranking-${membership.id}`
                        const selectedRankingId =
                          membershipRankingMap[membership.id] ??
                          String(membership.rankingId)
                        const hasRankingChange =
                          Number(selectedRankingId) !== membership.rankingId

                        return (
                          <div
                            key={membership.id}
                            className="flex flex-col gap-3 rounded-lg border bg-background/80 p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {membership.rankingName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Posicao {membership.position ?? "-"}
                                </p>
                                {membership.licensePosition ? (
                                  <p className="text-xs text-muted-foreground">
                                    Licenca na posicao {membership.licensePosition}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    membership.isBluePoint ? "default" : "secondary"
                                  }
                                >
                                  Ponto azul
                                </Badge>
                                <Badge
                                  variant={
                                    membership.isAccessChallenge
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  Acesso
                                </Badge>
                                <Badge
                                  variant={
                                    membership.isSuspended ? "destructive" : "secondary"
                                  }
                                >
                                  Licenca
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-1 flex-col gap-2">
                                <Label htmlFor={selectId} className="text-xs">
                                  Categoria do ranking
                                </Label>
                                <Select
                                  value={selectedRankingId}
                                  onValueChange={(value) =>
                                    setMembershipRankingMap((current) => ({
                                      ...current,
                                      [membership.id]: value,
                                    }))
                                  }
                                  disabled={saving || rankings.length === 0}
                                >
                                  <SelectTrigger id={selectId} className="h-9 w-full">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rankings.map((ranking) => (
                                      <SelectItem
                                        key={ranking.id}
                                        value={String(ranking.id)}
                                      >
                                        {ranking.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleMoveMembership(
                                      user.id,
                                      membership.id,
                                      Number(selectedRankingId)
                                    )
                                  }
                                  disabled={
                                    saving ||
                                    rankings.length === 0 ||
                                    !hasRankingChange
                                  }
                                >
                                  Alterar categoria
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleToggleMembership(
                                      user.id,
                                      membership,
                                      "is_blue_point",
                                      !membership.isBluePoint
                                    )
                                  }
                                  disabled={saving}
                                >
                                  {membership.isBluePoint
                                    ? "Remover ponto azul"
                                    : "Dar ponto azul"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleToggleMembership(
                                      user.id,
                                      membership,
                                      "is_access_challenge",
                                      !membership.isAccessChallenge
                                    )
                                  }
                                  disabled={saving}
                                >
                                  {membership.isAccessChallenge
                                    ? "Remover acesso"
                                    : "Dar acesso"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={membership.isSuspended ? "default" : "ghost"}
                                  onClick={() =>
                                    handleToggleMembership(
                                      user.id,
                                      membership,
                                      "is_suspended",
                                      !membership.isSuspended
                                    )
                                  }
                                  disabled={saving}
                                >
                                  {membership.isSuspended
                                    ? "Reativar"
                                    : "Colocar em licenca"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sem vinculos de ranking.
                    </p>
                  )}
                </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum usuario encontrado para essa busca.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
