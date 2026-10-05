/** Lỗi theo RFC 6749 §5.2 / RFC 7591 §3.2.2 — trả về `{ error, error_description }`. */
export class OAuthError extends Error {
  readonly error: string
  readonly status: 400 | 401
  constructor(error: string, description: string, status: 400 | 401 = 400) {
    super(description)
    this.error = error
    this.status = status
  }
}
