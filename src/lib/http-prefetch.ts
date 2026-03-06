import { apiGet } from "@/lib/http"

type PrefetchOptions = {
  cacheTtlMs?: number
  minIntervalMs?: number
}

const IS_BROWSER = typeof window !== "undefined"
const DEFAULT_PREFETCH_CACHE_TTL_MS = 0
const DEFAULT_PREFETCH_MIN_INTERVAL_MS = 5_000

type PrefetchGlobal = typeof globalThis & {
  __apiPrefetchAt?: Map<string, number>
  __apiPrefetchInFlight?: Set<string>
}

const prefetchGlobal = globalThis as PrefetchGlobal
const prefetchAt = prefetchGlobal.__apiPrefetchAt ?? new Map<string, number>()
const prefetchInFlight =
  prefetchGlobal.__apiPrefetchInFlight ?? new Set<string>()

if (!prefetchGlobal.__apiPrefetchAt) {
  prefetchGlobal.__apiPrefetchAt = prefetchAt
}

if (!prefetchGlobal.__apiPrefetchInFlight) {
  prefetchGlobal.__apiPrefetchInFlight = prefetchInFlight
}

const runIdle = (task: () => void) => {
  if (!IS_BROWSER) return
  const idleCallback = (
    window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number
    }
  ).requestIdleCallback
  if (typeof idleCallback === "function") {
    idleCallback(task, { timeout: 1_500 })
    return
  }
  window.setTimeout(task, 120)
}

export const prefetchApiGet = (url: string, options?: PrefetchOptions) => {
  if (!IS_BROWSER) return

  const now = Date.now()
  const minIntervalMs =
    options?.minIntervalMs ?? DEFAULT_PREFETCH_MIN_INTERVAL_MS
  const lastPrefetchAt = prefetchAt.get(url) ?? 0
  if (now - lastPrefetchAt < minIntervalMs) return
  if (prefetchInFlight.has(url)) return

  prefetchAt.set(url, now)
  runIdle(() => {
    prefetchInFlight.add(url)
    void apiGet(url, {
      cacheTtlMs: options?.cacheTtlMs ?? DEFAULT_PREFETCH_CACHE_TTL_MS,
    }).finally(() => {
      prefetchInFlight.delete(url)
    })
  })
}
