import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { ScheduleEntry, ScheduleKind, ScheduleStatus, TeacherAbsence } from "../types";

type ScheduleRow = {
  id: string;
  class_id: string;
  day: number;
  slot: number;
  duration: number;
  subject: string;
  teacher_id: string;
  room: string;
  kind: ScheduleKind;
  group_name: string | null;
  stream_id: string | null;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
};

type TeacherAbsenceRow = {
  id: string;
  teacher_id: string;
  day: number;
  slot: number;
  date: string;
  reason: string | null;
  created_at: string;
};

const resolveDbPath = () => {
  const rawPath = process.env.DB_PATH?.trim();
  if (rawPath) {
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.resolve(process.cwd(), "data", "portal.sqlite");
};

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS schedule_entries (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    subject TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    room TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('lesson', 'pair', 'academic-hour', 'stream', 'event')),
    group_name TEXT,
    stream_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('planned', 'changed', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teacher_absences (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );
`);

const mapScheduleEntry = (row: ScheduleRow): ScheduleEntry => ({
  id: row.id,
  classId: row.class_id,
  day: row.day,
  slot: row.slot,
  duration: row.duration,
  subject: row.subject,
  teacherId: row.teacher_id,
  room: row.room,
  kind: row.kind,
  groupName: row.group_name ?? undefined,
  streamId: row.stream_id ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTeacherAbsence = (row: TeacherAbsenceRow): TeacherAbsence => ({
  id: row.id,
  teacherId: row.teacher_id,
  day: row.day,
  slot: row.slot,
  date: row.date,
  reason: row.reason ?? undefined,
  createdAt: row.created_at,
});

export const scheduleStoreService = {
  listScheduleAll() {
    const rows = db
      .prepare(
        "SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries ORDER BY day ASC, slot ASC, class_id ASC",
      )
      .all() as ScheduleRow[];
    return rows.map(mapScheduleEntry);
  },

  listScheduleByClassIds(classIds: string[]) {
    const normalized = [...new Set(classIds.map((item) => item.toUpperCase()))];
    if (normalized.length === 0) {
      return [] as ScheduleEntry[];
    }
    const placeholders = normalized.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries WHERE class_id IN (${placeholders}) ORDER BY day ASC, slot ASC, class_id ASC`,
      )
      .all(...normalized) as ScheduleRow[];
    return rows.map(mapScheduleEntry);
  },

  listScheduleByTeacher(teacherId: string) {
    const rows = db
      .prepare(
        "SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries WHERE teacher_id = ? ORDER BY day ASC, slot ASC, class_id ASC",
      )
      .all(teacherId) as ScheduleRow[];
    return rows.map(mapScheduleEntry);
  },

  replaceSchedule(
    entries: Array<{
      classId: string;
      day: number;
      slot: number;
      duration: number;
      subject: string;
      teacherId: string;
      room: string;
      kind: ScheduleKind;
      groupName?: string;
      streamId?: string;
      status?: ScheduleStatus;
    }>,
  ) {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO schedule_entries (id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at)
      VALUES (@id, @class_id, @day, @slot, @duration, @subject, @teacher_id, @room, @kind, @group_name, @stream_id, @status, @created_at, @updated_at)
    `);

    const run = db.transaction(() => {
      db.prepare("DELETE FROM schedule_entries").run();
      for (const item of entries) {
        insert.run({
          id: `sch-${randomUUID().slice(0, 8)}`,
          class_id: item.classId.toUpperCase(),
          day: item.day,
          slot: item.slot,
          duration: item.duration,
          subject: item.subject,
          teacher_id: item.teacherId,
          room: item.room,
          kind: item.kind,
          group_name: item.groupName ?? null,
          stream_id: item.streamId ?? null,
          status: item.status ?? "planned",
          created_at: now,
          updated_at: now,
        });
      }
    });

    run();
    return this.listScheduleAll();
  },

  addTeacherAbsences(items: Array<{ teacherId: string; day: number; slot: number; date: string; reason?: string }>) {
    const insert = db.prepare(`
      INSERT INTO teacher_absences (id, teacher_id, day, slot, date, reason, created_at)
      VALUES (@id, @teacher_id, @day, @slot, @date, @reason, @created_at)
    `);
    const now = new Date().toISOString();

    const run = db.transaction(() => {
      for (const item of items) {
        insert.run({
          id: `abs-${randomUUID().slice(0, 8)}`,
          teacher_id: item.teacherId,
          day: item.day,
          slot: item.slot,
          date: item.date,
          reason: item.reason ?? null,
          created_at: now,
        });
      }
    });

    run();
    return this.listTeacherAbsences();
  },

  listTeacherAbsences() {
    const rows = db
      .prepare(
        "SELECT id, teacher_id, day, slot, date, reason, created_at FROM teacher_absences ORDER BY created_at DESC",
      )
      .all() as TeacherAbsenceRow[];
    return rows.map(mapTeacherAbsence);
  },
};
