import { and, count, eq } from 'drizzle-orm'
import type { CommandDTO, SchedulePreviewDTO } from '../../shared/dto.js'
import { describeCron } from '../../shared/cronText.js'
import { LIMITS, type CommandInput, type ScheduleInput, type WorkHours } from '../../shared/schema.js'
import { activity, commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { toCommandDTO, type TaskRow } from './dto.js'
import { conflict, invalid, notFound } from './errors.js'
import { isValidCron, nextRunAfter, previewRuns } from './schedule.js'
import { assertCron, findOwnTask } from './tasks.js'
import { isUuid } from './tokens.js'
import type { User } from './users.js'

export async function createCommand(db: Db, owner: User, slug: string, input: CommandInput, now: Date): Promise<CommandDTO> {
  const task = await findOwnTask(db, owner, slug)
  const action =
    input.actionId === 'run'
      ? { label: 'Chạy ngay', instructions: task.instructions }
      : task.actions.find((a) => a.id === input.actionId)
  if (!action) throw invalid(`Task "${task.name}" không có nút "${input.actionId}"`)

  const [{ n }] = await db
    .select({ n: count() })
    .from(commands)
    .where(and(eq(commands.taskId, task.id), eq(commands.status, 'pending')))
  if (n >= LIMITS.pendingCommandsPerTask) throw conflict(`Đã có ${LIMITS.pendingCommandsPerTask} lệnh đang chờ Claude cho task này`)

  const [row] = await db
    .insert(commands)
    .values({ taskId: task.id, ownerId: owner.id, actionId: input.actionId, label: action.label, instructions: action.instructions, note: input.note || null, createdAt: now })
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: 'wait', text: `Gửi lệnh "${action.label}" — chờ Claude nhận` })
  return toCommandDTO(row)
}

export async function cancelCommand(db: Db, owner: User, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) throw notFound('Không tìm thấy lệnh')
  const row = await db.query.commands.findFirst({ where: and(eq(commands.id, id), eq(commands.ownerId, owner.id)) })
  if (!row) throw notFound('Không tìm thấy lệnh')
  const done = await db
    .update(commands)
    .set({ status: 'cancelled', finishedAt: now, result: 'Bạn đã hủy' })
    .where(and(eq(commands.id, id), eq(commands.status, 'pending')))
    .returning({ id: commands.id })
  if (done.length === 0) throw conflict('Lệnh đã được Claude nhận hoặc đã xong, không hủy được nữa')
}

export async function setSchedule(db: Db, owner: User, slug: string, input: ScheduleInput, now: Date): Promise<TaskRow> {
  const task = await findOwnTask(db, owner, slug)
  assertCron(input.cron)
  const [row] = await db
    .update(tasks)
    .set({
      cron: input.cron,
      scheduleLabel: input.scheduleLabel || describeCron(input.cron) || input.cron,
      nextRunAt: task.paused ? null : nextRunAfter(input.cron, now),
      updatedAt: now,
    })
    .where(eq(tasks.id, task.id))
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: 'ok', text: `Đổi lịch thành ${row.scheduleLabel}` })
  return row
}

export async function setPaused(db: Db, owner: User, slug: string, paused: boolean, now: Date): Promise<TaskRow> {
  const task = await findOwnTask(db, owner, slug)
  const [row] = await db
    .update(tasks)
    .set({ paused, nextRunAt: paused ? null : nextRunAfter(task.cron, now), updatedAt: now })
    .where(eq(tasks.id, task.id))
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: paused ? 'wait' : 'ok', text: paused ? 'Tạm dừng lịch' : 'Chạy lại theo lịch' })
  return row
}

export async function setWorkHours(db: Db, owner: User, input: WorkHours): Promise<User> {
  const [row] = await db
    .update(users)
    .set({ workDays: [...input.workDays].sort((a, b) => a - b), workStart: input.workStart, workEnd: input.workEnd })
    .where(eq(users.id, owner.id))
    .returning()
  return row
}

export function previewSchedule(cron: string, now: Date): SchedulePreviewDTO {
  if (!isValidCron(cron)) return { valid: false, label: null, next: [] }
  return { valid: true, label: describeCron(cron), next: previewRuns(cron, now).map((d) => d.toISOString()) }
}
