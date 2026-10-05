import { and, eq, inArray, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import type { DispatchItem } from '../../shared/dto.js'
import { activity, commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import type { CommandRow, TaskRow } from './dto.js'
import type { User } from './users.js'

export const LEASE_MS = 60 * 60_000

const brief = (t: TaskRow) => ({ slug: t.slug, name: t.name, instructions: t.instructions, skill: t.skill })

/**
 * Giao việc cho Claude của `owner`: lệnh từ web đang chờ + task đến hạn.
 * Mỗi việc nhận một lease 60 phút; `UPDATE … WHERE … RETURNING` bảo đảm hai lần gọi chồng nhau không nhận cùng một việc.
 */
export async function dispatch(db: Db, owner: User, now: Date): Promise<DispatchItem[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS)
  const stale = new Date(now.getTime() - LEASE_MS)

  return db.transaction(async (tx) => {
    await tx.update(users).set({ lastSeenAt: now }).where(eq(users.id, owner.id))

    await tx
      .update(commands)
      .set({ status: 'expired', finishedAt: now, result: 'Claude đã nhận nhưng không báo kết quả trong 60 phút' })
      .where(and(eq(commands.ownerId, owner.id), eq(commands.status, 'claimed'), lt(commands.claimedAt, stale)))

    const claimed = (
      await tx
        .update(commands)
        .set({ status: 'claimed', claimedAt: now, leaseId: sql`gen_random_uuid()` })
        .where(and(eq(commands.ownerId, owner.id), eq(commands.status, 'pending')))
        .returning()
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    // Nhiều "Chạy ngay" cho cùng task → giữ lệnh sớm nhất, đóng phần còn lại.
    const runByTask = new Map<string, CommandRow>()
    const keep: CommandRow[] = []
    const merged: string[] = []
    for (const c of claimed) {
      if (c.actionId === 'run') {
        if (runByTask.has(c.taskId)) {
          merged.push(c.id)
          continue
        }
        runByTask.set(c.taskId, c)
      }
      keep.push(c)
    }
    if (merged.length) {
      await tx.update(commands).set({ status: 'done', finishedAt: now, result: 'Gộp với một lệnh "Chạy ngay" khác' }).where(inArray(commands.id, merged))
    }
    // "Chạy ngay" khóa luôn task để lần chạy theo lịch không chạy trùng.
    for (const c of runByTask.values()) {
      await tx.update(tasks).set({ leaseId: c.leaseId, leaseUntil }).where(eq(tasks.id, c.taskId))
    }

    const runTaskIds = [...runByTask.keys()]
    const due = (
      await tx
        .update(tasks)
        .set({ leaseId: sql`gen_random_uuid()`, leaseUntil })
        .where(
          and(
            eq(tasks.ownerId, owner.id),
            eq(tasks.paused, false),
            lte(tasks.nextRunAt, now),
            or(isNull(tasks.leaseUntil), lt(tasks.leaseUntil, now)),
            runTaskIds.length ? notInArray(tasks.id, runTaskIds) : undefined,
          ),
        )
        .returning()
    ).sort((a, b) => a.position - b.position)

    const ids = [...new Set(keep.map((c) => c.taskId))]
    const byId = new Map((ids.length ? await tx.select().from(tasks).where(inArray(tasks.id, ids)) : []).map((t) => [t.id, t]))

    if (keep.length) {
      await tx.insert(activity).values(
        keep.map((c) => ({ ownerId: owner.id, taskId: c.taskId, at: now, level: 'wait' as const, text: `Claude đã nhận lệnh "${c.label}"` })),
      )
    }

    return [
      ...keep.map((c) => ({
        leaseId: c.leaseId!,
        loai: 'lenh' as const,
        task: brief(byId.get(c.taskId)!),
        lenh: { id: c.id, actionId: c.actionId, label: c.label, instructions: c.instructions, note: c.note },
      })),
      ...due.map((t) => ({ leaseId: t.leaseId!, loai: 'lich' as const, task: brief(t) })),
    ]
  })
}
