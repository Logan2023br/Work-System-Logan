import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { runReportSchema, slugSchema, taskDefinitionSchema, taskPatchSchema, weeklyReportInputSchema } from '../../shared/schema.js'
import { users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { AppError, unauthorized } from '../core/errors.js'
import { dispatch } from '../core/dispatch.js'
import { createTask, getMyTask, listMyTasks, reportRun, submitWeeklyReport, updateTask } from '../core/tasks.js'
import type { User } from '../core/users.js'
import { eq } from 'drizzle-orm'

export interface ToolDeps {
  db: Db
  now: () => Date
  publicUrl: string
}

export const MCP_INSTRUCTIONS = [
  'Work System là bàn điều phối công việc của team BraveBits.',
  'Vòng Điều phối (tác vụ hẹn giờ 15 phút): gọi dieu_phoi; nếu không có việc thì kết thúc ngay. Với mỗi việc: làm theo instructions của task (và instructions/note của lệnh nếu là lệnh), dùng skill được ghi nếu có, rồi LUÔN gọi bao_ket_qua kèm đúng leaseId — kể cả khi lỗi. Lỗi một việc không được làm dừng các việc khác. Không hỏi lại người dùng trong vòng Điều phối.',
  'Ngoài vòng Điều phối: tao_task để khai báo việc định kỳ, sua_task để cập nhật, xem_task để xem, bao_ket_qua (không leaseId) khi người dùng nhờ chạy tay, nop_bao_cao_tuan cho báo cáo tuần.',
  'Đồng nghiệp xem được mọi thứ ghi vào đây: KHÔNG BAO GIỜ ghi mật khẩu, API key, token hay dữ liệu cá nhân của khách hàng.',
  'slug: chữ thường không dấu, số và dấu gạch ngang. cron: 5 trường, theo giờ Việt Nam.',
].join(' ')

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
const ok = (summary: string, data: unknown): ToolResult => ({ content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }] })
const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } }

