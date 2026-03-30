import axios from "axios";
import { GradePoint, StudentProfile, SubjectProgress } from "../types";
import { academicStoreService } from "./academicStoreService";

type BilimClassConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  useLive: boolean;
  paths: string[];
};

type SyncMode = "live" | "database";

let lastMode: SyncMode = "database";
let lastSyncAt: string | null = null;
let lastError: string | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const pickString = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = cleanString(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
};

const pickNumber = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const raw = source[key];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const pickArray = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const toDateIso = (value: unknown, fallbackIndex: number) => {
  const asString = cleanString(value);
  if (!asString) {
    const date = new Date();
    date.setDate(date.getDate() - Math.max(0, fallbackIndex));
    return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    const date = new Date();
    date.setDate(date.getDate() - Math.max(0, fallbackIndex));
    return date.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

const normalizeHistory = (value: unknown): GradePoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const points: GradePoint[] = [];

  for (const [index, item] of value.entries()) {
    if (typeof item === "number") {
      points.push({
        date: toDateIso(null, index),
        score: Number(item.toFixed(2)),
      });
      continue;
    }

    if (!isRecord(item)) {
      continue;
    }

    const score =
      pickNumber(item, ["score", "value", "grade", "point", "mark"]) ??
      pickNumber(item, ["current", "currentScore"]);
    if (score === null) {
      continue;
    }

    points.push({
      date: toDateIso(item.date ?? item.createdAt ?? item.timestamp, index),
      score: Number(score.toFixed(2)),
    });
  }

  return points;
};

const normalizeSubjectProgress = (value: unknown, index: number): SubjectProgress | null => {
  if (!isRecord(value)) {
    return null;
  }

  const subject = pickString(value, ["subject", "name", "title", "subjectName"]);
  if (!subject) {
    return null;
  }

  const historySource = pickArray(value, ["history", "grades", "marks", "scores"]);
  const history = normalizeHistory(historySource);

  const currentFromField = pickNumber(value, ["current", "currentScore", "score", "grade", "mark"]);
  const currentFromHistory = history.length > 0 ? history[history.length - 1].score : null;
  const current = Number((currentFromField ?? currentFromHistory ?? 0).toFixed(2));

  const trendFromField = pickNumber(value, ["trend", "delta", "change"]);
  const trendFromHistory =
    history.length >= 2
      ? Number((history[history.length - 1].score - history[history.length - 2].score).toFixed(2))
      : 0;
  const trend = Number((trendFromField ?? trendFromHistory).toFixed(2));

  const riskRaw = value.risk;
  const risk =
    typeof riskRaw === "boolean"
      ? riskRaw
      : typeof riskRaw === "number"
        ? riskRaw > 0
        : current < 4;

  return {
    subject,
    current,
    trend,
    risk,
    history: history.length > 0 ? history : [{ date: toDateIso(null, index), score: current }],
  };
};

const normalizeStudentProfile = (value: unknown, index: number): StudentProfile | null => {
  if (!isRecord(value)) {
    return null;
  }

  const studentId = pickString(value, ["studentId", "student_id", "id", "userId", "user_id"]);
  const fullName = pickString(value, ["fullName", "name", "studentName", "student_name"]);
  const classId = pickString(value, ["classId", "class_id", "class", "gradeClass", "grade"]);

  if (!studentId || !fullName || !classId) {
    return null;
  }

  const progressRaw = pickArray(value, ["progress", "subjects", "subjectProgress", "performance"]);
  const progress = progressRaw
    .map((item, subjectIndex) => normalizeSubjectProgress(item, subjectIndex))
    .filter((item): item is SubjectProgress => item !== null);

  const averageFromField = pickNumber(value, ["averageScore", "average", "gpa", "meanScore"]);
  const averageFromProgress =
    progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;
  const averageScore = Number((averageFromField ?? averageFromProgress).toFixed(2));

  const weakFromField = pickArray(value, ["weakSubjects", "weak_subjects", "riskSubjects"])
    .map((item) => cleanString(item))
    .filter(Boolean);
  const weakFromProgress = progress.filter((item) => item.risk).map((item) => item.subject);
  const weakSubjects = [...new Set([...weakFromField, ...weakFromProgress])];

  return {
    studentId,
    fullName,
    classId: classId.toUpperCase(),
    averageScore,
    weakSubjects,
    progress,
  };
};

const extractStudentsPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  const list =
    pickArray(payload, ["students", "data", "items", "results", "profiles", "rows"]) || [];

  if (Array.isArray(list) && list.length > 0) {
    return list;
  }

  if (isRecord(payload.data) && Array.isArray(payload.data.students)) {
    return payload.data.students;
  }

  return [];
};

const normalizeProfiles = (payload: unknown): StudentProfile[] => {
  const studentsPayload = extractStudentsPayload(payload);
  const normalized = studentsPayload
    .map((item, index) => normalizeStudentProfile(item, index))
    .filter((item): item is StudentProfile => item !== null)
    .filter((item) => item.progress.length > 0);

  return normalized;
};

const trimSlashes = (value: string) => value.replace(/\/+$/, "");

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const getConfig = (): BilimClassConfig => {
  const baseUrl = trimSlashes(process.env.BILIMCLASS_BASE_URL?.trim() ?? "");
  const token = process.env.BILIMCLASS_TOKEN?.trim() ?? "";
  const useRealValue = process.env.USE_REAL_BILIMCLASS?.trim().toLowerCase();
  const useLive = useRealValue === undefined || useRealValue === "" || useRealValue === "true";

  const timeoutRaw = Number(process.env.BILIMCLASS_TIMEOUT_MS ?? 10000);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000;

  const rawPaths = process.env.BILIMCLASS_STUDENT_PROFILES_PATHS?.trim();
  const paths = rawPaths
    ? rawPaths
        .split(",")
        .map(normalizePath)
        .filter(Boolean)
    : ["/student-profiles", "/students", "/api/student-profiles", "/api/students"];

  return {
    baseUrl,
    token,
    timeoutMs,
    useLive,
    paths,
  };
};

const fetchLiveProfiles = async (config: BilimClassConfig): Promise<StudentProfile[] | null> => {
  for (const endpointPath of config.paths) {
    const url = `${config.baseUrl}${endpointPath}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
        timeout: config.timeoutMs,
      });

      const profiles = normalizeProfiles(response.data);
      if (profiles.length > 0) {
        lastError = null;
        return profiles;
      }
      lastError = `В ответе BilimClass нет корректных профилей: ${endpointPath}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка BilimClass";
      lastError = `${endpointPath}: ${message}`;
    }
  }

  return null;
};

export const bilimClassService = {
  async getStudentProfiles(): Promise<StudentProfile[]> {
    const config = getConfig();

    if (config.useLive && config.baseUrl && config.token) {
      const liveProfiles = await fetchLiveProfiles(config);
      if (liveProfiles && liveProfiles.length > 0) {
        academicStoreService.upsertStudentProfiles(liveProfiles);
        lastMode = "live";
        lastSyncAt = new Date().toISOString();
        return academicStoreService.listStudentProfiles();
      }
    }

    lastMode = "database";
    lastSyncAt = new Date().toISOString();
    return academicStoreService.listStudentProfiles();
  },

  status() {
    const config = getConfig();
    const defaultMode: SyncMode =
      config.useLive && config.baseUrl && config.token ? "live" : "database";

    return {
      provider: "BilimClass",
      mode: lastSyncAt ? lastMode : defaultMode,
      configured: Boolean(config.baseUrl && config.token),
      liveEnabled: config.useLive,
      lastSyncAt,
      lastError,
    };
  },
};

