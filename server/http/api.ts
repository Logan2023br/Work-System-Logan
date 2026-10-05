import { Hono } from 'hono'
import { deactivateUser, toMeDTO } from '../core/users.js'
import { getWorkspace, listPeople } from '../core/workspace.js'
import { requireUser, sameOrigin, type AppDeps, type AppEnv } from './app.js'

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

  return r
}
