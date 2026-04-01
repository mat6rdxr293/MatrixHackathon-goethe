import axios from "axios";
import { GradePoint, StudentProfile, SubjectProgress } from "../types";
import { academicStoreService } from "./academicStoreService";
import { storageService } from "./storageService";

type SyncMode = "live" | "database";

type BilimClassAuthResponse = {
  accessToken: string;
  hash?: string;
  expiresAtEpochSec?: number;
};

type BilimClassAuthHints = {
  schoolIds: number[];
  groupIds: number[];
  eduYears: number[];
  periods: number[];
  periodTypes: string[];
};

type BilimClassStudentBinding = {
  studentId: string;
  fullName: string;
  classId: string;
  groupId?: number;
  schoolId?: number;
  eduYear?: number;
  period?: number;
  periodType?: string;
};

type RuntimeStudentBinding = {
  studentId: string;
  fullName: string;
  classId: string;
  groupId: number | null;
  schoolId: number | null;
  eduYear: number | null;
  period: number | null;
  periodType: string;
};

type BilimClassConfig = {
  useLive: boolean;
  allowSeedFallback: boolean;
  baseUrl: string;
  timeoutMs: number;
  staticToken: string;
  loginPath: string;
  diarySubjectsPath: string;
  loginValue: string;
  passwordValue: string;
  loginPayload: Record<string, unknown> | null;
  loginHeaders: Record<string, string>;
  requestHeaders: Record<string, string>;
  schoolId: number | null;
  eduYear: number | null;
  period: number | null;
  periodType: string;
  defaultGroupId: number | null;
  groupByClass: Record<string, number>;
  groupByStudent: Record<string, number>;
  schoolByClass: Record<string, number>;
  schoolByStudent: Record<string, number>;
  bindings: BilimClassStudentBinding[];
};

type BilimCredentialsVerification = {
  ok: boolean;
  accountName: string | null;
  error: string | null;
};

type BilimCredentials = {
  login: string;
  password: string;
};

type LinkedBilimAccount = {
  userId: string;
  role: "student" | "teacher" | "parent" | "admin";
  name: string;
  classId: string | null;
  linkedStudentId: string | null;
  login: string;
  password: string;
  schoolId: number | null;
  groupId: number | null;
  eduYear: number | null;
  period: number | null;
  periodType: string | null;
};

let lastMode: SyncMode = "database";
let lastSyncAt: string | null = null;
let lastError: string | null = null;

const authCacheByKey = new Map<string, BilimClassAuthResponse>();
const authHintsByKey = new Map<string, BilimClassAuthHints>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const trimSlashes = (value: string) => value.replace(/\/+$/, "");

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const normalizeClassId = (value: string) => value.trim().toUpperCase();

const normalizeSubjectKey = (value: string) => value.trim().toLowerCase();

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

const pickString = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = cleanString(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
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

const parseJson = (raw: string | undefined): unknown => {
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseHeadersRecord = (raw: string | undefined): Record<string, string> => {
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }
    const normalizedValue = cleanString(value);
    if (normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return result;
};

const parseNumberMap = (raw: string | undefined): Record<string, number> => {
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }
    const parsedNumber = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
      result[normalizedKey] = Math.round(parsedNumber);
    }
  }
  return result;
};

const pickMappedNumber = (map: Record<string, number>, key: string) =>
  map[key] ?? map[key.toUpperCase()] ?? map[key.toLowerCase()] ?? null;

const parseStudentBindings = (raw: string | undefined): BilimClassStudentBinding[] => {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const result: BilimClassStudentBinding[] = [];
  for (const row of parsed) {
    if (!isRecord(row)) {
      continue;
    }
    const studentId = pickString(row, ["studentId", "student_id", "id"]);
    const fullName = pickString(row, ["fullName", "name"]);
    const classIdRaw = pickString(row, ["classId", "class_id", "class"]);
    if (!studentId || !fullName || !classIdRaw) {
      continue;
    }

    const groupId = pickNumber(row, ["groupId", "group_id"]);
    const schoolId = pickNumber(row, ["schoolId", "school_id"]);
    const eduYear = pickNumber(row, ["eduYear", "edu_year"]);
    const period = pickNumber(row, ["period"]);
    const periodType = pickString(row, ["periodType", "period_type"]);

    result.push({
      studentId,
      fullName,
      classId: normalizeClassId(classIdRaw),
      groupId: groupId !== null ? Math.round(groupId) : undefined,
      schoolId: schoolId !== null ? Math.round(schoolId) : undefined,
      eduYear: eduYear !== null ? Math.round(eduYear) : undefined,
      period: period !== null ? Math.round(period) : undefined,
      periodType: periodType || undefined,
    });
  }

  return result;
};

const parsePositiveNumber = (value: string | undefined): number | null => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
};

const normalizeHintNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
};

const pushUniqueNumber = (target: number[], value: unknown, predicate?: (value: number) => boolean) => {
  const normalized = normalizeHintNumber(value);
  if (!normalized) {
    return;
  }
  if (predicate && !predicate(normalized)) {
    return;
  }
  if (!target.includes(normalized)) {
    target.push(normalized);
  }
};

