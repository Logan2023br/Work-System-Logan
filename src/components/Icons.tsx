const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const IconDesk = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M4 5h6v14H4zM14 5h6v7h-6zM14 16h6v3h-6z" /></svg>
)
export const IconClock = () => (
  <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>
)
export const IconPlug = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21" /></svg>
)
export const IconThink = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.7V17h5v-1.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3zM10 20.5h4" /></svg>
)
export const IconBack = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...s}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
)
export const IconChev = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...s}><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
)
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
)
export const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...s} strokeWidth={2.1}><path d="M5 12.5 10 17.5 19 7" /></svg>
)
export const IconWrench = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...s} strokeWidth={1.9}>
    <path d="M15.5 4a5 5 0 0 0-4.6 7l-6 6a1.8 1.8 0 0 0 2.6 2.6l6-6A5 5 0 1 0 15.5 4z" />
  </svg>
)
export const IconDrive = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M9 3.5h6l5.5 9.5-3 5.5h-11l-3-5.5z" /><path d="M9 3.5 3.5 13h17" /></svg>
)
export const IconSheet = () => (
  <svg viewBox="0 0 24 24" {...s}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M3.5 15h17M9.5 4v16" /></svg>
)
export const IconDoc = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M6 3.5h8l4.5 4.5v12.5H6z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" /></svg>
)
export const IconFolder = () => (
  <svg viewBox="0 0 24 24" {...s}><path d="M3.5 6.5h6l2 2.5h9v9.5h-17z" /></svg>
)
export const IconApi = () => (
  <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="2.4" /><path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6" /></svg>
)
export const IconAlert = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...s} strokeWidth={1.9}><path d="M12 8v5M12 16.2v.1" /><circle cx="12" cy="12" r="8.5" /></svg>
)

export function SourceIcon({ kind }: { kind: string }) {
  if (kind === 'drive') return <IconDrive />
  if (kind === 'sheet') return <IconSheet />
  if (kind === 'doc') return <IconDoc />
  if (kind === 'local') return <IconFolder />
  return <IconApi />
}
export const IconTeam = () => (
  <svg viewBox="0 0 24 24" {...s}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.3-.3 4.4 1.2 4.9 4.3" /></svg>
)
