import type { Workspace, Registry, Task, ActivityEvent, Connection, Reflect } from './types'

const base = `${import.meta.env.BASE_URL}data/`

async function grab<T>(path: string): Promise<T> {
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`Không đọc được ${path} (${res.status})`)
  return res.json() as Promise<T>
}

/** Mỗi task nằm trong file riêng — thay dữ liệu thật chỉ cần ghi đè file đó. */
export async function loadWorkspace(): Promise<Workspace> {
  const registry = await grab<Registry>('registry.json')

  const [tasks, activity, connections, reflect] = await Promise.all([
    Promise.all(registry.tasks.map((t) => grab<Task>(t.file))),
    grab<{ events: ActivityEvent[] }>('activity.json').then((d) => d.events),
    grab<{ connections: Connection[] }>('connections.json').then((d) => d.connections),
    grab<Reflect>('reflect.json'),
  ])

  return { registry, tasks, activity, connections, reflect }
}