const pushUniqueString = (target: string[], value: unknown, normalize = true) => {
  const raw = cleanString(value);
  if (!raw) {
    return;
  }
  const nextValue = normalize ? raw.toLowerCase() : raw;
  if (!target.includes(nextValue)) {
    target.push(nextValue);
  }
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractHintsFromPayload = (payload: unknown): BilimClassAuthHints => {
  const hints: BilimClassAuthHints = {
    schoolIds: [],
    groupIds: [],
    eduYears: [],
    periods: [],
    periodTypes: [],
  };

  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || !isRecord(value)) {
      return;
    }

    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = rawKey.toLowerCase().replace(/[\s_-]/g, "");
      if (["schoolid", "idschool", "school"].includes(key)) {
        pushUniqueNumber(hints.schoolIds, rawValue, (candidate) => candidate > 1000);
      }
      if (["groupid", "classid", "studentgroupid", "educgroupid"].includes(key)) {
        pushUniqueNumber(hints.groupIds, rawValue, (candidate) => candidate > 1000);
      }
      if (["eduyear", "academicyear", "schoolyear", "year"].includes(key)) {
        pushUniqueNumber(hints.eduYears, rawValue, (candidate) => candidate >= 2000 && candidate <= 2100);
      }
      if (["period", "quarter", "trimester", "semester", "term"].includes(key)) {
        pushUniqueNumber(hints.periods, rawValue, (candidate) => candidate >= 1 && candidate <= 12);
      }
      if (["periodtype", "period"].includes(key) && typeof rawValue === "string") {
        pushUniqueString(hints.periodTypes, rawValue);
      }

      if (Array.isArray(rawValue)) {
        for (const item of rawValue) {
          walk(item, depth + 1);
        }
        continue;
      }

      if (isRecord(rawValue)) {
        walk(rawValue, depth + 1);
      }
    }
  };

  walk(payload, 0);
  return hints;
};

const mergeAuthHints = (...items: Array<BilimClassAuthHints | null | undefined>): BilimClassAuthHints => {
  const merged: BilimClassAuthHints = {
    schoolIds: [],
    groupIds: [],
    eduYears: [],
    periods: [],
    periodTypes: [],
  };

  for (const item of items) {
    if (!item) {
      continue;
    }
    for (const value of item.schoolIds) {
      pushUniqueNumber(merged.schoolIds, value);
    }
    for (const value of item.groupIds) {
      pushUniqueNumber(merged.groupIds, value);
    }
    for (const value of item.eduYears) {
      pushUniqueNumber(merged.eduYears, value);
    }
    for (const value of item.periods) {
      pushUniqueNumber(merged.periods, value);
    }
    for (const value of item.periodTypes) {
      pushUniqueString(merged.periodTypes, value);
    }
  }

  return merged;
};

const collectKnownSchoolIds = (config: BilimClassConfig) => {
  const result: number[] = [];
  pushUniqueNumber(result, config.schoolId);
  for (const value of Object.values(config.schoolByClass)) {
    pushUniqueNumber(result, value);
  }
  for (const value of Object.values(config.schoolByStudent)) {
    pushUniqueNumber(result, value);
  }
  return result;
};

const collectKnownGroupIds = (config: BilimClassConfig) => {
  const result: number[] = [];
  pushUniqueNumber(result, config.defaultGroupId);
  for (const value of Object.values(config.groupByClass)) {
    pushUniqueNumber(result, value);
  }
  for (const value of Object.values(config.groupByStudent)) {
    pushUniqueNumber(result, value);
  }
  return result;
};

const deriveAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? year : year - 1;
};

const deriveQuarter = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 9 && month <= 10) {
    return 1;
  }
  if (month >= 11 && month <= 12) {
    return 2;
  }
  if (month >= 1 && month <= 3) {
    return 3;
  }
  return 4;
};

