import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { Achievement, GradePoint, StudentProfile } from "../types";

type StudentProfileRow = {
  student_id: string;
  full_name: string;
  class_id: string;
  average_score: number;
  weak_subjects: string;
  created_at: string;
  updated_at: string;
};

type SubjectProgressRow = {
  id: string;
  student_id: string;
  subject: string;
  current_score: number;
  trend: number;
  risk: number;
  history_json: string;
  created_at: string;
  updated_at: string;
};

type AchievementRow = {
  id: string;
  student_id: string;
  title: string;
  type: Achievement["type"];
  badge: string;
  date: string;
  points: number;
  proof_url: string | null;
  proof_note: string | null;
  proof_file_name: string | null;
  proof_file_mime: string | null;
  proof_file_data_url: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  verification_status: "verified" | "pending" | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_method: string | null;
  verification_evidence: string | null;
  created_at: string;
};

const resolveDbPath = () => {
  const rawPath = process.env.DB_PATH?.trim();
  if (rawPath) {
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.resolve(process.cwd(), "data", "portal.sqlite");
};

const parseJsonArray = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [] as string[];
  }
};

const parseHistory = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as GradePoint[];
    }
    return parsed
      .filter(
        (item): item is GradePoint =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { date?: unknown }).date === "string" &&
          Number.isFinite(Number((item as { score?: unknown }).score)),
      )
      .map((item) => ({
        date: item.date,
        score: Number(item.score),
      }));
  } catch {
    return [] as GradePoint[];
  }
};

const normalizeHistory = (history: GradePoint[], currentScore: number): GradePoint[] => {
  if (history.length > 0) {
    return history.map((point) => ({
      date: point.date,
      score: Number(Number(point.score).toFixed(2)),
    }));
  }
  return [{ date: new Date().toISOString().slice(0, 10), score: Number(currentScore.toFixed(2)) }];
};

const mapAchievement = (row: AchievementRow): Achievement => ({
  id: row.id,
  studentId: row.student_id,
  title: row.title,
  type: row.type,
  badge: row.badge,
  date: row.date,
  points: row.points,
  proofUrl: row.proof_url ?? undefined,
  proofNote: row.proof_note ?? undefined,
  proofAttachment:
    row.proof_file_name && row.proof_file_mime && row.proof_file_data_url
      ? {
          fileName: row.proof_file_name,
          mimeType: row.proof_file_mime,
          dataUrl: row.proof_file_data_url,
        }
      : undefined,
  submittedBy: row.submitted_by ?? undefined,
  submittedAt: row.submitted_at ?? undefined,
  verification: row.verification_status
    ? {
        status: row.verification_status,
        verifiedAt: row.verified_at ?? undefined,
        verifiedBy: row.verified_by ?? undefined,
        method: row.verification_method ?? undefined,
        evidence: row.verification_evidence ?? undefined,
      }
    : undefined,
});

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
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

const ensureColumn = (table: string, column: string, definition: string) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!rows.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

ensureColumn("achievements", "proof_url", "TEXT");
ensureColumn("achievements", "proof_note", "TEXT");
ensureColumn("achievements", "proof_file_name", "TEXT");
ensureColumn("achievements", "proof_file_mime", "TEXT");
ensureColumn("achievements", "proof_file_data_url", "TEXT");
ensureColumn("achievements", "submitted_by", "TEXT");
ensureColumn("achievements", "submitted_at", "TEXT");
ensureColumn("achievements", "verification_status", "TEXT");
ensureColumn("achievements", "verified_at", "TEXT");
ensureColumn("achievements", "verified_by", "TEXT");
ensureColumn("achievements", "verification_method", "TEXT");
ensureColumn("achievements", "verification_evidence", "TEXT");

