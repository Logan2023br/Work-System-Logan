export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http', body?.message ?? `Lỗi ${res.status}`)
  return body as T
}