const buildBindingCandidates = (
  binding: RuntimeStudentBinding,
  config: BilimClassConfig,
  hints: BilimClassAuthHints,
): RuntimeStudentBinding[] => {
  const schoolCandidates: number[] = [];
  const groupCandidates: number[] = [];
  const eduYearCandidates: number[] = [];
  const periodCandidates: number[] = [];
  const periodTypeCandidates: string[] = [];

  pushUniqueNumber(schoolCandidates, binding.schoolId);
  for (const value of hints.schoolIds) {
    pushUniqueNumber(schoolCandidates, value);
  }
  for (const value of collectKnownSchoolIds(config)) {
    pushUniqueNumber(schoolCandidates, value);
  }

  pushUniqueNumber(groupCandidates, binding.groupId);
  for (const value of hints.groupIds) {
    pushUniqueNumber(groupCandidates, value);
  }
  for (const value of collectKnownGroupIds(config)) {
    pushUniqueNumber(groupCandidates, value);
  }

  pushUniqueNumber(eduYearCandidates, binding.eduYear, (value) => value >= 2000 && value <= 2100);
  for (const value of hints.eduYears) {
    pushUniqueNumber(eduYearCandidates, value, (candidate) => candidate >= 2000 && candidate <= 2100);
  }
  pushUniqueNumber(eduYearCandidates, config.eduYear, (value) => value >= 2000 && value <= 2100);
  pushUniqueNumber(eduYearCandidates, deriveAcademicYear(), (value) => value >= 2000 && value <= 2100);

  pushUniqueNumber(periodCandidates, binding.period, (value) => value >= 1 && value <= 12);
  for (const value of hints.periods) {
    pushUniqueNumber(periodCandidates, value, (candidate) => candidate >= 1 && candidate <= 12);
  }
  pushUniqueNumber(periodCandidates, config.period, (value) => value >= 1 && value <= 12);
  pushUniqueNumber(periodCandidates, deriveQuarter(), (value) => value >= 1 && value <= 12);

  pushUniqueString(periodTypeCandidates, binding.periodType);
  for (const value of hints.periodTypes) {
    pushUniqueString(periodTypeCandidates, value);
  }
  pushUniqueString(periodTypeCandidates, config.periodType);
  pushUniqueString(periodTypeCandidates, "quarter");

  const result: RuntimeStudentBinding[] = [];
  const dedupe = new Set<string>();

  const pushCandidate = (candidate: RuntimeStudentBinding) => {
    if (!candidate.groupId || !candidate.schoolId || !candidate.eduYear || !candidate.period || !candidate.periodType) {
      return;
    }
    const key = `${candidate.schoolId}|${candidate.groupId}|${candidate.eduYear}|${candidate.period}|${candidate.periodType}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);
    result.push(candidate);
  };

  pushCandidate({
    ...binding,
    periodType: cleanString(binding.periodType).toLowerCase(),
  });

  for (const schoolId of schoolCandidates.slice(0, 6)) {
    for (const groupId of groupCandidates.slice(0, 6)) {
      for (const eduYear of eduYearCandidates.slice(0, 4)) {
        for (const period of periodCandidates.slice(0, 4)) {
          for (const periodType of periodTypeCandidates.slice(0, 3)) {
            pushCandidate({
              ...binding,
              schoolId,
              groupId,
              eduYear,
              period,
              periodType,
            });
            if (result.length >= 48) {
              return result;
            }
          }
        }
      }
    }
  }

  return result;
};

const resolveLoginPayload = (config: BilimClassConfig, login: string, password: string) => {
  if (!config.loginPayload) {
    return {
      login,
      password,
    };
  }

  return {
    ...config.loginPayload,
    login,
    password,
  };
};

const normalizeToFiveScale = (rawScore: number, markMax: number | null) => {
  let score = rawScore;
  if (markMax && markMax > 0) {
    score = (rawScore / markMax) * 5;
  } else if (rawScore > 5) {
    if (rawScore <= 10) {
      score = rawScore / 2;
    } else if (rawScore <= 25) {
      score = (rawScore / 25) * 5;
    } else if (rawScore <= 100) {
      score = (rawScore / 100) * 5;
    } else {
      score = 5;
    }
  }

  return Number(Math.max(0, Math.min(5, score)).toFixed(2));
};

const parseScoreFromString = (value: string, markMaxHint: number | null): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const fractionMatch = trimmed.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1].replace(",", "."));
    const denominator = Number(fractionMatch[2].replace(",", "."));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return normalizeToFiveScale(numerator, denominator);
    }
  }

  const numberMatch = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (!numberMatch) {
    return null;
  }

  const parsed = Number(numberMatch[0].replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return normalizeToFiveScale(parsed, markMaxHint);
};

const parseScoreCandidate = (value: unknown, markMaxHint: number | null, depth = 0): number | null => {
  if (depth > 3) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeToFiveScale(value, markMaxHint);
  }

  if (typeof value === "string") {
    return parseScoreFromString(value, markMaxHint);
  }

  if (!isRecord(value)) {
    return null;
  }

  const localMarkMax = pickNumber(value, ["markMax", "maxMark", "max_score", "max"]) ?? markMaxHint;

  const directKeys = ["mark", "score", "value", "result", "finalScore", "grade", "formattedValue", "percent"];
  for (const key of directKeys) {
    const parsed = parseScoreCandidate(value[key], localMarkMax, depth + 1);
    if (parsed !== null) {
      return parsed;
    }
  }

  const nestedKeys = ["formattedScore", "formatted", "sor", "soch", "scoreData", "assessment", "markInfo"];
  for (const key of nestedKeys) {
    const parsed = parseScoreCandidate(value[key], localMarkMax, depth + 1);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const toIsoDate = (value: unknown, fallbackIndex: number) => {
  const asString = cleanString(value);
  if (!asString) {
    const date = new Date();
    date.setDate(date.getDate() - Math.max(0, fallbackIndex));
    return date.toISOString().slice(0, 10);
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(asString)) {
    const [dayRaw, monthRaw, yearRaw] = asString.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() - Math.max(0, fallbackIndex));
  return fallbackDate.toISOString().slice(0, 10);
};

const extractScheduleDetailMap = (subject: Record<string, unknown>) => {
  const map = new Map<string, Record<string, unknown>>();

  const ingestRecord = (record: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(record)) {
      if (!looksLikeUuid(key) || !isRecord(value)) {
        continue;
      }
      map.set(key, value);
    }
  };

  ingestRecord(subject);

  const nestedCandidates = ["data", "details", "scheduleScores", "scoresBySchedule", "marksBySchedule"];
  for (const key of nestedCandidates) {
    const nested = subject[key];
    if (isRecord(nested)) {
      ingestRecord(nested);
    }
  }

  return map;
};

const extractDiarySubjects = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => isRecord(item));
  }
  if (!isRecord(payload)) {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data.filter((item): item is Record<string, unknown> => isRecord(item));
  }
  return [];
};

const mergeProgress = (remote: SubjectProgress[], fallback: SubjectProgress[]) => {
  const bySubject = new Map<string, SubjectProgress>();

  for (const item of remote) {
    bySubject.set(normalizeSubjectKey(item.subject), item);
  }

  for (const item of fallback) {
    const key = normalizeSubjectKey(item.subject);
    if (!bySubject.has(key)) {
      bySubject.set(key, item);
    }
  }

  return [...bySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject));
};

const deriveWeakSubjects = (progress: SubjectProgress[]) => progress.filter((item) => item.risk).map((item) => item.subject);

const averageScoreFromProgress = (progress: SubjectProgress[]) => {
  if (progress.length === 0) {
    return 0;
  }
  const value = progress.reduce((sum, item) => sum + item.current, 0) / progress.length;
  return Number(value.toFixed(2));
};

const buildSubjectProgress = (
  subject: Record<string, unknown>,
  fallback: SubjectProgress | null,
  index: number,
): SubjectProgress | null => {
  const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
  if (!subjectName) {
    return fallback;
  }

  const detailByScheduleUuid = extractScheduleDetailMap(subject);
  const schedules = pickArray(subject, ["schedules", "schedule", "lessons"]);
  const history: GradePoint[] = [];
  const historyDedup = new Set<string>();

  const pushScore = (raw: unknown, date: string, markMaxHint: number | null) => {
    const parsed = parseScoreCandidate(raw, markMaxHint);
    if (parsed === null) {
      return;
    }
    const key = `${date}|${parsed}`;
    if (historyDedup.has(key)) {
      return;
    }
    historyDedup.add(key);
    history.push({ date, score: parsed });
  };

  const collectFromRecord = (record: Record<string, unknown>, date: string, markMaxHint: number | null) => {
    pushScore(record, date, markMaxHint);

    const fields = ["mark", "score", "value", "result", "finalScore", "grade", "formattedValue"];
    for (const field of fields) {
      pushScore(record[field], date, markMaxHint);
    }

    const nestedFields = ["formattedScore", "formatted", "sor", "soch", "scoreData", "assessment", "markInfo"];
    for (const field of nestedFields) {
      pushScore(record[field], date, markMaxHint);
    }
  };

  for (const [scheduleIndex, rawSchedule] of schedules.entries()) {
    if (!isRecord(rawSchedule)) {
      continue;
    }

    const date = toIsoDate(rawSchedule.date ?? rawSchedule.lessonDate ?? rawSchedule.scheduleDate, scheduleIndex);
    const markMaxHint = pickNumber(rawSchedule, ["markMax", "maxMark", "max_score", "max"]);
    const scheduleUuid = pickString(rawSchedule, ["uuid", "id", "scheduleUuid"]);
    const detail = scheduleUuid ? detailByScheduleUuid.get(scheduleUuid) : undefined;

    collectFromRecord(rawSchedule, date, markMaxHint);
    if (detail) {
      collectFromRecord(detail, date, markMaxHint);
    }
  }

  if (history.length === 0) {
    pushScore(subject.finalScore, toIsoDate(null, index), pickNumber(subject, ["markMax", "maxMark"]));
  }

  if (history.length === 0) {
    return fallback;
  }

  history.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const current = Number(history[history.length - 1].score.toFixed(2));
  const trend =
    history.length >= 2 ? Number((history[history.length - 1].score - history[history.length - 2].score).toFixed(2)) : 0;

  return {
    subject: subjectName,
    current,
    trend,
    risk: current < 4,
    history,
  };
};

const buildProfileFromDiary = (
  binding: RuntimeStudentBinding,
  subjectsPayload: Record<string, unknown>[],
  fallbackProfile: StudentProfile | null,
): StudentProfile => {
  const fallbackProgress = fallbackProfile?.progress ?? [];
  const fallbackBySubject = new Map(
    fallbackProgress.map((item) => [normalizeSubjectKey(item.subject), item] as const),
  );

  const remoteProgress = subjectsPayload
    .map((subject, index) => {
      const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
      const fallbackSubject = subjectName ? fallbackBySubject.get(normalizeSubjectKey(subjectName)) ?? null : null;
      return buildSubjectProgress(subject, fallbackSubject, index);
    })
    .filter((item): item is SubjectProgress => item !== null);

  const progress = mergeProgress(remoteProgress, fallbackProgress);

  return {
    studentId: binding.studentId,
    fullName: binding.fullName,
    classId: binding.classId,
    averageScore: Number(
      (progress.length > 0
        ? averageScoreFromProgress(progress)
        : Number(fallbackProfile?.averageScore ?? 0)
      ).toFixed(2),
    ),
    weakSubjects: progress.length > 0 ? deriveWeakSubjects(progress) : fallbackProfile?.weakSubjects ?? [],
    progress,
  };
};

const parseExpiration = (value: unknown): number | null => {
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return null;
  }
  if (asNumber > 9_999_999_999) {
    return Math.floor(asNumber / 1000);
  }
  return Math.floor(asNumber);
};

const extractAuthResponse = (payload: unknown): BilimClassAuthResponse | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const topLevelToken = cleanString(payload.access_token);
  if (topLevelToken) {
    return {
      accessToken: topLevelToken,
      hash: cleanString(payload.hash) || undefined,
      expiresAtEpochSec: parseExpiration(payload.exp_time) ?? undefined,
    };
  }

  if (isRecord(payload.data)) {
    const nestedToken = cleanString(payload.data.access_token);
    if (nestedToken) {
      return {
        accessToken: nestedToken,
        hash: cleanString(payload.data.hash) || undefined,
        expiresAtEpochSec: parseExpiration(payload.data.exp_time) ?? undefined,
      };
    }
  }

  return null;
};

const extractAccountName = (payload: unknown) => {
  if (!isRecord(payload)) {
    return null;
  }

  const userInfo = isRecord(payload.user_info)
    ? payload.user_info
    : isRecord(payload.data) && isRecord(payload.data.user_info)
      ? payload.data.user_info
      : null;

  if (!userInfo) {
    return null;
  }

  const firstName = pickString(userInfo, ["firstname", "firstName", "name"]);
  const lastName = pickString(userInfo, ["lastname", "lastName", "surname"]);
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || null;
};

const buildRuntimeBindings = (baseProfiles: StudentProfile[], config: BilimClassConfig): RuntimeStudentBinding[] => {
  const byStudent = new Map<string, RuntimeStudentBinding>();

  for (const profile of baseProfiles) {
    byStudent.set(profile.studentId, {
      studentId: profile.studentId,
      fullName: profile.fullName,
      classId: normalizeClassId(profile.classId),
      groupId: null,
      schoolId: config.schoolId,
      eduYear: config.eduYear,
      period: config.period,
      periodType: config.periodType,
    });
  }

  for (const item of config.bindings) {
    const existing = byStudent.get(item.studentId);
    const merged: RuntimeStudentBinding = {
      studentId: item.studentId,
      fullName: item.fullName,
      classId: item.classId,
      groupId: item.groupId ?? existing?.groupId ?? null,
      schoolId: item.schoolId ?? existing?.schoolId ?? config.schoolId,
      eduYear: item.eduYear ?? existing?.eduYear ?? config.eduYear,
      period: item.period ?? existing?.period ?? config.period,
      periodType: item.periodType?.trim() || existing?.periodType || config.periodType,
    };
    byStudent.set(item.studentId, merged);
  }

  const result: RuntimeStudentBinding[] = [];
  for (const item of byStudent.values()) {
    const classBasedGroup = pickMappedNumber(config.groupByClass, item.classId);
    const classBasedSchool = pickMappedNumber(config.schoolByClass, item.classId);
    const studentGroup = pickMappedNumber(config.groupByStudent, item.studentId);
    const studentSchool = pickMappedNumber(config.schoolByStudent, item.studentId);

    result.push({
      ...item,
      groupId: studentGroup ?? classBasedGroup ?? item.groupId ?? config.defaultGroupId,
      schoolId: studentSchool ?? classBasedSchool ?? item.schoolId ?? config.schoolId,
      eduYear: item.eduYear ?? config.eduYear,
      period: item.period ?? config.period,
      periodType: item.periodType || config.periodType,
    });
  }

  return result;
};

const getConfig = (): BilimClassConfig => {
  const useRealValue = process.env.USE_REAL_BILIMCLASS?.trim().toLowerCase();
  const useLive = useRealValue === undefined || useRealValue === "" || useRealValue === "true";

  const allowFallbackValue = process.env.BILIMCLASS_ALLOW_SEED_FALLBACK?.trim().toLowerCase();
  const allowSeedFallback =
    allowFallbackValue === undefined ||
    allowFallbackValue === "" ||
    allowFallbackValue === "1" ||
    allowFallbackValue === "true" ||
    allowFallbackValue === "yes";

  const timeoutRaw = Number(process.env.BILIMCLASS_TIMEOUT_MS ?? 10000);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000;

  const baseUrl = trimSlashes(process.env.BILIMCLASS_BASE_URL?.trim() ?? "https://api.bilimclass.kz");

  const loginPath = normalizePath(process.env.BILIMCLASS_LOGIN_PATH ?? "/api/v2/os/login");
  const diarySubjectsPath = normalizePath(
    process.env.BILIMCLASS_DIARY_SUBJECTS_PATH ?? "/api/v4/os/clientoffice/diary/subjects",
  );

  const loginPayloadParsed = parseJson(process.env.BILIMCLASS_LOGIN_PAYLOAD_JSON);
  const loginPayload =
    isRecord(loginPayloadParsed) && Object.keys(loginPayloadParsed).length > 0 ? loginPayloadParsed : null;

  return {
    useLive,
    allowSeedFallback,
    baseUrl,
    timeoutMs,
    staticToken: cleanString(process.env.BILIMCLASS_TOKEN),
    loginPath,
    diarySubjectsPath,
    loginValue: cleanString(process.env.BILIMCLASS_LOGIN),
    passwordValue: cleanString(process.env.BILIMCLASS_PASSWORD),
    loginPayload,
    loginHeaders: parseHeadersRecord(process.env.BILIMCLASS_LOGIN_HEADERS_JSON),
    requestHeaders: parseHeadersRecord(process.env.BILIMCLASS_REQUEST_HEADERS_JSON),
    schoolId: parsePositiveNumber(process.env.BILIMCLASS_SCHOOL_ID),
    eduYear: parsePositiveNumber(process.env.BILIMCLASS_EDU_YEAR),
    period: parsePositiveNumber(process.env.BILIMCLASS_PERIOD),
    periodType: cleanString(process.env.BILIMCLASS_PERIOD_TYPE) || "quarter",
    defaultGroupId: parsePositiveNumber(process.env.BILIMCLASS_GROUP_ID),
    groupByClass: parseNumberMap(process.env.BILIMCLASS_GROUP_ID_BY_CLASS_JSON),
    groupByStudent: parseNumberMap(process.env.BILIMCLASS_GROUP_ID_BY_STUDENT_JSON),
    schoolByClass: parseNumberMap(process.env.BILIMCLASS_SCHOOL_ID_BY_CLASS_JSON),
    schoolByStudent: parseNumberMap(process.env.BILIMCLASS_SCHOOL_ID_BY_STUDENT_JSON),
    bindings: parseStudentBindings(process.env.BILIMCLASS_STUDENTS_JSON),
  };
};

const buildAuthCacheKey = (config: BilimClassConfig, credentials?: BilimCredentials | null) => {
  if (config.staticToken && !credentials) {
    return `static:${config.staticToken}`;
  }
  if (credentials) {
    return `user:${credentials.login.toLowerCase()}|${credentials.password}`;
  }
  return `default:${config.loginValue.toLowerCase()}|${config.passwordValue}`;
};

const ensureAuth = async (
  config: BilimClassConfig,
  credentials?: BilimCredentials | null,
): Promise<{ auth: BilimClassAuthResponse; cacheKey: string } | null> => {
  const cacheKey = buildAuthCacheKey(config, credentials);
  if (config.staticToken && !credentials) {
    return {
      auth: {
        accessToken: config.staticToken,
      },
      cacheKey,
    };
  }

  const cachedAuth = authCacheByKey.get(cacheKey);
  if (cachedAuth?.accessToken) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (!cachedAuth.expiresAtEpochSec || cachedAuth.expiresAtEpochSec > nowSec + 60) {
      return { auth: cachedAuth, cacheKey };
    }
  }

  const login = cleanString(credentials?.login) || config.loginValue;
  const password = cleanString(credentials?.password) || config.passwordValue;
  const loginPayload = resolveLoginPayload(config, login, password);

  if (!isRecord(loginPayload)) {
    lastError = "BILIMCLASS login payload is invalid";
    return null;
  }

  if (!login || !password) {
    lastError = "BILIMCLASS credentials are not configured";
    return null;
  }

  try {
    const response = await axios.post(`${config.baseUrl}${config.loginPath}`, loginPayload, {
      timeout: config.timeoutMs,
      headers: {
        "Content-Type": "application/json",
        ...config.loginHeaders,
      },
    });

    const auth = extractAuthResponse(response.data);
    if (!auth?.accessToken) {
      lastError = "BilimClass login succeeded but access token was not found in response";
      return null;
    }

    authCacheByKey.set(cacheKey, auth);
    const payloadHints = extractHintsFromPayload(response.data);
    const tokenHints = extractHintsFromPayload(decodeJwtPayload(auth.accessToken));
    authHintsByKey.set(cacheKey, mergeAuthHints(payloadHints, tokenHints));
    return { auth, cacheKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BilimClass login failed";
    lastError = `BilimClass login failed: ${message}`;
    return null;
  }
};

const fetchDiarySubjects = async (
  config: BilimClassConfig,
  auth: BilimClassAuthResponse,
  binding: RuntimeStudentBinding,
): Promise<Record<string, unknown>[] | null> => {
  if (!binding.groupId || !binding.schoolId || !binding.eduYear || !binding.period || !binding.periodType) {
    return null;
  }

  try {
    const response = await axios.get(`${config.baseUrl}${config.diarySubjectsPath}`, {
      timeout: config.timeoutMs,
      params: {
        schoolId: binding.schoolId,
        eduYear: binding.eduYear,
        period: binding.period,
        periodType: binding.periodType,
        groupId: binding.groupId,
      },
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        ...(auth.hash ? { Hash: auth.hash, "x-hash": auth.hash } : {}),
        ...config.requestHeaders,
      },
    });

    const subjects = extractDiarySubjects(response.data);
    if (subjects.length === 0) {
      lastError = `BilimClass diary response does not contain subjects for groupId=${binding.groupId}`;
      return null;
    }

    return subjects;
  } catch (error) {
    const message = error instanceof Error ? error.message : "BilimClass diary request failed";
    lastError = `BilimClass diary request failed for groupId=${binding.groupId}: ${message}`;
    return null;
  }
};

const resolveBindingFromLinkedAccount = (
  account: LinkedBilimAccount,
  config: BilimClassConfig,
  fallbackByStudent: Map<string, StudentProfile>,
): RuntimeStudentBinding | null => {
  const studentId = account.linkedStudentId || (account.role === "student" ? account.userId : "");
  if (!studentId) {
    return null;
  }

  const fallbackStudent = fallbackByStudent.get(studentId) ?? null;
  const classId = normalizeClassId(account.classId || fallbackStudent?.classId || "");
  const classBasedGroup = classId ? pickMappedNumber(config.groupByClass, classId) : null;
  const classBasedSchool = classId ? pickMappedNumber(config.schoolByClass, classId) : null;
  const studentBasedGroup = pickMappedNumber(config.groupByStudent, studentId);
  const studentBasedSchool = pickMappedNumber(config.schoolByStudent, studentId);

  return {
    studentId,
    fullName: fallbackStudent?.fullName || account.name || studentId,
    classId: classId || normalizeClassId(fallbackStudent?.classId || "-"),
    groupId: account.groupId ?? studentBasedGroup ?? classBasedGroup ?? config.defaultGroupId,
    schoolId: account.schoolId ?? studentBasedSchool ?? classBasedSchool ?? config.schoolId,
    eduYear: account.eduYear ?? config.eduYear,
    period: account.period ?? config.period,
    periodType: cleanString(account.periodType) || config.periodType,
  };
};

const buildBindingsFromLinkedAccounts = (
  fallbackProfiles: StudentProfile[],
  config: BilimClassConfig,
): Array<{ binding: RuntimeStudentBinding; credentials: BilimCredentials }> => {
  const fallbackByStudent = new Map(fallbackProfiles.map((item) => [item.studentId, item] as const));
  const linkedAccounts = storageService.listBilimLinkedUsers() as LinkedBilimAccount[];
  const result: Array<{ binding: RuntimeStudentBinding; credentials: BilimCredentials }> = [];

  for (const account of linkedAccounts) {
    const binding = resolveBindingFromLinkedAccount(account, config, fallbackByStudent);
    if (!binding) {
      continue;
    }
    result.push({
      binding,
      credentials: {
        login: account.login,
        password: account.password,
      },
    });
  }

  return result;
};

const syncProfilesForBindings = async (
  config: BilimClassConfig,
  fallbackProfiles: StudentProfile[],
  bindings: Array<{ binding: RuntimeStudentBinding; credentials?: BilimCredentials | null }>,
) => {
  const fallbackByStudent = new Map(fallbackProfiles.map((item) => [item.studentId, item] as const));
  const profileByStudent = new Map<string, StudentProfile>();
  const requestCache = new Map<string, Promise<Record<string, unknown>[] | null>>();

  const getSubjectsForBinding = (
    binding: RuntimeStudentBinding,
    auth: BilimClassAuthResponse,
    credentials?: BilimCredentials | null,
  ) => {
    const authKey = credentials ? `${credentials.login}|${credentials.password}` : "default";
    const cacheKey = `${authKey}|${binding.schoolId}|${binding.eduYear}|${binding.period}|${binding.periodType}|${binding.groupId}`;
    const existing = requestCache.get(cacheKey);
    if (existing) {
      return existing;
    }
    const request = fetchDiarySubjects(config, auth, binding);
    requestCache.set(cacheKey, request);
    return request;
  };

  for (const item of bindings) {
    const authContext = await ensureAuth(config, item.credentials);
    if (!authContext) {
      continue;
    }

    const hints = authHintsByKey.get(authContext.cacheKey) ?? {
      schoolIds: [],
      groupIds: [],
      eduYears: [],
      periods: [],
      periodTypes: [],
    };
    const candidates = buildBindingCandidates(item.binding, config, hints);
    if (candidates.length === 0) {
      continue;
    }

    let resolvedBinding: RuntimeStudentBinding | null = null;
    let subjects: Record<string, unknown>[] | null = null;
    for (const candidate of candidates) {
      const candidateSubjects = await getSubjectsForBinding(candidate, authContext.auth, item.credentials);
      if (candidateSubjects) {
        resolvedBinding = candidate;
        subjects = candidateSubjects;
        break;
      }
    }

    if (!subjects || !resolvedBinding) {
      continue;
    }

    const fallbackProfile = fallbackByStudent.get(item.binding.studentId) ?? null;
    const profile = buildProfileFromDiary(resolvedBinding, subjects, fallbackProfile);
    profileByStudent.set(profile.studentId, profile);
  }

  return profileByStudent;
};

const mergeProfiles = (
  fallbackProfiles: StudentProfile[],
  ...sources: Map<string, StudentProfile>[]
): StudentProfile[] => {
  const mergedByStudent = new Map<string, StudentProfile>();
  for (const profile of fallbackProfiles) {
    mergedByStudent.set(profile.studentId, profile);
  }
  for (const source of sources) {
    for (const [studentId, profile] of source.entries()) {
      mergedByStudent.set(studentId, profile);
    }
  }
  return [...mergedByStudent.values()];
};

const syncLiveProfiles = async (
  config: BilimClassConfig,
  fallbackProfiles: StudentProfile[],
): Promise<StudentProfile[] | null> => {
  const linkedBindings = buildBindingsFromLinkedAccounts(fallbackProfiles, config);
  const linkedProfiles = await syncProfilesForBindings(config, fallbackProfiles, linkedBindings);

  const globalBindings = buildRuntimeBindings(fallbackProfiles, config)
    .filter((item) => item.groupId && item.schoolId && item.eduYear && item.period && item.periodType)
    .map((binding) => ({ binding, credentials: null }));

  const globalProfiles = await syncProfilesForBindings(config, fallbackProfiles, globalBindings);

  if (linkedProfiles.size === 0 && globalProfiles.size === 0) {
    lastError = "BilimClass sync returned no subject data for configured students";
    return null;
  }

  return mergeProfiles(fallbackProfiles, globalProfiles, linkedProfiles);
};

export const bilimClassService = {
  async verifyCredentials(login: string, password: string): Promise<BilimCredentialsVerification> {
    const config = getConfig();
    if (!config.baseUrl || !config.loginPath) {
      return {
        ok: false,
        accountName: null,
        error: "BilimClass endpoint is not configured",
      };
    }

    try {
      const response = await axios.post(
        `${config.baseUrl}${config.loginPath}`,
        resolveLoginPayload(config, login, password),
        {
          timeout: config.timeoutMs,
          headers: {
            "Content-Type": "application/json",
            ...config.loginHeaders,
          },
        },
      );

      const auth = extractAuthResponse(response.data);
      if (!auth?.accessToken) {
        return {
          ok: false,
          accountName: null,
          error: "BilimClass did not return access token",
        };
      }

      return {
        ok: true,
        accountName: extractAccountName(response.data),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "BilimClass login failed";
      return {
        ok: false,
        accountName: null,
        error: message,
      };
    }
  },

  async getStudentProfiles(): Promise<StudentProfile[]> {
    const config = getConfig();
    const fallbackProfiles = academicStoreService.listStudentProfiles();

    if (config.useLive) {
      const liveProfiles = await syncLiveProfiles(config, fallbackProfiles);
      if (liveProfiles && liveProfiles.length > 0) {
        academicStoreService.upsertStudentProfiles(liveProfiles);
        lastMode = "live";
        lastSyncAt = new Date().toISOString();
        lastError = null;
        return academicStoreService.listStudentProfiles();
      }
    }

    lastMode = "database";
    lastSyncAt = new Date().toISOString();
    if (!config.allowSeedFallback && fallbackProfiles.length === 0) {
      return [];
    }
    return fallbackProfiles;
  },

  status() {
    const config = getConfig();
    const linkedUsers = storageService.listBilimLinkedUsers();
    const hasAuth = Boolean(
      linkedUsers.length > 0 || config.staticToken || (config.loginValue && config.passwordValue) || config.loginPayload,
    );
    const hasBinding =
      Boolean(config.defaultGroupId) ||
      Object.keys(config.groupByClass).length > 0 ||
      Object.keys(config.groupByStudent).length > 0 ||
      config.bindings.some((item) => item.groupId) ||
      linkedUsers.some((item) => Boolean(item.groupId));

    return {
      provider: "BilimClass",
      mode: lastSyncAt ? lastMode : config.useLive ? "live" : "database",
      configured: hasAuth && hasBinding,
      liveEnabled: config.useLive,
      linkedAccounts: linkedUsers.length,
      lastSyncAt,
      lastError,
      endpoints: {
        login: `${config.baseUrl}${config.loginPath}`,
        diarySubjects: `${config.baseUrl}${config.diarySubjectsPath}`,
      },
    };
  },
};
