import { api } from './api'
import type { Command, Me, MyConnections, Person, Reflect, ReportWeek, SchedulePreview, WorkHours, Workspace } from './types'

export const loadMe = () => api<Me>('/api/me')
export const loadPeople = () => api<Person[]>('/api/people')
export const loadWorkspace = (id: string) => api<Workspace>(`/api/workspace/${encodeURIComponent(id)}`)
export const logout = () => api<{ ok: true }>('/auth/logout', { method: 'POST' })
export const loadMyConnections = () => api<MyConnections>('/api/connections')
export const revokeLink = (id: string) => api<{ ok: true }>(`/api/connections/${encodeURIComponent(id)}/revoke`, { method: 'POST' })

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const sendCommand = (slug: string, actionId: string, note?: string) =>
  api<Command>(`/api/tasks/${encodeURIComponent(slug)}/commands`, json('POST', { actionId, note: note || undefined }))
export const cancelCommandApi = (id: string) => api<{ ok: true }>(`/api/commands/${encodeURIComponent(id)}/cancel`, json('POST'))
export const saveSchedule = (slug: string, cron: string, scheduleLabel?: string) =>
  api<{ cron: string; scheduleLabel: string; nextRun: string | null }>(`/api/tasks/${encodeURIComponent(slug)}/schedule`, json('PUT', { cron, scheduleLabel: scheduleLabel || undefined }))
export const savePaused = (slug: string, paused: boolean) =>
  api<{ paused: boolean; nextRun: string | null }>(`/api/tasks/${encodeURIComponent(slug)}/pause`, json('PUT', { paused }))
export const previewCron = (cron: string) => api<SchedulePreview>(`/api/schedule/preview?cron=${encodeURIComponent(cron)}`)
export const saveWorkHours = (v: WorkHours) => api<Me>('/api/me/work-hours', json('PUT', v))
export const loadReportWeeks = (id: string) => api<ReportWeek[]>(`/api/workspace/${encodeURIComponent(id)}/reports`)
export const loadReport = (id: string, week: string) => api<Reflect>(`/api/workspace/${encodeURIComponent(id)}/reports/${encodeURIComponent(week)}`)
