"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleStoreService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const resolveDbPath = () => {
    const rawPath = process.env.DB_PATH?.trim();
    if (rawPath) {
        return node_path_1.default.isAbsolute(rawPath) ? rawPath : node_path_1.default.resolve(process.cwd(), rawPath);
    }
    return node_path_1.default.resolve(process.cwd(), "data", "portal.sqlite");
};
const dbPath = resolveDbPath();
node_fs_1.default.mkdirSync(node_path_1.default.dirname(dbPath), { recursive: true });
const db = new better_sqlite3_1.default(dbPath);
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
const mapScheduleEntry = (row) => ({
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
const mapTeacherAbsence = (row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    day: row.day,
    slot: row.slot,
    date: row.date,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
});
exports.scheduleStoreService = {
    listScheduleAll() {
        const rows = db
            .prepare("SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries ORDER BY day ASC, slot ASC, class_id ASC")
            .all();
        return rows.map(mapScheduleEntry);
    },
    listScheduleByClassIds(classIds) {
        const normalized = [...new Set(classIds.map((item) => item.toUpperCase()))];
        if (normalized.length === 0) {
            return [];
        }
        const placeholders = normalized.map(() => "?").join(",");
        const rows = db
            .prepare(`SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries WHERE class_id IN (${placeholders}) ORDER BY day ASC, slot ASC, class_id ASC`)
            .all(...normalized);
        return rows.map(mapScheduleEntry);
    },
    listScheduleByTeacher(teacherId) {
        const rows = db
            .prepare("SELECT id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at FROM schedule_entries WHERE teacher_id = ? ORDER BY day ASC, slot ASC, class_id ASC")
            .all(teacherId);
        return rows.map(mapScheduleEntry);
    },
    replaceSchedule(entries) {
        const now = new Date().toISOString();
        const insert = db.prepare(`
      INSERT INTO schedule_entries (id, class_id, day, slot, duration, subject, teacher_id, room, kind, group_name, stream_id, status, created_at, updated_at)
      VALUES (@id, @class_id, @day, @slot, @duration, @subject, @teacher_id, @room, @kind, @group_name, @stream_id, @status, @created_at, @updated_at)
    `);
        const run = db.transaction(() => {
            db.prepare("DELETE FROM schedule_entries").run();
            for (const item of entries) {
                insert.run({
                    id: `sch-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`,
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
    addTeacherAbsences(items) {
        const insert = db.prepare(`
      INSERT INTO teacher_absences (id, teacher_id, day, slot, date, reason, created_at)
      VALUES (@id, @teacher_id, @day, @slot, @date, @reason, @created_at)
    `);
        const now = new Date().toISOString();
        const run = db.transaction(() => {
            for (const item of items) {
                insert.run({
                    id: `abs-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`,
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
            .prepare("SELECT id, teacher_id, day, slot, date, reason, created_at FROM teacher_absences ORDER BY created_at DESC")
            .all();
        return rows.map(mapTeacherAbsence);
    },
};
