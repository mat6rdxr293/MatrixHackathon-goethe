import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { EventItem, ManagedClass, Role, User } from "../types";

type UserRow = {
  id: string;
  role: Role;
  email: string;
  password: string;
  name: string;
  class_id: string | null;
  linked_student_id: string | null;
  created_at: string;
};

type ClassRow = {
  id: string;
  class_id: string;
  teacher_id: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  type: EventItem["type"];
  title: string;
  description: string;
  date: string;
  important: number;
  target_roles: string | null;
  target_class_ids: string | null;
  created_at: string;
};

const resolveDbPath = () => {
  const rawPath = process.env.DB_PATH?.trim();
  if (rawPath) {
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.resolve(process.cwd(), "data", "portal.sqlite");
};

const parseJsonArray = (value: string | null) => {
  if (!value) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
};

const stringifyJsonArray = (items?: string[]) => {
  if (!items || items.length === 0) {
    return null;
  }
  return JSON.stringify([...new Set(items.map((item) => item.trim()).filter(Boolean))]);
};

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const mapUser = (row: UserRow): User => ({
  id: row.id,
  role: row.role,
  email: row.email,
  password: row.password,
  name: row.name,
  classId: row.class_id ?? undefined,
  linkedStudentId: row.linked_student_id ?? undefined,
});

const mapClass = (row: ClassRow): ManagedClass => ({
  id: row.id,
  classId: row.class_id,
  teacherId: row.teacher_id,
  createdAt: row.created_at,
});

const mapEvent = (row: EventRow): EventItem => ({
  id: row.id,
  type: row.type,
  title: row.title,
  description: row.description,
  date: row.date,
  important: Boolean(row.important),
  targetRoles: parseJsonArray(row.target_roles) as Role[],
  targetClassIds: parseJsonArray(row.target_class_ids),
});

const eventVisibleForUser = (item: EventItem, user: Omit<User, "password">) => {
  const targetRoles = item.targetRoles ?? [];
  const targetClassIds = item.targetClassIds ?? [];

  const roleAllowed = targetRoles.length === 0 || targetRoles.includes(user.role);
  const classAllowed =
    targetClassIds.length === 0 || (typeof user.classId === "string" && targetClassIds.includes(user.classId));

  return roleAllowed && classAllowed;
};

const ensureColumn = (table: string, column: string, definition: string) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
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
};

initializeSchema();

export const storageService = {
  getSafeUsers() {
    return this.getUsers().map(({ password: _password, ...safeUser }) => safeUser);
  },

  getUsers(): User[] {
    const rows = db
      .prepare(
        "SELECT id, role, email, password, name, class_id, linked_student_id, created_at FROM users ORDER BY created_at ASC",
      )
      .all() as UserRow[];
    return rows.map(mapUser);
  },

  getUserById(id: string): User | undefined {
    const row = db
      .prepare("SELECT id, role, email, password, name, class_id, linked_student_id, created_at FROM users WHERE id = ?")
      .get(id) as UserRow | undefined;
    return row ? mapUser(row) : undefined;
  },

  getUserByEmail(email: string): User | undefined {
    const row = db
      .prepare(
        "SELECT id, role, email, password, name, class_id, linked_student_id, created_at FROM users WHERE email = ?",
      )
      .get(email) as UserRow | undefined;
    return row ? mapUser(row) : undefined;
  },

  createUser(payload: {
    role: Role;
    email: string;
    password: string;
    name: string;
    classId?: string;
    linkedStudentId?: string;
  }) {
    const id = `${payload.role}-${randomUUID().slice(0, 8)}`;
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

    const created = this.getUserById(id);
    if (!created) {
      throw new Error("Unable to create user");
    }
    return created;
  },

  listClasses(): ManagedClass[] {
    const rows = db
      .prepare("SELECT id, class_id, teacher_id, created_at FROM classes ORDER BY class_id ASC")
      .all() as ClassRow[];
    return rows.map(mapClass);
  },

  getClassByClassId(classId: string): ManagedClass | undefined {
    const row = db
      .prepare("SELECT id, class_id, teacher_id, created_at FROM classes WHERE class_id = ?")
      .get(classId.toUpperCase()) as ClassRow | undefined;
    return row ? mapClass(row) : undefined;
  },

  createClass(payload: { classId: string; teacherId?: string | null }) {
    const normalizedClassId = payload.classId.trim().toUpperCase();
    const id = `cls-${randomUUID().slice(0, 8)}`;
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

  assignTeacherToClass(classId: string, teacherId: string) {
    db.prepare("UPDATE classes SET teacher_id = ? WHERE class_id = ?").run(teacherId, classId.toUpperCase());
  },

  listEvents(): EventItem[] {
    const rows = db
      .prepare(
        "SELECT id, type, title, description, date, important, target_roles, target_class_ids, created_at FROM events ORDER BY date DESC, created_at DESC",
      )
      .all() as EventRow[];
    return rows.map(mapEvent);
  },

  listEventsForUser(user: Omit<User, "password">): EventItem[] {
    return this.listEvents().filter((item) => eventVisibleForUser(item, user));
  },

  createEvent(payload: {
    type: EventItem["type"];
    title: string;
    description: string;
    date: string;
    important?: boolean;
    targetRoles?: Role[];
    targetClassIds?: string[];
  }) {
    const id = `evt-${randomUUID().slice(0, 8)}`;
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
      .prepare(
        "SELECT id, type, title, description, date, important, target_roles, target_class_ids, created_at FROM events WHERE id = ?",
      )
      .get(id) as EventRow | undefined;

    if (!created) {
      throw new Error("Unable to create event");
    }

    return mapEvent(created);
  },
};
