"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicStoreService = void 0;
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
const parseHistory = (value) => {
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((item) => typeof item === "object" &&
            item !== null &&
            typeof item.date === "string" &&
            Number.isFinite(Number(item.score)))
            .map((item) => ({
            date: item.date,
            score: Number(item.score),
        }));
    }
    catch {
        return [];
    }
};
const normalizeHistory = (history, currentScore) => {
    if (history.length > 0) {
        return history.map((point) => ({
            date: point.date,
            score: Number(Number(point.score).toFixed(2)),
        }));
    }
    return [{ date: new Date().toISOString().slice(0, 10), score: Number(currentScore.toFixed(2)) }];
};
const mapAchievement = (row) => ({
    id: row.id,
    studentId: row.student_id,
    title: row.title,
    type: row.type,
    badge: row.badge,
    date: row.date,
    points: row.points,
});
const dbPath = resolveDbPath();
node_fs_1.default.mkdirSync(node_path_1.default.dirname(dbPath), { recursive: true });
const db = new better_sqlite3_1.default(dbPath);
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('academic', 'sport', 'creative', 'social')),
    badge TEXT NOT NULL,
    date TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS student_profiles (
    student_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    class_id TEXT NOT NULL,
    average_score REAL NOT NULL DEFAULT 0,
    weak_subjects TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS student_subject_progress (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    current_score REAL NOT NULL,
    trend REAL NOT NULL DEFAULT 0,
    risk INTEGER NOT NULL DEFAULT 0,
    history_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(student_id, subject),
    FOREIGN KEY(student_id) REFERENCES student_profiles(student_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_student_profiles_class_id
    ON student_profiles(class_id);

  CREATE INDEX IF NOT EXISTS idx_student_subject_progress_student_id
    ON student_subject_progress(student_id);
`);
exports.academicStoreService = {
    listAchievements() {
        const rows = db
            .prepare("SELECT id, student_id, title, type, badge, date, points, created_at FROM achievements ORDER BY date DESC, created_at DESC")
            .all();
        return rows.map(mapAchievement);
    },
    createAchievement(payload) {
        const id = `ach-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const createdAt = new Date().toISOString();
        db.prepare(`
      INSERT INTO achievements (id, student_id, title, type, badge, date, points, created_at)
      VALUES (@id, @student_id, @title, @type, @badge, @date, @points, @created_at)
    `).run({
            id,
            student_id: payload.studentId,
            title: payload.title.trim(),
            type: payload.type,
            badge: payload.badge.trim(),
            date: payload.date,
            points: Math.round(payload.points),
            created_at: createdAt,
        });
        const created = db
            .prepare("SELECT id, student_id, title, type, badge, date, points, created_at FROM achievements WHERE id = ?")
            .get(id);
        if (!created) {
            throw new Error("Unable to create achievement");
        }
        return mapAchievement(created);
    },
    listStudentProfiles() {
        const profileRows = db
            .prepare("SELECT student_id, full_name, class_id, average_score, weak_subjects, created_at, updated_at FROM student_profiles ORDER BY class_id ASC, full_name ASC")
            .all();
        const progressRows = db
            .prepare("SELECT id, student_id, subject, current_score, trend, risk, history_json, created_at, updated_at FROM student_subject_progress ORDER BY student_id ASC, subject ASC")
            .all();
        const progressByStudent = new Map();
        for (const row of progressRows) {
            const history = normalizeHistory(parseHistory(row.history_json), row.current_score);
            const item = {
                subject: row.subject,
                current: Number(row.current_score.toFixed(2)),
                trend: Number(row.trend.toFixed(2)),
                risk: Boolean(row.risk),
                history,
            };
            const list = progressByStudent.get(row.student_id) ?? [];
            list.push(item);
            progressByStudent.set(row.student_id, list);
        }
        return profileRows.map((row) => {
            const progress = progressByStudent.get(row.student_id) ?? [];
            const weakFromDb = parseJsonArray(row.weak_subjects);
            const weakFromProgress = progress.filter((item) => item.risk).map((item) => item.subject);
            const weakSubjects = [...new Set([...weakFromDb, ...weakFromProgress])];
            const avgFromProgress = progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;
            const averageScore = Number(Number.isFinite(row.average_score) && row.average_score > 0
                ? row.average_score.toFixed(2)
                : avgFromProgress.toFixed(2));
            return {
                studentId: row.student_id,
                fullName: row.full_name,
                classId: row.class_id,
                averageScore,
                weakSubjects,
                progress,
            };
        });
    },
    upsertStudentProfiles(profiles) {
        if (profiles.length === 0) {
            return;
        }
        const now = new Date().toISOString();
        const upsertProfile = db.prepare(`
      INSERT INTO student_profiles (student_id, full_name, class_id, average_score, weak_subjects, created_at, updated_at)
      VALUES (@student_id, @full_name, @class_id, @average_score, @weak_subjects, @created_at, @updated_at)
      ON CONFLICT(student_id) DO UPDATE SET
        full_name = excluded.full_name,
        class_id = excluded.class_id,
        average_score = excluded.average_score,
        weak_subjects = excluded.weak_subjects,
        updated_at = excluded.updated_at
    `);
        const deleteProgress = db.prepare("DELETE FROM student_subject_progress WHERE student_id = ?");
        const insertProgress = db.prepare(`
      INSERT INTO student_subject_progress
        (id, student_id, subject, current_score, trend, risk, history_json, created_at, updated_at)
      VALUES
        (@id, @student_id, @subject, @current_score, @trend, @risk, @history_json, @created_at, @updated_at)
    `);
        const tx = db.transaction((items) => {
            for (const profile of items) {
                const studentId = profile.studentId.trim();
                if (!studentId) {
                    continue;
                }
                const progress = profile.progress
                    .filter((item) => item.subject.trim().length > 0)
                    .map((item) => {
                    const current = Number(Number(item.current).toFixed(2));
                    const trend = Number(Number(item.trend).toFixed(2));
                    const risk = Boolean(item.risk);
                    const history = normalizeHistory(item.history ?? [], current);
                    return {
                        subject: item.subject.trim(),
                        current,
                        trend,
                        risk,
                        history,
                    };
                });
                const weakSubjects = [
                    ...new Set([
                        ...profile.weakSubjects,
                        ...progress.filter((item) => item.risk).map((item) => item.subject),
                    ]),
                ];
                const avgFromProgress = progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;
                upsertProfile.run({
                    student_id: studentId,
                    full_name: profile.fullName.trim(),
                    class_id: profile.classId.trim().toUpperCase(),
                    average_score: Number((Number.isFinite(profile.averageScore) ? profile.averageScore : avgFromProgress).toFixed(2)),
                    weak_subjects: JSON.stringify(weakSubjects),
                    created_at: now,
                    updated_at: now,
                });
                deleteProgress.run(studentId);
                for (const subject of progress) {
                    insertProgress.run({
                        id: `spr-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`,
                        student_id: studentId,
                        subject: subject.subject,
                        current_score: subject.current,
                        trend: subject.trend,
                        risk: subject.risk ? 1 : 0,
                        history_json: JSON.stringify(subject.history),
                        created_at: now,
                        updated_at: now,
                    });
                }
            }
        });
        tx(profiles);
    },
};
