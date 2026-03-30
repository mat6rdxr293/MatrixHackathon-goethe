"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
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
const mapNotification = (row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    targetRoles: parseJsonArray(row.target_roles),
    targetClassIds: parseJsonArray(row.target_class_ids),
    meta: row.meta_json ? JSON.parse(row.meta_json) : undefined,
});
exports.notificationService = {
    list(limit = 100) {
        const rows = db
            .prepare("SELECT id, type, title, message, target_roles, target_class_ids, meta_json, created_at FROM notifications ORDER BY created_at DESC LIMIT ?")
            .all(limit);
        return rows.map(mapNotification);
    },
    listForUser(user, classIdOverride, limit = 100) {
        return this.list(limit).filter((item) => {
            const roleTargets = item.targetRoles ?? [];
            const classTargets = item.targetClassIds ?? [];
            const roleAllowed = roleTargets.length === 0 || roleTargets.includes(user.role);
            const resolvedClassId = classIdOverride ?? user.classId;
            const classAllowed = classTargets.length === 0 || (typeof resolvedClassId === "string" && classTargets.includes(resolvedClassId));
            return roleAllowed && classAllowed;
        });
    },
    create(payload) {
        const id = `ntf-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
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
            .prepare("SELECT id, type, title, message, target_roles, target_class_ids, meta_json, created_at FROM notifications WHERE id = ?")
            .get(id);
        if (!created) {
            throw new Error("Unable to create notification");
        }
        return mapNotification(created);
    },
};
