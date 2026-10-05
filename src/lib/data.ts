import { api } from './api'
import type { Me, MyConnections, Person, Workspace } from './types'

export const loadMe = () => api<Me>('/api/me')
export const loadPeople = () => api<Person[]>('/api/people')
export const loadWorkspace = (id: string) => api<Workspace>(`/api/workspace/${encodeURIComponent(id)}`)
export const logout = () => api<{ ok: true }>('/auth/logout', { method: 'POST' })
export const loadMyConnections = () => api<MyConnections>('/api/connections')
export const revokeLink = (id: string) => api<{ ok: true }>(`/api/connections/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
