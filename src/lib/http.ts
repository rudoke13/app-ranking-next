export type ApiSuccess<T> = { ok: true; data: T }
export type ApiError = {
  ok: false
  message: string
  issues?: unknown
  status?: number
}
export type ApiResult<T> = ApiSuccess<T> | ApiError

type ApiRequestOptions = RequestInit & {
  cacheTtlMs?: number
  fresh?: boolean
}

type CachedGetEntry = {
  expiresAt: number
  result: ApiResult<unknown>
}

type HttpCacheGlobal = typeof globalThis & {
  __apiGetCache?: Map<string, CachedGetEntry>
  __apiGetInFlight?: Map<string, Promise<ApiResult<unknown>>>
}

const httpCacheGlobal = globalThis as HttpCacheGlobal
const apiGetCache = httpCacheGlobal.__apiGetCache ?? new Map<string, CachedGetEntry>()
const apiGetInFlight =
  httpCacheGlobal.__apiGetInFlight ?? new Map<string, Promise<ApiResult<unknown>>>()

if (!httpCacheGlobal.__apiGetCache) {
  httpCacheGlobal.__apiGetCache = apiGetCache
}

if (!httpCacheGlobal.__apiGetInFlight) {
  httpCacheGlobal.__apiGetInFlight = apiGetInFlight
}

const DEFAULT_API_GET_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.NEXT_PUBLIC_API_GET_CACHE_TTL_MS ?? "25000") || 0
)
const MAX_API_GET_CACHE_ENTRIES = 200
const IS_BROWSER = typeof window !== "undefined"
const AUTH_ROUTE_PREFIXES_WITH_EXPECTED_401 = [
  "/api/auth/login",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/validate",
] as const

const normalizeHeaders = (headers?: HeadersInit) => {
  const normalized = new Headers(headers)
  const pairs = Array.from(normalized.entries())
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(pairs)
}

const buildGetCacheKey = (url: string, options: RequestInit) => {
  return JSON.stringify({
    url,
    credentials: options.credentials ?? "same-origin",
    mode: options.mode ?? "cors",
    headers: normalizeHeaders(options.headers),
  })
}

const readGetCache = <T>(key: string): ApiResult<T> | null => {
  const cached = apiGetCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    apiGetCache.delete(key)
    return null
  }
  return cached.result as ApiResult<T>
}

const writeGetCache = <T>(key: string, result: ApiResult<T>, ttlMs: number) => {
  if (ttlMs <= 0 || !result.ok) return

  if (apiGetCache.size >= MAX_API_GET_CACHE_ENTRIES) {
    const oldestKey = apiGetCache.keys().next().value
    if (oldestKey) {
      apiGetCache.delete(oldestKey)
    }
  }

  apiGetCache.set(key, {
    result,
    expiresAt: Date.now() + ttlMs,
  })
}

export const invalidateApiGetCache = () => {
  apiGetCache.clear()
}

async function apiRequest<T>(
  url: string,
  options: ApiRequestOptions = {},
  body?: unknown
): Promise<ApiResult<T>> {
  const { cacheTtlMs, fresh, ...requestOptions } = options
  const method = (requestOptions.method ?? "GET").toUpperCase()
  const isGet = method === "GET" && body === undefined
  const ttlMs = cacheTtlMs ?? DEFAULT_API_GET_CACHE_TTL_MS
  const allowCache = IS_BROWSER && isGet && ttlMs > 0 && !fresh
  const cacheKey = allowCache ? buildGetCacheKey(url, requestOptions) : null

  if (cacheKey) {
    const cached = readGetCache<T>(cacheKey)
    if (cached) return cached

    const pending = apiGetInFlight.get(cacheKey)
    if (pending) {
      return pending as Promise<ApiResult<T>>
    }
  }

  const headers = new Headers(requestOptions.headers)

  let requestBody = requestOptions.body

  if (body !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    requestBody = JSON.stringify(body)
  }

  try {
    const executeRequest = async (
      cacheModeOverride?: RequestCache
    ): Promise<ApiResult<T>> => {
      const cacheMode: RequestCache =
        cacheModeOverride ??
        requestOptions.cache ??
        (isGet ? (fresh ? "no-store" : "default") : "no-store")

      const response = await fetch(url, {
        ...requestOptions,
        method,
        headers,
        body: requestBody,
        credentials: requestOptions.credentials ?? "same-origin",
        cache: cacheMode,
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.ok) {
        return {
          ok: false,
          message: payload?.message ?? "Erro ao carregar dados.",
          issues: payload?.issues,
          status: response.status,
        }
      }

      return { ok: true, data: payload.data as T }
    }

    const shouldRedirectOn401 =
      IS_BROWSER &&
      !AUTH_ROUTE_PREFIXES_WITH_EXPECTED_401.some((prefix) =>
        url.startsWith(prefix)
      )

    const executeWith401Retry = async () => {
      let result = await executeRequest()

      if (
        isGet &&
        !fresh &&
        !result.ok &&
        result.status === 401 &&
        shouldRedirectOn401
      ) {
        // One retry with no-store avoids redirect loops on transient auth races.
        const retryResult = await executeRequest("no-store")
        if (retryResult.ok || retryResult.status !== 401) {
          result = retryResult
        }
      }

      if (
        shouldRedirectOn401 &&
        !result.ok &&
        result.status === 401 &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login"
      }

      return result
    }

    if (cacheKey) {
      const pending = executeWith401Retry()
        .then((result) => {
          writeGetCache(cacheKey, result, ttlMs)
          return result
        })
        .finally(() => {
          apiGetInFlight.delete(cacheKey)
        })

      apiGetInFlight.set(cacheKey, pending as Promise<ApiResult<unknown>>)
      return pending
    }

    const result = await executeWith401Retry()
    if (!isGet && result.ok) {
      invalidateApiGetCache()
    }
    return result
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Erro inesperado na requisicao.",
    }
  }
}

export function apiGet<T>(url: string, options?: ApiRequestOptions) {
  return apiRequest<T>(url, { ...options, method: "GET" })
}

export function apiPost<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>(url, { ...options, method: "POST" }, body)
}

export function apiPatch<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>(url, { ...options, method: "PATCH" }, body)
}

export function apiDelete<T>(url: string, options?: ApiRequestOptions) {
  return apiRequest<T>(url, { ...options, method: "DELETE" })
}