export function registerTools(server: McpServer, deps: ToolDeps) {
  async function owner(ctx: Ctx): Promise<User> {
    const id = ctx.http?.authInfo?.extra?.userId
    if (typeof id !== 'string') throw unauthorized('Thiếu danh tính người dùng')
    const u = await deps.db.query.users.findFirst({ where: eq(users.id, id) })
    if (!u?.active) throw unauthorized('Tài khoản không còn hoạt động')
    return u
  }

  /** Bọc handler: lỗi nghiệp vụ → isError với thông điệp để Claude tự sửa; lỗi khác → thông điệp chung + log. */
  function guarded<A>(fn: (args: A, me: User) => Promise<ToolResult>) {
    return async (args: A, ctx: Ctx): Promise<ToolResult> => {
      try {
        return await fn(args, await owner(ctx))
      } catch (e) {
        if (e instanceof AppError) return fail(e.message)
        console.error('[mcp] lỗi tool', e)
        return fail('Máy chủ Work System gặp lỗi, thử lại sau ít phút.')
      }
    }
  }

  const empty = z.object({})
  server.registerTool(
    'dieu_phoi',
    {
      title: 'Điều phối',
      description: 'Nhận việc cần làm ngay: lệnh từ web và task đến hạn của bạn. Gọi đầu tiên trong mỗi vòng Điều phối. Mỗi việc có leaseId — gửi lại leaseId đó trong bao_ket_qua.',
      inputSchema: empty,
    },
    guarded(async (_args: z.output<typeof empty>, me) => {
      const viec = await dispatch(deps.db, me, deps.now())
      if (viec.length === 0) return ok('Không có việc nào đến hạn. Kết thúc vòng Điều phối.', { viec })
      return ok(
        `Có ${viec.length} việc. Làm lần lượt, lệnh trước. Sau mỗi việc gọi bao_ket_qua với slug và leaseId tương ứng.`,
        { viec },
      )
    }),
  )

  server.registerTool(
    'tao_task',
    {
      title: 'Tạo task',
      description: 'Khai báo một việc định kỳ mới của bạn trên Work System: tên, lịch cron (giờ VN), hướng dẫn Claude làm gì khi đến hạn, chỉ số, tiến độ, nút hành động, khối tùy chọn.',
      inputSchema: taskDefinitionSchema,
    },
    guarded(async (args: z.output<typeof taskDefinitionSchema>, me) => {
      const t = await createTask(deps.db, me, args, deps.now())
      return ok(`Đã tạo task "${t.name}" (slug: ${t.slug}). Lần chạy kế tiếp: ${t.nextRunAt?.toISOString() ?? 'chưa có'}. Xem tại ${deps.publicUrl}`, { slug: t.slug })
    }),
  )

  const patchInput = taskPatchSchema.extend({ slug: slugSchema })
  server.registerTool(
    'sua_task',
    {
      title: 'Sửa task',
      description: 'Cập nhật một phần task của bạn theo slug. Chỉ gửi những trường muốn đổi; mảng (metrics, blocks, actions, milestones…) được thay nguyên mảng.',
      inputSchema: patchInput,
    },
    guarded(async (args: z.output<typeof patchInput>, me) => {
      const { slug, ...patch } = args
      const t = await updateTask(deps.db, me, slug, patch, deps.now())
      return ok(`Đã cập nhật task "${t.name}".`, { slug: t.slug, nextRunAt: t.nextRunAt?.toISOString() ?? null })
    }),
  )

  const viewInput = z.object({ slug: slugSchema.optional() })
  server.registerTool(
    'xem_task',
    {
      title: 'Xem task',
      description: 'Không truyền slug: danh sách task của bạn. Truyền slug: chi tiết task cùng 10 lần chạy và 10 lệnh gần nhất.',
      inputSchema: viewInput,
    },
    guarded(async (args: z.output<typeof viewInput>, me) =>
      args.slug ? ok(`Chi tiết task ${args.slug}:`, await getMyTask(deps.db, me, args.slug)) : ok('Task của bạn:', await listMyTasks(deps.db, me)),
    ),
  )

  server.registerTool(
    'bao_ket_qua',
    {
      title: 'Báo kết quả chạy',
      description: 'Ghi kết quả MỘT lần chạy task (kể cả khi lỗi): status ok/partial/failed, ghi chú, log từng bước, và tùy chọn cập nhật trạng thái, chỉ số, tiến độ, xu hướng (trendThem), mốc, khối, báo cáo. Trong vòng Điều phối, BẮT BUỘC gửi leaseId nhận từ dieu_phoi.',
      inputSchema: runReportSchema,
    },
    guarded(async (args: z.output<typeof runReportSchema>, me) => {
      const { task, duplicate } = await reportRun(deps.db, me, args, deps.now())
      if (duplicate) return ok(`Kết quả cho lease này đã ghi trước đó — không ghi lại.`, { slug: task.slug })
      return ok(`Đã ghi kết quả cho "${task.name}". Trạng thái: ${task.stateLabel}.`, { slug: task.slug, state: task.state, nextRunAt: task.nextRunAt?.toISOString() ?? null })
    }),
  )

  server.registerTool(
    'nop_bao_cao_tuan',
    {
      title: 'Nộp báo cáo tuần',
      description: 'Nộp báo cáo tuần của bạn: tóm tắt, điều tốt, điều chưa ổn, việc tuần sau, mẫu hình lặp lại. Bỏ trống week = tuần hiện tại (ISO, giờ VN). Nộp lại cùng tuần sẽ ghi đè.',
      inputSchema: weeklyReportInputSchema,
    },
    guarded(async (args: z.output<typeof weeklyReportInputSchema>, me) => {
      const { week } = await submitWeeklyReport(deps.db, me, args, deps.now())
      return ok(`Đã nộp báo cáo tuần ${week}.`, { week })
    }),
  )
}
