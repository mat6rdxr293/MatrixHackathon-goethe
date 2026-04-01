"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = void 0;
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
const parseJsonArray = (value) => {
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    catch {
        return [];
    }
};
const stringifyJsonArray = (items) => {
    if (!items || items.length === 0) {
        return null;
    }
    return JSON.stringify([...new Set(items.map((item) => item.trim()).filter(Boolean))]);
};
const dbPath = resolveDbPath();
node_fs_1.default.mkdirSync(node_path_1.default.dirname(dbPath), { recursive: true });
const db = new better_sqlite3_1.default(dbPath);
db.pragma("foreign_keys = ON");
const mapUser = (row) => ({
    id: row.id,
    role: row.role,
    email: row.email,
    password: row.password,
    name: row.name,
    classId: row.class_id ?? undefined,
    linkedStudentId: row.linked_student_id ?? undefined,
    bilimLinked: Boolean(row.bilim_login && row.bilim_password),
    bilimLogin: row.bilim_login ?? undefined,
    bilimLinkedAt: row.bilim_linked_at ?? undefined,
    bilimSchoolId: row.bilim_school_id ?? undefined,
    bilimGroupId: row.bilim_group_id ?? undefined,
    bilimEduYear: row.bilim_edu_year ?? undefined,
    bilimPeriod: row.bilim_period ?? undefined,
    bilimPeriodType: row.bilim_period_type ?? undefined,
});
const mapClass = (row) => ({
    id: row.id,
    classId: row.class_id,
    teacherId: row.teacher_id,
    createdAt: row.created_at,
});
const mapEvent = (row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    date: row.date,
    important: Boolean(row.important),
    targetRoles: parseJsonArray(row.target_roles),
    targetClassIds: parseJsonArray(row.target_class_ids),
});
const eventVisibleForUser = (item, user) => {
    const targetRoles = item.targetRoles ?? [];
    const targetClassIds = item.targetClassIds ?? [];
    const roleAllowed = targetRoles.length === 0 || targetRoles.includes(user.role);
    const classAllowed = targetClassIds.length === 0 || (typeof user.classId === "string" && targetClassIds.includes(user.classId));
    return roleAllowed && classAllowed;
};
const ensureColumn = (table, column, definition) => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!rows.some((item) => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
};
const initializeSchema = () => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'parent', 'admin')),
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      class_id TEXT,
      linked_student_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL UNIQUE,
      teacher_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('news', 'event', 'announcement')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      important INTEGER NOT NULL DEFAULT 0,
      target_roles TEXT,
      target_class_ids TEXT,
      created_at TEXT NOT NULL
    );
  `);
    ensureColumn("events", "target_roles", "TEXT");
    ensureColumn("events", "target_class_ids", "TEXT");
    ensureColumn("users", "bilim_login", "TEXT");
    ensureColumn("users", "bilim_password", "TEXT");
    ensureColumn("users", "bilim_linked_at", "TEXT");
    ensureColumn("users", "bilim_school_id", "INTEGER");
    ensureColumn("users", "bilim_group_id", "INTEGER");
    ensureColumn("users", "bilim_edu_year", "INTEGER");
    ensureColumn("users", "bilim_period", "INTEGER");
    ensureColumn("users", "bilim_period_type", "TEXT");
};
initializeSchema();
exports.storageService = {
    getSafeUsers() {
        return this.getUsers().map(({ password: _password, ...safeUser }) => safeUser);
    },
    getUsers() {
        const rows = db
            .prepare("SELECT id, role, email, password, name, class_id, linked_student_id, bilim_login, bilim_password, bilim_linked_at, bilim_school_id, bilim_group_id, bilim_edu_year, bilim_period, bilim_period_type, created_at FROM users ORDER BY created_at ASC")
            .all();
        return rows.map(mapUser);
    },
    getUserById(id) {
        const row = db
            .prepare("SELECT id, role, email, password, name, class_id, linked_student_id, bilim_login, bilim_password, bilim_linked_at, bilim_school_id, bilim_group_id, bilim_edu_year, bilim_period, bilim_period_type, created_at FROM users WHERE id = ?")
            .get(id);
        return row ? mapUser(row) : undefined;
    },
    getUserByEmail(email) {
        const row = db
            .prepare("SELECT id, role, email, password, name, class_id, linked_student_id, bilim_login, bilim_password, bilim_linked_at, bilim_school_id, bilim_group_id, bilim_edu_year, bilim_period, bilim_period_type, created_at FROM users WHERE email = ?")
            .get(email);
        return row ? mapUser(row) : undefined;
    },
    getBilimBinding(userId) {
        const row = db
            .prepare("SELECT bilim_login, bilim_password, bilim_linked_at, bilim_school_id, bilim_group_id, bilim_edu_year, bilim_period, bilim_period_type FROM users WHERE id = ?")
            .get(userId);
        if (!row) {
            return null;
        }
        const linked = Boolean(row.bilim_login && row.bilim_password);
        return {
            linked,
            login: row.bilim_login ?? null,
            linkedAt: row.bilim_linked_at ?? null,
            schoolId: row.bilim_school_id ?? null,
            groupId: row.bilim_group_id ?? null,
            eduYear: row.bilim_edu_year ?? null,
            period: row.bilim_period ?? null,
            periodType: row.bilim_period_type ?? null,
        };
    },
    setBilimBinding(userId, payload) {
        const existing = this.getBilimBinding(userId);
        const schoolId = payload.schoolId === undefined ? (existing?.schoolId ?? null) : payload.schoolId;
        const groupId = payload.groupId === undefined ? (existing?.groupId ?? null) : payload.groupId;
        const eduYear = payload.eduYear === undefined ? (existing?.eduYear ?? null) : payload.eduYear;
        const period = payload.period === undefined ? (existing?.period ?? null) : payload.period;
        const periodType = payload.periodType === undefined ? (existing?.periodType ?? null) : (payload.periodType?.trim() || null);
        const linkedAt = new Date().toISOString();
        db.prepare(`UPDATE users
       SET bilim_login = ?, bilim_password = ?, bilim_linked_at = ?,
           bilim_school_id = ?, bilim_group_id = ?, bilim_edu_year = ?, bilim_period = ?, bilim_period_type = ?
       WHERE id = ?`).run(payload.login.trim(), payload.password, linkedAt, schoolId, groupId, eduYear, period, periodType, userId);
        return this.getBilimBinding(userId);
    },
    clearBilimBinding(userId) {
        db.prepare(`UPDATE users
       SET bilim_login = NULL, bilim_password = NULL, bilim_linked_at = NULL,
           bilim_school_id = NULL, bilim_group_id = NULL, bilim_edu_year = NULL, bilim_period = NULL, bilim_period_type = NULL
       WHERE id = ?`).run(userId);
        return this.getBilimBinding(userId);
    },
    listBilimLinkedUsers() {
        const rows = db
            .prepare(`SELECT
          id, role, name, class_id, linked_student_id,
          bilim_login, bilim_password, bilim_school_id, bilim_group_id, bilim_edu_year, bilim_period, bilim_period_type
        FROM users
        WHERE bilim_login IS NOT NULL AND bilim_login <> ''
          AND bilim_password IS NOT NULL AND bilim_password <> ''`)
            .all();
        return rows.map((row) => ({
            userId: row.id,
            role: row.role,
            name: row.name,
            classId: row.class_id ?? null,
            linkedStudentId: row.linked_student_id ?? null,
            login: row.bilim_login,
            password: row.bilim_password,
            schoolId: row.bilim_school_id ?? null,
            groupId: row.bilim_group_id ?? null,
            eduYear: row.bilim_edu_year ?? null,
            period: row.bilim_period ?? null,
            periodType: row.bilim_period_type ?? null,
        }));
    },
    createUser(payload) {
        const id = `${payload.role}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const createdAt = new Date().toISOString();
        db.prepare(`
      INSERT INTO users (id, role, email, password, name, class_id, linked_student_id, created_at)
      VALUES (@id, @role, @email, @password, @name, @class_id, @linked_student_id, @created_at)
    `).run({
            id,
            role: payload.role,
            email: payload.email.toLowerCase(),
            password: payload.password,
            name: payload.name.trim(),
            class_id: payload.classId ?? null,
            linked_student_id: payload.linkedStudentId ?? null,
            created_at: createdAt,
        });
        if (payload.role === "student" && !payload.linkedStudentId) {
            db.prepare("UPDATE users SET linked_student_id = ? WHERE id = ?").run(id, id);
        }
        const created = this.getUserById(id);
        if (!created) {
            throw new Error("Unable to create user");
        }
        return created;
    },
    updateUserPassword(userId, password) {
        const normalizedPassword = password.trim();
        if (normalizedPassword.length < 6) {
            throw new Error("Password must be at least 6 characters");
        }
        const result = db.prepare("UPDATE users SET password = ? WHERE id = ?").run(normalizedPassword, userId);
        return result.changes > 0;
    },
    deleteUserById(userId) {
        const tx = db.transaction((targetUserId) => {
            db.prepare("UPDATE classes SET teacher_id = NULL WHERE teacher_id = ?").run(targetUserId);
            db.prepare("UPDATE users SET linked_student_id = NULL WHERE linked_student_id = ?").run(targetUserId);
            const result = db.prepare("DELETE FROM users WHERE id = ?").run(targetUserId);
            return result.changes > 0;
        });
        return tx(userId);
    },
    listClasses() {
        const rows = db
            .prepare("SELECT id, class_id, teacher_id, created_at FROM classes ORDER BY class_id ASC")
            .all();
        return rows.map(mapClass);
    },
    getClassByClassId(classId) {
        const row = db
            .prepare("SELECT id, class_id, teacher_id, created_at FROM classes WHERE class_id = ?")
            .get(classId.toUpperCase());
        return row ? mapClass(row) : undefined;
    },
    createClass(payload) {
        const normalizedClassId = payload.classId.trim().toUpperCase();
        const id = `cls-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const createdAt = new Date().toISOString();
        db.prepare(`
      INSERT INTO classes (id, class_id, teacher_id, created_at)
      VALUES (@id, @class_id, @teacher_id, @created_at)
    `).run({
            id,
            class_id: normalizedClassId,
            teacher_id: payload.teacherId ?? null,
            created_at: createdAt,
        });
        const created = this.getClassByClassId(normalizedClassId);
        if (!created) {
            throw new Error("Unable to create class");
        }
        return created;
    },
    assignTeacherToClass(classId, teacherId) {
        db.prepare("UPDATE classes SET teacher_id = ? WHERE class_id = ?").run(teacherId, classId.toUpperCase());
    },
    listEvents() {
        const rows = db
            .prepare("SELECT id, type, title, description, date, important, target_roles, target_class_ids, created_at FROM events ORDER BY date DESC, created_at DESC")
            .all();
        return rows.map(mapEvent);
    },
    listEventsForUser(user) {
        return this.listEvents().filter((item) => eventVisibleForUser(item, user));
    },
    createEvent(payload) {
        const id = `evt-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const createdAt = new Date().toISOString();
        db.prepare(`
      INSERT INTO events (id, type, title, description, date, important, target_roles, target_class_ids, created_at)
      VALUES (@id, @type, @title, @description, @date, @important, @target_roles, @target_class_ids, @created_at)
    `).run({
            id,
            type: payload.type,
            title: payload.title.trim(),
            description: payload.description.trim(),
            date: payload.date,
            important: payload.important ? 1 : 0,
            target_roles: stringifyJsonArray(payload.targetRoles),
            target_class_ids: stringifyJsonArray(payload.targetClassIds),
            created_at: createdAt,
        });
        const created = db
            .prepare("SELECT id, type, title, description, date, important, target_roles, target_class_ids, created_at FROM events WHERE id = ?")
            .get(id);
        if (!created) {
            throw new Error("Unable to create event");
        }
        return mapEvent(created);
    },
};
