import { Hono } from 'hono'
import type { Context } from 'hono'
import type { z } from 'zod'
import { commandInputSchema, pauseInputSchema, scheduleInputSchema, workHoursSchema, zodMessage } from '../../shared/schema.js'
import { cancelCommand, createCommand, previewSchedule, setPaused, setSchedule, setWorkHours } from '../core/control.js'
import { invalid } from '../core/errors.js'
import { deactivateUser, toMeDTO } from '../core/users.js'
import { getWorkspace, listPeople } from '../core/workspace.js'
import { listConnections, revokeConnection } from '../core/oauth-tokens.js'
import { mcpResource } from './oauth.js'
import { requireUser, sameOrigin, type AppDeps, type AppEnv } from './app.js'

async function bodyOf<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.output<S>> {
  const raw = await c.req.json().catch(() => null)
  const r = schema.safeParse(raw)
  if (!r.success) throw invalid(zodMessage(r.error))
  return r.data
}

export function apiRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  r.use('*', requireUser(deps))
  r.use('*', sameOrigin(deps))

  r.get('/me', (c) => c.json(toMeDTO(c.get('user'))))

  r.get('/people', async (c) => c.json(await listPeople(deps.db, deps.now())))

  r.get('/workspace/:id', async (c) => {
    const viewer = c.get('user')
    const id = c.req.param('id')
    return c.json(await getWorkspace(deps.db, viewer, id === 'me' ? viewer.id : id, deps.now()))
  })

  r.post('/admin/users/:id/deactivate', async (c) => {
    await deactivateUser(deps.db, c.get('user'), c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })

  r.get('/connections', async (c) =>
    c.json({ connectorUrl: mcpResource(deps.config), links: await listConnections(deps.db, c.get('user').id, deps.now()) }),
  )

  r.post('/connections/:id/revoke', async (c) => {
    await revokeConnection(deps.db, c.get('user').id, c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })

  r.post('/tasks/:slug/commands', async (c) => {
    const cmd = await createCommand(deps.db, c.get('user'), c.req.param('slug'), await bodyOf(c, commandInputSchema), deps.now())
    return c.json(cmd, 201)
  })

  r.post('/commands/:id/cancel', async (c) => {
    await cancelCommand(deps.db, c.get('user'), c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })

  r.put('/tasks/:slug/schedule', async (c) => {
    const t = await setSchedule(deps.db, c.get('user'), c.req.param('slug'), await bodyOf(c, scheduleInputSchema), deps.now())
    return c.json({ cron: t.cron, scheduleLabel: t.scheduleLabel, nextRun: t.nextRunAt?.toISOString() ?? null })
  })

  r.put('/tasks/:slug/pause', async (c) => {
    const { paused } = await bodyOf(c, pauseInputSchema)
    const t = await setPaused(deps.db, c.get('user'), c.req.param('slug'), paused, deps.now())
    return c.json({ paused: t.paused, nextRun: t.nextRunAt?.toISOString() ?? null })
  })

  r.get('/schedule/preview', (c) => c.json(previewSchedule(c.req.query('cron') ?? '', deps.now())))

  r.put('/me/work-hours', async (c) => c.json(toMeDTO(await setWorkHours(deps.db, c.get('user'), await bodyOf(c, workHoursSchema)))))

  return r
}
