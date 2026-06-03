"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, MessageCircle, Swords } from "lucide-react"

import { apiGet, apiPost } from "@/lib/http"
import { buildWhatsAppUrl } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 45_000

type NotificationItem = {
  id: number
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  isRead: boolean
  createdAt: string | null
}

type NotificationsResponse = {
  unreadCount: number
  items: NotificationItem[]
}

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const formatRelative = (iso: string | null) => {
  if (!iso) return ""
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return ""
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "ontem"
  if (days < 7) return `há ${days} dias`
  return date.toLocaleDateString("pt-BR")
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    const response = await apiGet<NotificationsResponse>("/api/notifications", {
      fresh: true,
    })
    if (!mountedRef.current) return
    if (response.ok) {
      setItems(response.data.items)
      setUnreadCount(response.data.unreadCount)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [load])

  const markRead = useCallback(async (id: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      )
    )
    setUnreadCount((current) => Math.max(0, current - 1))
    await apiPost(`/api/notifications/${id}/read`).catch(() => undefined)
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)
    await apiPost("/api/notifications/read-all").catch(() => undefined)
  }, [])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Notificacoes"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-2 top-17 z-50 overflow-hidden rounded-xl border bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">
                Notificacoes
              </p>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Marcar todas como lidas
                </button>
              ) : null}
            </div>

            <div className="max-h-[60vh] overflow-y-auto sm:max-h-[70vh]">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma notificacao por aqui.
                </p>
              ) : (
                <ul className="divide-y">
                  {items.map((item) => {
                    const data = item.data ?? {}
                    const phone = asString(data.challengerPhone)
                    const challengerName =
                      asString(data.challengerName) ?? "o jogador"
                    const rankingName = asString(data.rankingName) ?? "o ranking"
                    const isChallenge =
                      item.type === "challenge_received" &&
                      asNumber(data.challengeId) !== null
                    const whatsappUrl =
                      isChallenge && phone
                        ? buildWhatsAppUrl(
                            phone,
                            `Oi ${challengerName}! Recebi seu desafio em ${rankingName}. Vamos marcar nosso jogo o quanto antes?`
                          )
                        : null

                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "px-4 py-3",
                          item.isRead ? "bg-transparent" : "bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {!item.isRead ? (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                          ) : (
                            <span className="mt-1.5 size-2 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {item.title}
                            </p>
                            {item.body ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.body}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {whatsappUrl ? (
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => markRead(item.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                                >
                                  <MessageCircle className="size-3.5" />
                                  Combinar no WhatsApp
                                </a>
                              ) : null}
                              {isChallenge ? (
                                <Link
                                  href="/desafios"
                                  onClick={() => {
                                    markRead(item.id)
                                    setOpen(false)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                >
                                  <Swords className="size-3.5" />
                                  Ver desafios
                                </Link>
                              ) : null}
                              {!item.isRead ? (
                                <button
                                  type="button"
                                  onClick={() => markRead(item.id)}
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                                >
                                  Marcar como lida
                                </button>
                              ) : null}
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {formatRelative(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
