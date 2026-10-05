export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'conflict'

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  conflict: 409,
}

export class AppError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
  get status() {
    return STATUS[this.code]
  }
}

export const unauthorized = (m = 'Bạn cần đăng nhập') => new AppError('unauthorized', m)
export const forbidden = (m = 'Bạn không có quyền làm việc này') => new AppError('forbidden', m)
export const notFound = (m = 'Không tìm thấy') => new AppError('not_found', m)
export const invalid = (m: string) => new AppError('invalid', m)
export const conflict = (m: string) => new AppError('conflict', m)
