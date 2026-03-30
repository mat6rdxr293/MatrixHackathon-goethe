import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { NotificationItem, Role, User } from "../types";

type NotificationRow = {
  id: string;
  type: NotificationItem["type"];
  title: string;
  message: string;
  target_roles: string | null;
  target_class_ids: string | null;
  meta_json: string | null;
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

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('system', 'schedule', 'event', 'achievement')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_roles TEXT,
    target_class_ids TEXT,
    meta_json TEXT,
    created_at TEXT NOT NULL
  );
`);

const mapNotification = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  createdAt: row.created_at,
  targetRoles: parseJsonArray(row.target_roles) as Role[],
  targetClassIds: parseJsonArray(row.target_class_ids),
  meta: row.meta_json ? (JSON.parse(row.meta_json) as Record<string, unknown>) : undefined,
});

export const notificationService = {
  list(limit = 100) {
    const rows = db
      .prepare(
        "SELECT id, type, title, message, target_roles, target_class_ids, meta_json, created_at FROM notifications ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as NotificationRow[];
    return rows.map(mapNotification);
  },

  listForUser(user: Omit<User, "password">, classIdOverride?: string | null, limit = 100) {
    return this.list(limit).filter((item) => {
      const roleTargets = item.targetRoles ?? [];
      const classTargets = item.targetClassIds ?? [];
      const roleAllowed = roleTargets.length === 0 || roleTargets.includes(user.role);
      const resolvedClassId = classIdOverride ?? user.classId;
      const classAllowed =
        classTargets.length === 0 || (typeof resolvedClassId === "string" && classTargets.includes(resolvedClassId));
      return roleAllowed && classAllowed;
    });
  },

  create(payload: {
    type: NotificationItem["type"];
    title: string;
    message: string;
    targetRoles?: Role[];
    targetClassIds?: string[];
    meta?: Record<string, unknown>;
  }) {
    const id = `ntf-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO notifications (id, type, title, message, target_roles, target_class_ids, meta_json, created_at)
      VALUES (@id, @type, @title, @message, @target_roles, @target_class_ids, @meta_json, @created_at)
    `).run({
      id,
      type: payload.type,
      title: payload.title.trim(),
      message: payload.message.trim(),
      target_roles: stringifyJsonArray(payload.targetRoles),
      target_class_ids: stringifyJsonArray(payload.targetClassIds),
      meta_json: payload.meta ? JSON.stringify(payload.meta) : null,
      created_at: createdAt,
    });

    const created = db
      .prepare(
        "SELECT id, type, title, message, target_roles, target_class_ids, meta_json, created_at FROM notifications WHERE id = ?",
      )
      .get(id) as NotificationRow | undefined;

    if (!created) {
      throw new Error("Unable to create notification");
    }

    return mapNotification(created);
  },
};