export const academicStoreService = {
  listAchievements(): Achievement[] {
    const rows = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        ORDER BY date DESC, created_at DESC`,
      )
      .all() as AchievementRow[];
    return rows.map(mapAchievement);
  },

  createAchievement(payload: {
    studentId: string;
    title: string;
    type: Achievement["type"];
    badge: string;
    date: string;
    points: number;
    proofUrl?: string;
    proofNote?: string;
    proofAttachment?: {
      fileName: string;
      mimeType: string;
      dataUrl: string;
    };
    submittedBy?: string;
  }) {
    const id = `ach-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO achievements (
        id, student_id, title, type, badge, date, points,
        proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
        verification_status, verification_method, verification_evidence,
        created_at
      )
      VALUES (
        @id, @student_id, @title, @type, @badge, @date, @points,
        @proof_url, @proof_note, @proof_file_name, @proof_file_mime, @proof_file_data_url, @submitted_by, @submitted_at,
        @verification_status, @verification_method, @verification_evidence,
        @created_at
      )
    `).run({
      id,
      student_id: payload.studentId,
      title: payload.title.trim(),
      type: payload.type,
      badge: payload.badge.trim(),
      date: payload.date,
      points: Math.round(payload.points),
      proof_url: payload.proofUrl?.trim() || null,
      proof_note: payload.proofNote?.trim() || null,
      proof_file_name: payload.proofAttachment?.fileName?.trim() || null,
      proof_file_mime: payload.proofAttachment?.mimeType?.trim() || null,
      proof_file_data_url: payload.proofAttachment?.dataUrl?.trim() || null,
      submitted_by: payload.submittedBy?.trim() || null,
      submitted_at: createdAt,
      verification_status: "pending",
      verification_method: "manual-review",
      verification_evidence:
        payload.proofAttachment?.fileName?.trim() ||
        payload.proofUrl?.trim() ||
        payload.proofNote?.trim() ||
        payload.badge.trim(),
      created_at: createdAt,
    });

    const created = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        WHERE id = ?`,
      )
      .get(id) as AchievementRow | undefined;

    if (!created) {
      throw new Error("Unable to create achievement");
    }

    return mapAchievement(created);
  },

  verifyAchievement(payload: {
    achievementId: string;
    verifiedBy: string;
    method?: string;
    evidence?: string;
  }) {
    const verifiedAt = new Date().toISOString();
    db.prepare(`
      UPDATE achievements
      SET
        verification_status = 'verified',
        verified_at = @verified_at,
        verified_by = @verified_by,
        verification_method = @verification_method,
        verification_evidence = @verification_evidence
      WHERE id = @id
    `).run({
      id: payload.achievementId,
      verified_at: verifiedAt,
      verified_by: payload.verifiedBy.trim(),
      verification_method: payload.method?.trim() || "manual-review",
      verification_evidence: payload.evidence?.trim() || null,
    });

    const row = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        WHERE id = ?`,
      )
      .get(payload.achievementId) as AchievementRow | undefined;

    if (!row) {
      throw new Error("Achievement not found");
    }

    return mapAchievement(row);
  },

  listStudentProfiles(): StudentProfile[] {
    const profileRows = db
      .prepare(
        "SELECT student_id, full_name, class_id, average_score, weak_subjects, created_at, updated_at FROM student_profiles ORDER BY class_id ASC, full_name ASC",
      )
      .all() as StudentProfileRow[];

    const progressRows = db
      .prepare(
        "SELECT id, student_id, subject, current_score, trend, risk, history_json, created_at, updated_at FROM student_subject_progress ORDER BY student_id ASC, subject ASC",
      )
      .all() as SubjectProgressRow[];

    const progressByStudent = new Map<string, StudentProfile["progress"]>();

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

      const avgFromProgress =
        progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;
      const averageScore = Number(
        Number.isFinite(row.average_score) && row.average_score > 0
          ? row.average_score.toFixed(2)
          : avgFromProgress.toFixed(2),
      );

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

  upsertStudentProfiles(profiles: StudentProfile[]) {
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

    const tx = db.transaction((items: StudentProfile[]) => {
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

        const avgFromProgress =
          progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;

        upsertProfile.run({
          student_id: studentId,
          full_name: profile.fullName.trim(),
          class_id: profile.classId.trim().toUpperCase(),
          average_score: Number(
            (Number.isFinite(profile.averageScore) ? profile.averageScore : avgFromProgress).toFixed(2),
          ),
          weak_subjects: JSON.stringify(weakSubjects),
          created_at: now,
          updated_at: now,
        });

        deleteProgress.run(studentId);

        for (const subject of progress) {
          insertProgress.run({
            id: `spr-${randomUUID().slice(0, 8)}`,
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
