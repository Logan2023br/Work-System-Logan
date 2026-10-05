import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type {
  Action, Block, Metric, Milestone, Progress, ReflectNote, Source, TaskReport,
} from '../../shared/schema.js'
import { COMMAND_STATUSES, RUN_STATUSES, TASK_MODES, TASK_STATES } from '../../shared/schema.js'

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  team: text('team').notNull().default('BraveBits'),
  role: text('role', { enum: ['member', 'admin'] }).notNull().default('member'),
  active: boolean('active').notNull().default(true),
  workDays: integer('work_days').array().notNull().default(sql`'{1,2,3,4,5}'`),
  workStart: text('work_start').notNull().default('08:00'),
  workEnd: text('work_end').notNull().default('19:00'),
  lastSeenAt: ts('last_seen_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    slug: text('slug').notNull(),
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    mode: text('mode', { enum: TASK_MODES }).notNull().default('auto'),
    state: text('state', { enum: TASK_STATES }).notNull().default('idle'),
    stateLabel: text('state_label').notNull().default(''),
    health: real('health').notNull().default(1),
    progress: jsonb('progress').$type<Progress>().notNull().default({ done: 0, total: 0, unit: '' }),
    metrics: jsonb('metrics').$type<Metric[]>().notNull().default([]),
    trend: jsonb('trend').$type<number[]>().notNull().default([]),
    trendLabel: text('trend_label').notNull().default(''),
    milestones: jsonb('milestones').$type<Milestone[]>().notNull().default([]),
    sources: jsonb('sources').$type<Source[]>().notNull().default([]),
    report: jsonb('report').$type<TaskReport | null>(),
    blocks: jsonb('blocks').$type<Block[]>().notNull().default([]),
    actions: jsonb('actions').$type<Action[]>().notNull().default([]),
    instructions: text('instructions').notNull(),
    skill: text('skill'),
    cron: text('cron').notNull(),
    scheduleLabel: text('schedule_label').notNull().default(''),
    paused: boolean('paused').notNull().default(false),
    nextRunAt: ts('next_run_at'),
    lastRunAt: ts('last_run_at'),
    leaseId: uuid('lease_id'),
    leaseUntil: ts('lease_until'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tasks_owner_slug').on(t.ownerId, t.slug), index('tasks_due').on(t.ownerId, t.nextRunAt)],
)

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    commandId: uuid('command_id'),
    leaseId: uuid('lease_id').unique(),
    trigger: text('trigger', { enum: ['schedule', 'command', 'manual'] }).notNull(),
    status: text('status', { enum: RUN_STATUSES }).notNull(),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at').notNull(),
    durationMs: integer('duration_ms'),
    note: text('note').notNull().default(''),
    log: jsonb('log').$type<string[]>(),
  },
  (t) => [index('runs_task_time').on(t.taskId, t.startedAt)],
)

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    actionId: text('action_id').notNull(),
    label: text('label').notNull(),
    instructions: text('instructions').notNull(),
    note: text('note'),
    status: text('status', { enum: COMMAND_STATUSES }).notNull().default('pending'),
    leaseId: uuid('lease_id'),
    result: text('result'),
    createdAt: ts('created_at').notNull().defaultNow(),
    claimedAt: ts('claimed_at'),
    finishedAt: ts('finished_at'),
  },
  (t) => [index('commands_owner_status').on(t.ownerId, t.status), index('commands_task_time').on(t.taskId, t.createdAt)],
)

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    week: text('week').notNull(),
    summary: text('summary').notNull(),
    good: jsonb('good').$type<ReflectNote[]>().notNull().default([]),
    bad: jsonb('bad').$type<ReflectNote[]>().notNull().default([]),
    next: jsonb('next').$type<ReflectNote[]>().notNull().default([]),
    pattern: text('pattern').notNull().default(''),
    submittedAt: ts('submitted_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('weekly_owner_week').on(t.ownerId, t.week)],
)

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    at: ts('at').notNull().defaultNow(),
    level: text('level', { enum: ['ok', 'error', 'wait'] }).notNull(),
    text: text('text').notNull(),
  },
  (t) => [index('activity_owner_time').on(t.ownerId, t.at)],
)

export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  kind: text('kind', { enum: ['dcr', 'cimd'] }).notNull(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const oauthCodes = pgTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  resource: text('resource'),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
})

export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  resource: text('resource').notNull(),
  accessHash: text('access_hash').notNull().unique(),
  refreshHash: text('refresh_hash').notNull().unique(),
  accessExpiresAt: ts('access_expires_at').notNull(),
  refreshExpiresAt: ts('refresh_expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  lastUsedAt: ts('last_used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
})
