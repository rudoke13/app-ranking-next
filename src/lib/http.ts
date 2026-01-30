export type ApiSuccess<T> = { ok: true; data: T }
export type ApiError = { ok: false; message: string; issues?: unknown }
export type ApiResult<T> = ApiSuccess<T> | ApiError

async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  body?: unknown
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers)

  let requestBody = options.body

  if (body !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    requestBody = JSON.stringify(body)
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      body: requestBody,
      cache: "no-store",
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        message: payload?.message ?? "Erro ao carregar dados.",
        issues: payload?.issues,
      }
    }

    return { ok: true, data: payload.data as T }
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

export function apiGet<T>(url: string, options?: RequestInit) {
  return apiRequest<T>(url, { ...options, method: "GET" })
}

export function apiPost<T>(url: string, body?: unknown, options?: RequestInit) {
  return apiRequest<T>(url, { ...options, method: "POST" }, body)
}

export function apiPatch<T>(url: string, body?: unknown, options?: RequestInit) {
  return apiRequest<T>(url, { ...options, method: "PATCH" }, body)
}

export function apiDelete<T>(url: string, options?: RequestInit) {
  return apiRequest<T>(url, { ...options, method: "DELETE" })
}
