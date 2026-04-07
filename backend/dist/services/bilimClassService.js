"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bilimClassService = void 0;
const axios_1 = __importDefault(require("axios"));
const academicStoreService_1 = require("./academicStoreService");
const storageService_1 = require("./storageService");
const subjectNameLocalization_1 = require("../utils/subjectNameLocalization");
let lastMode = "database";
let lastSyncAt = null;
let lastError = null;
const authCacheByKey = new Map();
const authHintsByKey = new Map();
const authRuntimeByKey = new Map();
const isRecord = (value) => typeof value === "object" && value !== null;
const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const trimSlashes = (value) => value.replace(/\/+$/, "");
const normalizePath = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};
const normalizeClassId = (value) => value.trim().toUpperCase();
const normalizeSubjectKey = (value) => value.trim().toLowerCase();
const looksLikeUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeUuid = (value) => {
    const raw = cleanString(value).toLowerCase();
    return looksLikeUuid(raw) ? raw : "";
};
const pickNumber = (source, keys) => {
    for (const key of keys) {
        const raw = source[key];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(value)) {
            return value;
        }
    }
    return null;
};
const pickString = (source, keys) => {
    for (const key of keys) {
        const value = cleanString(source[key]);
        if (value) {
            return value;
        }
    }
    return "";
};
const pickArray = (source, keys) => {
    for (const key of keys) {
        const value = source[key];
        if (Array.isArray(value)) {
            return value;
        }
    }
    return [];
};
const parseJson = (raw) => {
    if (!raw || !raw.trim()) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
const parseHeadersRecord = (raw) => {
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) {
        return {};
    }
    const result = {};
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
const parseNumberMap = (raw) => {
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) {
        return {};
    }
    const result = {};
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
const pickMappedNumber = (map, key) => map[key] ?? map[key.toUpperCase()] ?? map[key.toLowerCase()] ?? null;
const parseStudentBindings = (raw) => {
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed)) {
        return [];
    }
    const result = [];
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
const parsePositiveNumber = (value) => {
    const parsed = Number(value ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.round(parsed);
};
const normalizeHintNumber = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.round(parsed);
};
const pushUniqueNumber = (target, value, predicate) => {
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
const pushUniqueString = (target, value, normalize = true) => {
    const raw = cleanString(value);
    if (!raw) {
        return;
    }
    const nextValue = normalize ? raw.toLowerCase() : raw;
    if (!target.includes(nextValue)) {
        target.push(nextValue);
    }
};
const decodeJwtPayload = (token) => {
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
    }
    catch {
        return null;
    }
};
const extractHintsFromPayload = (payload) => {
    const hints = {
        schoolIds: [],
        groupIds: [],
        eduYears: [],
        periods: [],
        periodTypes: [],
    };
    const walk = (value, depth) => {
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
const extractHintsFromAuthUserInfo = (payload) => {
    const hints = {
        schoolIds: [],
        groupIds: [],
        eduYears: [],
        periods: [],
        periodTypes: [],
    };
    if (!isRecord(payload)) {
        return hints;
    }
    const userInfo = isRecord(payload.user_info)
        ? payload.user_info
        : isRecord(payload.data) && isRecord(payload.data.user_info)
            ? payload.data.user_info
            : null;
    if (!userInfo) {
        return hints;
    }
    pushUniqueNumber(hints.schoolIds, pickNumber(userInfo, ["school_id", "schoolId"]), (value) => value > 1000);
    if (isRecord(userInfo.group)) {
        pushUniqueNumber(hints.groupIds, pickNumber(userInfo.group, ["id", "groupId", "classId"]), (value) => value > 1000);
    }
    if (isRecord(userInfo.school) && Array.isArray(userInfo.school.eduYears)) {
        const currentYear = userInfo.school.eduYears.find((item) => isRecord(item) && item.isCurrent);
        if (isRecord(currentYear)) {
            pushUniqueNumber(hints.schoolIds, pickNumber(currentYear, ["schoolId"]), (value) => value > 1000);
            pushUniqueNumber(hints.eduYears, pickNumber(currentYear, ["eduYear"]), (value) => value >= 2000 && value <= 2100);
        }
    }
    return hints;
};
const extractAuthRuntime = (payload) => {
    const result = {
        chatToken: null,
        userId: null,
        studentGroupUuid: null,
        studentGroupUuids: [],
    };
    if (!isRecord(payload)) {
        return result;
    }
    const nestedData = isRecord(payload.data) ? payload.data : null;
    const userInfo = isRecord(payload.user_info)
        ? payload.user_info
        : nestedData && isRecord(nestedData.user_info)
            ? nestedData.user_info
            : null;
    const studentInfo = userInfo && isRecord(userInfo.studentInfo)
        ? userInfo.studentInfo
        : userInfo && isRecord(userInfo.student_info)
            ? userInfo.student_info
            : null;
    const chatTokenCandidates = [
        userInfo ? userInfo.chatToken : null,
        userInfo ? userInfo.chat_token : null,
        payload.chatToken,
        payload.chat_token,
        nestedData ? nestedData.chatToken : null,
        nestedData ? nestedData.chat_token : null,
    ];
    for (const candidate of chatTokenCandidates) {
        const token = cleanString(candidate);
        if (token) {
            result.chatToken = token;
            break;
        }
    }
    result.userId =
        (userInfo ? pickNumber(userInfo, ["userId", "user_id", "id"]) : null) ??
            (nestedData ? pickNumber(nestedData, ["userId", "user_id"]) : null) ??
            pickNumber(payload, ["userId", "user_id"]);
    const pushGroupUuid = (candidate) => {
        const uuid = normalizeUuid(candidate);
        if (uuid && !result.studentGroupUuids.includes(uuid)) {
            result.studentGroupUuids.push(uuid);
        }
    };
    if (studentInfo) {
        pushGroupUuid(studentInfo.studentGroupUuid);
        pushGroupUuid(studentInfo.student_group_uuid);
        for (const value of pickArray(studentInfo, ["studentGroupUuids", "student_group_uuids"])) {
            pushGroupUuid(value);
        }
    }
    pushGroupUuid(userInfo ? userInfo.studentGroupUuid : null);
    pushGroupUuid(userInfo ? userInfo.student_group_uuid : null);
    result.studentGroupUuid = result.studentGroupUuids[0] ?? null;
    return result;
};
const withDefaultBilimHeaders = (headers) => ({
    "Accept-Language": "ru-RU,ru;q=0.9",
    "X-Language": "ru",
    ...headers,
});
const mergeAuthHints = (...items) => {
    const merged = {
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
const collectKnownSchoolIds = (config) => {
    const result = [];
    pushUniqueNumber(result, config.schoolId);
    for (const value of Object.values(config.schoolByClass)) {
        pushUniqueNumber(result, value);
    }
    for (const value of Object.values(config.schoolByStudent)) {
        pushUniqueNumber(result, value);
    }
    return result;
};
const collectKnownGroupIds = (config) => {
    const result = [];
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
const buildBindingCandidates = (binding, config, hints) => {
    const schoolCandidates = [];
    const groupCandidates = [];
    const eduYearCandidates = [];
    const periodCandidates = [];
    const periodTypeCandidates = [];
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
    const result = [];
    const dedupe = new Set();
    const pushCandidate = (candidate) => {
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
const resolveLoginPayload = (config, login, password) => {
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
const rkPercentToFivePoint = (percent) => {
    const normalized = Math.max(0, Math.min(100, percent));
    if (normalized <= 42) {
        return 2;
    }
    if (normalized <= 64) {
        return 3;
    }
    if (normalized <= 84) {
        return 4;
    }
    return 5;
};
const normalizeToFiveScale = (rawScore, markMax) => {
    if (markMax && markMax > 0) {
        return rkPercentToFivePoint((rawScore / markMax) * 100);
    }
    if (rawScore >= 2 && rawScore <= 5 && Math.abs(rawScore - Math.round(rawScore)) < 0.000001) {
        return Math.round(rawScore);
    }
    let percent;
    if (rawScore <= 5) {
        percent = rawScore * 20;
    }
    else if (rawScore <= 10) {
        percent = rawScore * 10;
    }
    else if (rawScore <= 25) {
        percent = (rawScore / 25) * 100;
    }
    else if (rawScore <= 100) {
        percent = rawScore;
    }
    else {
        percent = 100;
    }
    return rkPercentToFivePoint(percent);
};
const parseScoreFromString = (value, markMaxHint) => {
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
const parseScoreCandidate = (value, markMaxHint, depth = 0) => {
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
const toIsoDate = (value, fallbackIndex) => {
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
const extractScheduleDetailMap = (subject) => {
    const map = new Map();
    const ingestRecord = (record) => {
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
const extractDiarySubjects = (payload) => {
    if (Array.isArray(payload)) {
        return payload.filter((item) => isRecord(item));
    }
    if (!isRecord(payload)) {
        return [];
    }
    if (Array.isArray(payload.data)) {
        return payload.data.filter((item) => isRecord(item));
    }
    return [];
};
const extractAttestationItems = (payload) => {
    const rows = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.data)
            ? payload.data
            : [];
    const result = [];
    for (const row of rows) {
        if (!isRecord(row)) {
            continue;
        }
        const subjectName = pickString(row, ["subject", "subjectName", "name"]);
        const subjectUuid = pickString(row, ["subjectUuid", "subject_uuid"]) || null;
        const mark = cleanString(row.mark) || null;
        const recommendedMark = pickString(row, ["recommendedMark", "recommended_mark"]) || null;
        if (!subjectName && !subjectUuid) {
            continue;
        }
        result.push({
            subjectUuid,
            subjectName,
            mark,
            recommendedMark,
        });
    }
    return result;
};
const extractFinalMarksFromDiarySubjects = (subjects) => {
    const result = [];
    for (const subject of subjects) {
        const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
        const subjectUuid = pickString(subject, ["eduSubjectUuid", "subjectUuid", "uuid"]) || null;
        const finalMark = pickRawScoreValue(subject.finalScore);
        if (!finalMark || (!subjectName && !subjectUuid)) {
            continue;
        }
        result.push({
            subjectUuid,
            subjectName,
            finalMark,
        });
    }
    return result;
};
const mergeProgress = (remote, fallback) => {
    const bySubject = new Map();
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
const deriveWeakSubjects = (progress) => progress.filter((item) => item.risk).map((item) => item.subject);
const averageScoreFromProgress = (progress) => {
    if (progress.length === 0) {
        return 0;
    }
    const value = progress.reduce((sum, item) => sum + item.current, 0) / progress.length;
    return Number(value.toFixed(2));
};
const calculateCurrentAndTrendFromHistory = (history) => {
    if (history.length === 0) {
        return { current: 0, trend: 0 };
    }
    const current = Number((history.reduce((sum, item) => sum + item.score, 0) / history.length).toFixed(2));
    if (history.length < 2) {
        return { current, trend: 0 };
    }
    const windowSize = Math.min(3, Math.max(1, Math.floor(history.length / 2)));
    const recent = history.slice(-windowSize);
    const previous = history.slice(-(windowSize * 2), -windowSize);
    if (previous.length === 0) {
        return { current, trend: 0 };
    }
    const recentAvg = recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
    const previousAvg = previous.reduce((sum, item) => sum + item.score, 0) / previous.length;
    return {
        current,
        trend: Number((recentAvg - previousAvg).toFixed(2)),
    };
};
const buildSubjectProgress = (subject, fallback, index) => {
    const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
    if (!subjectName) {
        return fallback;
    }
    const detailByScheduleUuid = extractScheduleDetailMap(subject);
    const schedules = pickArray(subject, ["schedules", "schedule", "lessons"]);
    const history = [];
    const historyDedup = new Set();
    const pushScore = (raw, date, markMaxHint) => {
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
    const collectFromRecord = (record, date, markMaxHint) => {
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
    const { current, trend } = calculateCurrentAndTrendFromHistory(history);
    return {
        subject: subjectName,
        current,
        trend,
        risk: current < 4,
        history,
    };
};
const buildProfileFromDiary = (binding, subjectsPayload, fallbackProfile) => {
    const fallbackProgress = fallbackProfile?.progress ?? [];
    const fallbackBySubject = new Map(fallbackProgress.map((item) => [normalizeSubjectKey(item.subject), item]));
    const remoteProgress = subjectsPayload
        .map((subject, index) => {
        const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
        const fallbackSubject = subjectName ? fallbackBySubject.get(normalizeSubjectKey(subjectName)) ?? null : null;
        return buildSubjectProgress(subject, fallbackSubject, index);
    })
        .filter((item) => item !== null);
    const progress = mergeProgress(remoteProgress, fallbackProgress);
    return {
        studentId: binding.studentId,
        fullName: binding.fullName,
        classId: binding.classId,
        averageScore: Number((progress.length > 0
            ? averageScoreFromProgress(progress)
            : Number(fallbackProfile?.averageScore ?? 0)).toFixed(2)),
        weakSubjects: progress.length > 0 ? deriveWeakSubjects(progress) : fallbackProfile?.weakSubjects ?? [],
        progress,
    };
};
const buildProfileFromJournalGrades = (binding, grades, fallbackProfile) => {
    const bySubject = new Map();
    for (const grade of grades) {
        const key = normalizeSubjectKey(grade.subjectName);
        if (!key) {
            continue;
        }
        const markMaxHint = typeof grade.markMax === "number" && Number.isFinite(grade.markMax) ? grade.markMax : null;
        const parsedFromRaw = parseScoreCandidate(grade.scoreRaw, markMaxHint);
        const parsedScore = parsedFromRaw !== null && Number.isFinite(parsedFromRaw)
            ? parsedFromRaw
            : typeof grade.scoreFive === "number" && Number.isFinite(grade.scoreFive)
                ? normalizeToFiveScale(grade.scoreFive, 5)
                : null;
        if (parsedScore === null || !Number.isFinite(parsedScore)) {
            continue;
        }
        const subject = bySubject.get(key) ?? {
            subjectName: grade.subjectName,
            entries: [],
        };
        subject.entries.push({
            date: toIsoDate(grade.lessonDate, 0),
            score: Number(parsedScore.toFixed(2)),
        });
        bySubject.set(key, subject);
    }
    const progress = [];
    for (const subject of bySubject.values()) {
        const history = [...subject.entries]
            .sort((a, b) => +new Date(a.date) - +new Date(b.date))
            .map((item) => ({ date: item.date, score: Number(item.score.toFixed(2)) }));
        if (history.length === 0) {
            continue;
        }
        const { current, trend } = calculateCurrentAndTrendFromHistory(history);
        progress.push({
            subject: subject.subjectName,
            current,
            trend,
            risk: current < 4,
            history,
        });
    }
    if (progress.length === 0) {
        return null;
    }
    return {
        studentId: binding.studentId,
        fullName: binding.fullName,
        classId: binding.classId,
        averageScore: averageScoreFromProgress(progress),
        weakSubjects: deriveWeakSubjects(progress),
        progress: progress.sort((a, b) => a.subject.localeCompare(b.subject)),
    };
};
const enrichProfilesFromJournalCache = (profiles, config) => {
    const enriched = new Map();
    for (const profile of profiles) {
        const scopes = academicStoreService_1.academicStoreService
            .listStudentJournalScopes(profile.studentId)
            .sort((a, b) => b.lastSyncedAt.localeCompare(a.lastSyncedAt));
        let cachedGrades = [];
        for (const scope of scopes) {
            cachedGrades = academicStoreService_1.academicStoreService.listStudentJournalGrades({
                studentId: profile.studentId,
                scope: {
                    eduYear: scope.eduYear,
                    period: scope.period,
                    periodType: scope.periodType,
                },
            });
            if (cachedGrades.length > 0) {
                break;
            }
        }
        if (cachedGrades.length === 0) {
            continue;
        }
        const binding = {
            studentId: profile.studentId,
            fullName: profile.fullName,
            classId: normalizeClassId(profile.classId),
            groupId: pickMappedNumber(config.groupByStudent, profile.studentId) ?? config.defaultGroupId,
            schoolId: pickMappedNumber(config.schoolByStudent, profile.studentId) ??
                pickMappedNumber(config.schoolByClass, normalizeClassId(profile.classId)) ??
                config.schoolId,
            eduYear: scopes[0]?.eduYear ?? config.eduYear,
            period: scopes[0]?.period ?? config.period,
            periodType: scopes[0]?.periodType ?? config.periodType,
        };
        const cachedProfile = buildProfileFromJournalGrades(binding, cachedGrades, profile);
        if (cachedProfile) {
            enriched.set(profile.studentId, cachedProfile);
        }
    }
    return mergeProfiles(profiles, enriched);
};
const resolveStudentIdForJournal = (user) => {
    if (user.role === "student") {
        return (user.linkedStudentId || user.id || "").trim() || null;
    }
    if (user.role === "parent") {
        return (user.linkedStudentId || "").trim() || null;
    }
    return null;
};
const pickDeepNumberByKeys = (value, keys, depth = 0, keyMatched = false) => {
    if (depth > 4 || value == null) {
        return null;
    }
    if (keyMatched && typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (keyMatched && typeof value === "string") {
        const normalized = value.replace(",", ".").trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const parsed = pickDeepNumberByKeys(item, keys, depth + 1, keyMatched);
            if (parsed !== null) {
                return parsed;
            }
        }
        return null;
    }
    if (!isRecord(value)) {
        return null;
    }
    const normalizedKeys = new Set(keys.map((item) => item.toLowerCase()));
    for (const [entryKey, entryValue] of Object.entries(value)) {
        const parsed = pickDeepNumberByKeys(entryValue, keys, depth + 1, keyMatched || normalizedKeys.has(entryKey.toLowerCase()));
        if (parsed !== null) {
            return parsed;
        }
    }
    if (!keyMatched) {
        return null;
    }
    for (const key of keys) {
        if (key in value) {
            const parsed = pickDeepNumberByKeys(value[key], keys, depth + 1, true);
            if (parsed !== null) {
                return parsed;
            }
        }
    }
    for (const nestedValue of Object.values(value)) {
        const parsed = pickDeepNumberByKeys(nestedValue, keys, depth + 1, true);
        if (parsed !== null) {
            return parsed;
        }
    }
    return null;
};
const normalizePeriodType = (value, fallback = "quarter") => {
    const normalized = cleanString(value).toLowerCase();
    return normalized || fallback;
};
const buildJournalFilterOptions = (payload) => {
    const { selected, scopes, binding, config } = payload;
    const yearsSet = new Set();
    const periodsSet = new Set();
    const periodTypesSet = new Set();
    const pushYear = (value) => {
        if (typeof value === "number" && Number.isFinite(value) && value >= 2000 && value <= 2100) {
            yearsSet.add(Math.round(value));
        }
    };
    const pushPeriod = (value) => {
        if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 12) {
            periodsSet.add(Math.round(value));
        }
    };
    const pushPeriodType = (value) => {
        const normalized = normalizePeriodType(value, "");
        if (normalized) {
            periodTypesSet.add(normalized);
        }
    };
    pushYear(selected.eduYear);
    pushYear(binding.eduYear);
    pushYear(config.eduYear);
    pushYear(deriveAcademicYear());
    pushYear(deriveAcademicYear() + 1);
    pushYear(deriveAcademicYear() - 1);
    pushPeriod(selected.period);
    pushPeriod(binding.period);
    pushPeriod(config.period);
    pushPeriod(deriveQuarter());
    const selectedType = normalizePeriodType(selected.periodType, "quarter");
    if (selectedType === "quarter") {
        [1, 2, 3, 4].forEach((value) => pushPeriod(value));
    }
    else if (selectedType === "halfyear") {
        [1, 2].forEach((value) => pushPeriod(value));
    }
    else if (selectedType === "year") {
        pushPeriod(1);
    }
    pushPeriodType(selected.periodType);
    pushPeriodType(binding.periodType);
    pushPeriodType(config.periodType);
    pushPeriodType("quarter");
    pushPeriodType("halfyear");
    pushPeriodType("year");
    for (const scope of scopes) {
        pushYear(scope.eduYear);
        pushPeriod(scope.period);
        pushPeriodType(scope.periodType);
    }
    const years = [...yearsSet].sort((a, b) => b - a);
    const periods = [...periodsSet].sort((a, b) => a - b);
    const periodTypes = [...periodTypesSet];
    return {
        years,
        periods,
        periodTypes,
    };
};
const resolveJournalScope = (payload) => {
    const { requested, binding, config, scopes } = payload;
    const requestedPeriodType = normalizePeriodType(requested?.periodType, "");
    const periodType = requestedPeriodType ||
        normalizePeriodType(binding.periodType, "") ||
        normalizePeriodType(config.periodType, "") ||
        normalizePeriodType(scopes[0]?.periodType, "quarter");
    const firstScopeByType = scopes.find((item) => normalizePeriodType(item.periodType, "") === periodType);
    const selectedEduYear = typeof requested?.eduYear === "number" && Number.isFinite(requested.eduYear)
        ? Math.round(requested.eduYear)
        : binding.eduYear ??
            config.eduYear ??
            firstScopeByType?.eduYear ??
            deriveAcademicYear();
    const selectedPeriod = typeof requested?.period === "number" && Number.isFinite(requested.period)
        ? Math.round(requested.period)
        : binding.period ??
            config.period ??
            firstScopeByType?.period ??
            deriveQuarter();
    return {
        eduYear: selectedEduYear,
        period: selectedPeriod,
        periodType,
    };
};
const pickRawScoreValue = (value, depth = 0) => {
    if (depth > 3 || value == null) {
        return "";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === "string") {
        return value.trim();
    }
    if (!isRecord(value)) {
        return "";
    }
    const directKeys = ["mark", "score", "value", "result", "finalScore", "grade", "formattedValue", "percent"];
    for (const key of directKeys) {
        const next = pickRawScoreValue(value[key], depth + 1);
        if (next) {
            return next;
        }
    }
    const nestedKeys = ["formattedScore", "formatted", "sor", "soch", "scoreData", "assessment", "markInfo"];
    for (const key of nestedKeys) {
        const next = pickRawScoreValue(value[key], depth + 1);
        if (next) {
            return next;
        }
    }
    return "";
};
const normalizeLessonTime = (value) => {
    const raw = cleanString(value);
    if (!raw) {
        return "";
    }
    const parsed = raw.match(/^(\d{2}:\d{2})/);
    return parsed ? parsed[1] : raw;
};
const normalizeJournalMarkType = (value) => {
    const normalized = cleanString(value).toLowerCase();
    if (!normalized) {
        return "regular";
    }
    if (normalized === "sor" || normalized.includes("sor")) {
        return "sor";
    }
    if (normalized === "soch" || normalized.includes("soch")) {
        return "soch";
    }
    return "regular";
};
const extractJournalGradesFromDiary = (payload) => {
    const result = [];
    const dedupe = new Set();
    for (const [subjectIndex, subject] of payload.subjects.entries()) {
        const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
        if (!subjectName) {
            continue;
        }
        const subjectId = pickNumber(subject, ["subjectId", "id"]);
        const subjectUuid = pickString(subject, ["eduSubjectUuid", "subjectUuid", "uuid"]);
        const detailByScheduleUuid = extractScheduleDetailMap(subject);
        const schedules = pickArray(subject, ["schedules", "schedule", "lessons"]);
        for (const [scheduleIndex, rawSchedule] of schedules.entries()) {
            if (!isRecord(rawSchedule)) {
                continue;
            }
            const scheduleUuid = pickString(rawSchedule, ["uuid", "id", "scheduleUuid"]);
            const detail = scheduleUuid ? detailByScheduleUuid.get(scheduleUuid) : undefined;
            const lessonDate = toIsoDate(rawSchedule.date ?? rawSchedule.lessonDate ?? rawSchedule.scheduleDate, scheduleIndex);
            const lessonTime = normalizeLessonTime(rawSchedule.timeStart ?? rawSchedule.lessonTime ?? rawSchedule.time);
            const rawMarkType = pickString(rawSchedule, ["type", "markType"]) ||
                pickString(detail ?? {}, ["markType"]) ||
                pickString(isRecord(detail?.formattedScore) ? detail.formattedScore : {}, ["markType"]);
            const markType = normalizeJournalMarkType(rawMarkType);
            const markMax = pickNumber(rawSchedule, ["markMax", "maxMark", "max_score", "max"]) ??
                pickNumber(detail ?? {}, ["markMax", "maxMark", "max_score", "max"]);
            const scoreRaw = pickRawScoreValue(detail) || pickRawScoreValue(rawSchedule);
            const parsedScore = parseScoreCandidate(scoreRaw || detail || rawSchedule, markMax);
            const rawPoints = pickDeepNumberByKeys(detail, ["mark", "score", "value", "result", "grade"]) ??
                pickDeepNumberByKeys(rawSchedule, ["mark", "score", "value", "result", "grade"]);
            let normalizedRaw = scoreRaw || (parsedScore !== null ? String(Number(parsedScore.toFixed(2))) : "");
            if (!normalizedRaw && (markType === "sor" || markType === "soch")) {
                if (rawPoints !== null && markMax !== null && markMax > 0) {
                    normalizedRaw = `${Number(rawPoints.toFixed(2))}/${Number(markMax.toFixed(0))}`;
                }
            }
            if (!normalizedRaw && parsedScore === null) {
                continue;
            }
            const dedupeKey = [
                payload.studentId,
                payload.scope.eduYear,
                payload.scope.period,
                payload.scope.periodType,
                subjectUuid || subjectName,
                scheduleUuid || `idx-${subjectIndex}-${scheduleIndex}`,
                lessonDate,
                lessonTime,
                markType || undefined,
                normalizedRaw,
            ].join("|");
            if (dedupe.has(dedupeKey)) {
                continue;
            }
            dedupe.add(dedupeKey);
            result.push({
                id: dedupeKey,
                studentId: payload.studentId,
                eduYear: payload.scope.eduYear,
                period: payload.scope.period,
                periodType: payload.scope.periodType,
                subjectId: subjectId !== null ? Math.round(subjectId) : undefined,
                subjectUuid: subjectUuid || undefined,
                subjectName,
                scheduleUuid: scheduleUuid || undefined,
                lessonDate,
                lessonTime: lessonTime || undefined,
                markType: markType || undefined,
                markMax: markMax !== null ? Number(markMax.toFixed(2)) : undefined,
                scoreRaw: normalizedRaw,
                scoreFive: parsedScore !== null ? Number(parsedScore.toFixed(2)) : undefined,
                syncedAt: payload.syncedAt,
            });
        }
        if (!result.some((item) => normalizeSubjectKey(item.subjectName) === normalizeSubjectKey(subjectName))) {
            const finalScoreRaw = pickRawScoreValue(subject.finalScore);
            const finalScoreParsed = parseScoreCandidate(subject.finalScore, pickNumber(subject, ["markMax", "maxMark"]));
            if (finalScoreRaw || finalScoreParsed !== null) {
                const fallbackKey = [
                    payload.studentId,
                    payload.scope.eduYear,
                    payload.scope.period,
                    payload.scope.periodType,
                    subjectUuid || subjectName,
                    "final",
                    finalScoreRaw || (finalScoreParsed !== null ? String(finalScoreParsed) : ""),
                ].join("|");
                if (!dedupe.has(fallbackKey)) {
                    dedupe.add(fallbackKey);
                    result.push({
                        id: fallbackKey,
                        studentId: payload.studentId,
                        eduYear: payload.scope.eduYear,
                        period: payload.scope.period,
                        periodType: payload.scope.periodType,
                        subjectId: subjectId !== null ? Math.round(subjectId) : undefined,
                        subjectUuid: subjectUuid || undefined,
                        subjectName,
                        lessonDate: new Date().toISOString().slice(0, 10),
                        scoreRaw: finalScoreRaw || (finalScoreParsed !== null ? String(finalScoreParsed) : ""),
                        scoreFive: finalScoreParsed !== null ? Number(finalScoreParsed.toFixed(2)) : undefined,
                        syncedAt: payload.syncedAt,
                    });
                }
            }
        }
    }
    return result.sort((a, b) => a.subjectName.localeCompare(b.subjectName) ||
        a.lessonDate.localeCompare(b.lessonDate) ||
        (a.lessonTime || "").localeCompare(b.lessonTime || ""));
};
const buildJournalSubjectsView = (grades, finalMarkByUuid, finalMarkByName) => {
    const bySubject = new Map();
    for (const grade of grades) {
        const key = normalizeSubjectKey(grade.subjectName);
        if (!key) {
            continue;
        }
        const existing = bySubject.get(key) ?? {
            subjectId: typeof grade.subjectId === "number" ? grade.subjectId : null,
            subjectUuid: grade.subjectUuid ?? null,
            subjectName: grade.subjectName,
            gradesCount: 0,
            totalScore: 0,
            scoredCount: 0,
        };
        existing.gradesCount += 1;
        const markMaxHint = typeof grade.markMax === "number" && Number.isFinite(grade.markMax) ? grade.markMax : null;
        const parsedFromRaw = parseScoreCandidate(grade.scoreRaw, markMaxHint);
        const normalizedScore = parsedFromRaw !== null && Number.isFinite(parsedFromRaw)
            ? parsedFromRaw
            : typeof grade.scoreFive === "number" && Number.isFinite(grade.scoreFive)
                ? normalizeToFiveScale(grade.scoreFive, 5)
                : null;
        if (normalizedScore !== null) {
            existing.totalScore += normalizedScore;
            existing.scoredCount += 1;
        }
        bySubject.set(key, existing);
    }
    return [...bySubject.values()]
        .map((item) => ({
        subjectId: item.subjectId,
        subjectUuid: item.subjectUuid,
        subjectName: item.subjectName,
        averageScore: item.scoredCount > 0 ? Number((item.totalScore / item.scoredCount).toFixed(2)) : null,
        gradesCount: item.gradesCount,
        finalMark: (item.subjectUuid ? finalMarkByUuid.get(item.subjectUuid) : undefined) ??
            finalMarkByName.get(normalizeSubjectKey(item.subjectName)) ??
            null,
    }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
};
const resolveJournalBindingForUser = (user, config, profiles) => {
    const studentId = resolveStudentIdForJournal(user);
    if (!studentId || (user.role !== "student" && user.role !== "parent")) {
        return null;
    }
    const profile = profiles.find((item) => item.studentId === studentId);
    const classId = normalizeClassId(user.classId || profile?.classId || "-");
    const userBinding = storageService_1.storageService.getBilimBinding(user.id);
    const linkedAccounts = storageService_1.storageService.listBilimLinkedUsers();
    const groupId = userBinding?.groupId ??
        pickMappedNumber(config.groupByStudent, studentId) ??
        pickMappedNumber(config.groupByClass, classId) ??
        config.defaultGroupId;
    const schoolId = userBinding?.schoolId ??
        pickMappedNumber(config.schoolByStudent, studentId) ??
        pickMappedNumber(config.schoolByClass, classId) ??
        config.schoolId;
    const binding = {
        studentId,
        fullName: profile?.fullName || user.name || studentId,
        classId,
        groupId,
        schoolId,
        eduYear: userBinding?.eduYear ?? config.eduYear,
        period: userBinding?.period ?? config.period,
        periodType: normalizePeriodType(userBinding?.periodType, normalizePeriodType(config.periodType, "quarter")),
    };
    let credentials = null;
    if (userBinding?.linked && userBinding.login) {
        const ownLinkedAccount = linkedAccounts.find((item) => item.userId === user.id);
        credentials = {
            login: userBinding.login,
            password: ownLinkedAccount?.password || "",
        };
    }
    else if (user.role === "parent") {
        const studentLinkedAccount = linkedAccounts.find((item) => item.role === "student" && item.userId === studentId);
        if (studentLinkedAccount) {
            credentials = {
                login: studentLinkedAccount.login,
                password: studentLinkedAccount.password,
            };
        }
    }
    if (credentials && !credentials.password.trim()) {
        credentials = null;
    }
    return {
        studentId,
        role: user.role,
        binding,
        credentials,
    };
};
const parseExpiration = (value) => {
    const asNumber = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
        return null;
    }
    if (asNumber > 9_999_999_999) {
        return Math.floor(asNumber / 1000);
    }
    return Math.floor(asNumber);
};
const extractAuthResponse = (payload) => {
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
const extractAccountName = (payload) => {
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
const buildRuntimeBindings = (baseProfiles, config) => {
    const byStudent = new Map();
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
        const merged = {
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
    const result = [];
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
const getConfig = () => {
    const useRealValue = process.env.USE_REAL_BILIMCLASS?.trim().toLowerCase();
    const useLive = useRealValue === undefined || useRealValue === "" || useRealValue === "true";
    const allowFallbackValue = process.env.BILIMCLASS_ALLOW_SEED_FALLBACK?.trim().toLowerCase();
    const allowSeedFallback = allowFallbackValue === undefined ||
        allowFallbackValue === "" ||
        allowFallbackValue === "1" ||
        allowFallbackValue === "true" ||
        allowFallbackValue === "yes";
    const timeoutRaw = Number(process.env.BILIMCLASS_TIMEOUT_MS ?? 10000);
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000;
    const baseUrl = trimSlashes(process.env.BILIMCLASS_BASE_URL?.trim() ?? "https://api.bilimclass.kz");
    const loginPath = normalizePath(process.env.BILIMCLASS_LOGIN_PATH ?? "/api/v2/os/login");
    const diarySubjectsPath = normalizePath(process.env.BILIMCLASS_DIARY_SUBJECTS_PATH ?? "/api/v4/os/clientoffice/diary/subjects");
    const diaryWeeksPath = normalizePath(process.env.BILIMCLASS_DIARY_WEEKS_PATH ?? "/api/v4/os/clientoffice/diary/weeks");
    const groupListPath = normalizePath(process.env.BILIMCLASS_GROUP_LIST_PATH ?? "/api/v4/os/clientoffice/group-list");
    const journalServiceUrl = trimSlashes(process.env.BILIMCLASS_JOURNAL_SERVICE_URL?.trim() ?? "https://journal-service.bilimclass.kz");
    const journalServiceLegacyUrl = trimSlashes(process.env.BILIMCLASS_JOURNAL_SERVICE_LEGACY_URL?.trim() ?? journalServiceUrl);
    const loginPayloadParsed = parseJson(process.env.BILIMCLASS_LOGIN_PAYLOAD_JSON);
    const loginPayload = isRecord(loginPayloadParsed) && Object.keys(loginPayloadParsed).length > 0 ? loginPayloadParsed : null;
    return {
        useLive,
        allowSeedFallback,
        baseUrl,
        timeoutMs,
        staticToken: cleanString(process.env.BILIMCLASS_TOKEN),
        loginPath,
        diarySubjectsPath,
        diaryWeeksPath,
        groupListPath,
        journalServiceUrl,
        journalServiceLegacyUrl,
        loginValue: cleanString(process.env.BILIMCLASS_LOGIN),
        passwordValue: cleanString(process.env.BILIMCLASS_PASSWORD),
        loginPayload,
        loginHeaders: withDefaultBilimHeaders(parseHeadersRecord(process.env.BILIMCLASS_LOGIN_HEADERS_JSON)),
        requestHeaders: withDefaultBilimHeaders(parseHeadersRecord(process.env.BILIMCLASS_REQUEST_HEADERS_JSON)),
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
const extractGroupIds = (payload) => {
    const result = [];
    const push = (value) => pushUniqueNumber(result, value, (candidate) => candidate > 1000);
    const walk = (value, depth) => {
        if (depth > 6 || value == null) {
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                walk(item, depth + 1);
            }
            return;
        }
        if (!isRecord(value)) {
            return;
        }
        for (const [rawKey, rawValue] of Object.entries(value)) {
            const key = rawKey.toLowerCase().replace(/[\s_-]/g, "");
            if (["groupid", "idgroup", "educlassid", "classid", "value", "id"].includes(key)) {
                push(rawValue);
            }
            walk(rawValue, depth + 1);
        }
    };
    walk(payload, 0);
    return result;
};
const fetchGroupIds = async (config, auth, schoolId, eduYear) => {
    try {
        const response = await axios_1.default.get(`${config.baseUrl}${config.groupListPath}`, {
            timeout: config.timeoutMs,
            params: {
                schoolId,
                eduYear,
            },
            headers: {
                Authorization: `Bearer ${auth.accessToken}`,
                ...(auth.hash ? { Hash: auth.hash, "x-hash": auth.hash } : {}),
                ...config.requestHeaders,
            },
        });
        return extractGroupIds(response.data);
    }
    catch {
        return [];
    }
};
const buildAuthCacheKey = (config, credentials) => {
    if (config.staticToken && !credentials) {
        return `static:${config.staticToken}`;
    }
    if (credentials) {
        return `user:${credentials.login.toLowerCase()}|${credentials.password}`;
    }
    return `default:${config.loginValue.toLowerCase()}|${config.passwordValue}`;
};
const ensureAuth = async (config, credentials) => {
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
        const response = await axios_1.default.post(`${config.baseUrl}${config.loginPath}`, loginPayload, {
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
        const userInfoHints = extractHintsFromAuthUserInfo(response.data);
        const payloadHints = extractHintsFromPayload(response.data);
        const tokenHints = extractHintsFromPayload(decodeJwtPayload(auth.accessToken));
        authHintsByKey.set(cacheKey, mergeAuthHints(userInfoHints, payloadHints, tokenHints));
        authRuntimeByKey.set(cacheKey, extractAuthRuntime(response.data));
        return { auth, cacheKey };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "BilimClass login failed";
        lastError = `BilimClass login failed: ${message}`;
        return null;
    }
};
const fetchDiarySubjects = async (config, auth, binding) => {
    if (!binding.groupId || !binding.schoolId || !binding.eduYear || !binding.period || !binding.periodType) {
        return null;
    }
    try {
        const response = await axios_1.default.get(`${config.baseUrl}${config.diarySubjectsPath}`, {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "BilimClass diary request failed";
        lastError = `BilimClass diary request failed for groupId=${binding.groupId}: ${message}`;
        return null;
    }
};
const resolveJournalServiceBaseUrl = (config, eduYear) => {
    if (eduYear < 2025 && config.journalServiceLegacyUrl) {
        return config.journalServiceLegacyUrl;
    }
    return config.journalServiceUrl;
};
const extractDiaryWeekDates = (payload) => {
    const result = [];
    const pushDate = (candidate) => {
        const raw = cleanString(candidate);
        if (!raw) {
            return;
        }
        let normalized = "";
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
            const [dayRaw, monthRaw, yearRaw] = raw.split(".");
            const day = Number(dayRaw);
            const month = Number(monthRaw);
            const year = Number(yearRaw);
            if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
                const parsed = new Date(Date.UTC(year, month - 1, day));
                if (!Number.isNaN(parsed.getTime())) {
                    normalized = parsed.toISOString().slice(0, 10);
                }
            }
        }
        else {
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) {
                normalized = parsed.toISOString().slice(0, 10);
            }
        }
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    };
    if (!isRecord(payload)) {
        return result;
    }
    const data = isRecord(payload.data) ? payload.data : payload;
    const weeks = pickArray(data, ["weeks"]);
    for (const item of weeks) {
        if (!isRecord(item)) {
            continue;
        }
        const value = pickString(item, ["value", "date", "week"]);
        if (value) {
            pushDate(value);
        }
    }
    const currentWeek = pickString(data, ["week"]);
    if (currentWeek) {
        pushDate(currentWeek);
    }
    return result.sort((a, b) => a.localeCompare(b));
};
const fetchDiaryWeekDates = async (payload) => {
    const { config, auth, binding, scope } = payload;
    if (!binding.schoolId) {
        return [];
    }
    try {
        const response = await axios_1.default.get(`${config.baseUrl}${config.diaryWeeksPath}`, {
            timeout: config.timeoutMs,
            params: {
                schoolId: binding.schoolId,
                eduYear: scope.eduYear,
                period: scope.period,
            },
            headers: {
                Authorization: `Bearer ${auth.accessToken}`,
                ...(auth.hash ? { Hash: auth.hash, "x-hash": auth.hash } : {}),
                ...config.requestHeaders,
            },
        });
        return extractDiaryWeekDates(response.data);
    }
    catch {
        return [];
    }
};
const extractScheduleMetaFromDiarySubjects = (subjects) => {
    const byScheduleUuid = new Map();
    const dedupe = new Set();
    for (const subject of subjects) {
        const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
        const subjectId = pickNumber(subject, ["subjectId", "id"]);
        const subjectUuid = pickString(subject, ["eduSubjectUuid", "subjectUuid", "uuid"]) || null;
        const schedules = pickArray(subject, ["schedules", "schedule", "lessons"]);
        for (const [index, rawSchedule] of schedules.entries()) {
            if (!isRecord(rawSchedule)) {
                continue;
            }
            const scheduleUuid = normalizeUuid(pickString(rawSchedule, ["uuid", "id", "scheduleUuid"]));
            if (!scheduleUuid) {
                continue;
            }
            const lessonDate = toIsoDate(rawSchedule.date ?? rawSchedule.lessonDate ?? rawSchedule.scheduleDate, index);
            const lessonTime = normalizeLessonTime(rawSchedule.timeStart ?? rawSchedule.lessonTime ?? rawSchedule.time);
            const markType = normalizeJournalMarkType(rawSchedule.type ?? rawSchedule.markType);
            const markMax = pickNumber(rawSchedule, ["markMax", "maxMark", "max_score", "max"]);
            const rowKey = [
                scheduleUuid,
                lessonDate,
                lessonTime,
                markType,
                markMax === null ? "null" : String(markMax),
            ].join("|");
            if (dedupe.has(rowKey)) {
                continue;
            }
            dedupe.add(rowKey);
            const list = byScheduleUuid.get(scheduleUuid) ?? [];
            list.push({
                subjectName,
                subjectId: subjectId !== null ? Math.round(subjectId) : null,
                subjectUuid: subjectUuid || null,
                scheduleUuid,
                lessonDate,
                lessonTime,
                markType,
                markMax,
            });
            byScheduleUuid.set(scheduleUuid, list);
        }
    }
    return byScheduleUuid;
};
const extractJournalServiceMap = (payload) => {
    const byScheduleUuid = new Map();
    const source = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(source)) {
        return byScheduleUuid;
    }
    for (const [rawKey, rawValue] of Object.entries(source)) {
        const scheduleUuid = normalizeUuid(rawKey);
        if (!scheduleUuid || !isRecord(rawValue)) {
            continue;
        }
        byScheduleUuid.set(scheduleUuid, rawValue);
    }
    return byScheduleUuid;
};
const calculateJournalDetailStrength = (detail) => {
    let strength = 0;
    for (const key of ["formattedScore", "sor", "soch"]) {
        const entry = detail[key];
        if (!isRecord(entry)) {
            continue;
        }
        const mark = pickDeepNumberByKeys(entry, ["mark", "score", "value", "result", "grade"]);
        if (mark !== null) {
            strength += 2;
        }
        const max = pickNumber(entry, ["markMax", "maxMark", "max"]);
        if (max !== null) {
            strength += 1;
        }
    }
    return strength;
};
const fetchJournalServiceScoresForScope = async (payload) => {
    const { config, auth, authRuntime, binding, scope } = payload;
    const result = new Map();
    if (!authRuntime.chatToken || !authRuntime.userId) {
        return result;
    }
    const studentGroupUuids = authRuntime.studentGroupUuids.slice(0, 6);
    if (studentGroupUuids.length === 0 && authRuntime.studentGroupUuid) {
        studentGroupUuids.push(authRuntime.studentGroupUuid);
    }
    if (studentGroupUuids.length === 0) {
        return result;
    }
    const weekDates = await fetchDiaryWeekDates({
        config,
        auth,
        binding,
        scope,
    });
    if (weekDates.length === 0) {
        return result;
    }
    const baseUrl = resolveJournalServiceBaseUrl(config, scope.eduYear);
    for (const weekDate of weekDates.slice(0, 20)) {
        const requests = studentGroupUuids.map(async (studentGroupUuid) => {
            try {
                const response = await axios_1.default.get(`${baseUrl}/diary`, {
                    timeout: config.timeoutMs,
                    params: {
                        userId: authRuntime.userId,
                        studentGroupUuid,
                        date: weekDate,
                    },
                    headers: {
                        Authorization: `Bearer ${authRuntime.chatToken}`,
                        external: "1",
                        ...config.requestHeaders,
                    },
                });
                return extractJournalServiceMap(response.data);
            }
            catch {
                return new Map();
            }
        });
        const weekMaps = await Promise.all(requests);
        for (const map of weekMaps) {
            for (const [scheduleUuid, detail] of map.entries()) {
                const existing = result.get(scheduleUuid);
                if (!existing) {
                    result.set(scheduleUuid, detail);
                    continue;
                }
                const existingStrength = calculateJournalDetailStrength(existing);
                const nextStrength = calculateJournalDetailStrength(detail);
                if (nextStrength > existingStrength) {
                    result.set(scheduleUuid, detail);
                }
            }
        }
    }
    return result;
};
const pickJournalMarkRecordByType = (detail, markType) => {
    if (!detail) {
        return null;
    }
    const formatted = isRecord(detail.formattedScore) ? detail.formattedScore : null;
    const sor = isRecord(detail.sor) ? detail.sor : null;
    const soch = isRecord(detail.soch) ? detail.soch : null;
    if (markType === "sor") {
        return sor ?? formatted ?? soch;
    }
    if (markType === "soch") {
        return soch ?? formatted ?? sor;
    }
    return formatted ?? sor ?? soch;
};
const formatMarkNumber = (value) => {
    if (!Number.isFinite(value)) {
        return "";
    }
    const normalized = Math.abs(value % 1) < 0.000001 ? Math.round(value) : Number(value.toFixed(2));
    return String(normalized);
};
const buildJournalGradesFromLiveSources = (payload) => {
    const result = [];
    const dedupe = new Set();
    for (const [scheduleUuid, metas] of payload.scheduleMetaByUuid.entries()) {
        const detail = payload.journalDetailsByUuid.get(scheduleUuid);
        for (const [metaIndex, meta] of metas.entries()) {
            const markRecord = pickJournalMarkRecordByType(detail, meta.markType);
            const markMax = (markRecord ? pickNumber(markRecord, ["markMax", "maxMark", "max_score", "max"]) : null) ??
                meta.markMax;
            const markValue = (markRecord ? pickDeepNumberByKeys(markRecord, ["mark", "score", "value", "result", "grade"]) : null) ??
                (detail ? pickDeepNumberByKeys(detail, ["mark", "score", "value", "result", "grade"]) : null);
            const rawFromMarkRecord = pickRawScoreValue(markRecord);
            let scoreRaw = rawFromMarkRecord;
            if (meta.markType === "sor" || meta.markType === "soch") {
                if (markValue !== null && markMax !== null && markMax > 0) {
                    scoreRaw = `${formatMarkNumber(markValue)}/${formatMarkNumber(markMax)}`;
                }
                else if (markValue !== null) {
                    scoreRaw = formatMarkNumber(markValue);
                }
            }
            else if (markValue !== null) {
                scoreRaw =
                    markMax !== null && markMax > 0 && (markMax > 10 || markValue > 10)
                        ? `${formatMarkNumber(markValue)}/${formatMarkNumber(markMax)}`
                        : formatMarkNumber(markValue);
            }
            const scoreFive = parseScoreCandidate(markRecord ?? detail ?? scoreRaw, markMax !== null && Number.isFinite(markMax) ? markMax : null);
            if (!scoreRaw && scoreFive === null) {
                continue;
            }
            const lessonDate = toIsoDate(markRecord?.date ?? meta.lessonDate, metaIndex);
            const lessonTime = normalizeLessonTime(markRecord?.time ?? markRecord?.timeStart ?? meta.lessonTime);
            const subjectIdFromMark = markRecord ? pickNumber(markRecord, ["subjectId", "subject_id"]) : null;
            const dedupeKey = [
                payload.studentId,
                payload.scope.eduYear,
                payload.scope.period,
                payload.scope.periodType,
                meta.subjectUuid || meta.subjectName,
                scheduleUuid,
                lessonDate,
                lessonTime,
                meta.markType,
                scoreRaw || "empty",
            ].join("|");
            if (dedupe.has(dedupeKey)) {
                continue;
            }
            dedupe.add(dedupeKey);
            result.push({
                id: dedupeKey,
                studentId: payload.studentId,
                eduYear: payload.scope.eduYear,
                period: payload.scope.period,
                periodType: payload.scope.periodType,
                subjectId: subjectIdFromMark !== null
                    ? Math.round(subjectIdFromMark)
                    : meta.subjectId !== null
                        ? meta.subjectId
                        : undefined,
                subjectUuid: meta.subjectUuid ?? undefined,
                subjectName: meta.subjectName,
                scheduleUuid,
                lessonDate,
                lessonTime: lessonTime || undefined,
                markType: meta.markType || undefined,
                markMax: markMax !== null ? Number(markMax.toFixed(2)) : undefined,
                scoreRaw: scoreRaw || "-",
                scoreFive: scoreFive !== null ? Number(scoreFive.toFixed(2)) : undefined,
                syncedAt: payload.syncedAt,
            });
        }
    }
    return result.sort((a, b) => a.subjectName.localeCompare(b.subjectName) ||
        a.lessonDate.localeCompare(b.lessonDate) ||
        (a.lessonTime || "").localeCompare(b.lessonTime || ""));
};
const fetchAttestationMarks = async (config, auth, binding) => {
    if (!binding.groupId || !binding.schoolId || !binding.eduYear || !binding.period || !binding.periodType) {
        return null;
    }
    try {
        const response = await axios_1.default.get(`${config.baseUrl}/api/v4/os/clientoffice/attestation`, {
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
        return extractAttestationItems(response.data);
    }
    catch {
        return null;
    }
};
const resolveBindingFromLinkedAccount = (account, config, fallbackByStudent) => {
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
const buildBindingsFromLinkedAccounts = (fallbackProfiles, config) => {
    const fallbackByStudent = new Map(fallbackProfiles.map((item) => [item.studentId, item]));
    const linkedAccounts = storageService_1.storageService.listBilimLinkedUsers();
    const result = [];
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
const syncProfilesForBindings = async (config, fallbackProfiles, bindings) => {
    const fallbackByStudent = new Map(fallbackProfiles.map((item) => [item.studentId, item]));
    const profileByStudent = new Map();
    const requestCache = new Map();
    const groupListCache = new Map();
    const getSubjectsForBinding = (binding, auth, credentials) => {
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
    const getGroupIdsForSchool = (authContextKey, auth, schoolId, eduYear) => {
        const cacheKey = `${authContextKey}|school:${schoolId}|year:${eduYear}`;
        const existing = groupListCache.get(cacheKey);
        if (existing) {
            return existing;
        }
        const request = fetchGroupIds(config, auth, schoolId, eduYear);
        groupListCache.set(cacheKey, request);
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
        const discoverySchoolIds = [];
        pushUniqueNumber(discoverySchoolIds, item.binding.schoolId);
        for (const value of hints.schoolIds) {
            pushUniqueNumber(discoverySchoolIds, value);
        }
        for (const value of collectKnownSchoolIds(config)) {
            pushUniqueNumber(discoverySchoolIds, value);
        }
        const discoveryEduYears = [];
        pushUniqueNumber(discoveryEduYears, item.binding.eduYear, (value) => value >= 2000 && value <= 2100);
        for (const value of hints.eduYears) {
            pushUniqueNumber(discoveryEduYears, value, (candidate) => candidate >= 2000 && candidate <= 2100);
        }
        pushUniqueNumber(discoveryEduYears, config.eduYear, (value) => value >= 2000 && value <= 2100);
        pushUniqueNumber(discoveryEduYears, deriveAcademicYear(), (value) => value >= 2000 && value <= 2100);
        if (hints.groupIds.length === 0 && discoverySchoolIds.length > 0 && discoveryEduYears.length > 0) {
            for (const schoolId of discoverySchoolIds.slice(0, 6)) {
                for (const eduYear of discoveryEduYears.slice(0, 4)) {
                    const discovered = await getGroupIdsForSchool(authContext.cacheKey, authContext.auth, schoolId, eduYear);
                    for (const groupId of discovered) {
                        pushUniqueNumber(hints.groupIds, groupId);
                    }
                }
            }
        }
        const candidates = buildBindingCandidates(item.binding, config, hints);
        if (candidates.length === 0) {
            continue;
        }
        let resolvedBinding = null;
        let subjects = null;
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
        const scope = {
            eduYear: resolvedBinding.eduYear ?? config.eduYear ?? deriveAcademicYear(),
            period: resolvedBinding.period ?? config.period ?? deriveQuarter(),
            periodType: normalizePeriodType(resolvedBinding.periodType, normalizePeriodType(config.periodType, "quarter")),
        };
        const syncedAt = new Date().toISOString();
        const authRuntime = authRuntimeByKey.get(authContext.cacheKey) ??
            {
                chatToken: null,
                userId: null,
                studentGroupUuid: null,
                studentGroupUuids: [],
            };
        const scheduleMetaByUuid = extractScheduleMetaFromDiarySubjects(subjects);
        const journalDetailsByUuid = await fetchJournalServiceScoresForScope({
            config,
            auth: authContext.auth,
            authRuntime,
            binding: resolvedBinding,
            scope,
        });
        const liveJournalGrades = buildJournalGradesFromLiveSources({
            studentId: item.binding.studentId,
            scope,
            syncedAt,
            scheduleMetaByUuid,
            journalDetailsByUuid,
        });
        const diaryDerivedGrades = liveJournalGrades.length > 0
            ? liveJournalGrades
            : extractJournalGradesFromDiary({
                studentId: item.binding.studentId,
                scope,
                syncedAt,
                subjects,
            });
        if (diaryDerivedGrades.length > 0) {
            academicStoreService_1.academicStoreService.replaceStudentJournalGrades({
                studentId: item.binding.studentId,
                scope,
                grades: diaryDerivedGrades,
            });
        }
        const profileFromJournal = buildProfileFromJournalGrades(resolvedBinding, diaryDerivedGrades, fallbackProfile);
        const profile = profileFromJournal ??
            buildProfileFromDiary(resolvedBinding, subjects, fallbackProfile);
        profileByStudent.set(profile.studentId, profile);
    }
    return profileByStudent;
};
const mergeProfiles = (fallbackProfiles, ...sources) => {
    const mergedByStudent = new Map();
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
const collectUniqueSubjectsFromProfiles = (profiles, classId) => {
    const targetClassId = classId ? normalizeClassId(classId) : null;
    const unique = new Map();
    for (const profile of profiles) {
        if (targetClassId && normalizeClassId(profile.classId) !== targetClassId) {
            continue;
        }
        for (const item of profile.progress) {
            const subjectName = cleanString(item.subject);
            if (!subjectName) {
                continue;
            }
            const key = normalizeSubjectKey(subjectName);
            if (!unique.has(key)) {
                unique.set(key, subjectName);
            }
        }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
};
const collectSubjectNamesFromDiaryPayload = (subjectsPayload) => {
    const unique = new Map();
    for (const subject of subjectsPayload) {
        const subjectName = pickString(subject, ["subjectName", "name", "title", "subject"]);
        if (!subjectName) {
            continue;
        }
        const key = normalizeSubjectKey(subjectName);
        if (!unique.has(key)) {
            unique.set(key, subjectName);
        }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
};
const syncLiveProfiles = async (config, fallbackProfiles) => {
    const linkedBindings = buildBindingsFromLinkedAccounts(fallbackProfiles, config);
    const linkedProfiles = await syncProfilesForBindings(config, fallbackProfiles, linkedBindings);
    if (linkedProfiles.size === 0) {
        lastError = "BilimClass sync returned no subject data for configured students";
        return null;
    }
    return mergeProfiles(fallbackProfiles, linkedProfiles);
};
const fetchLiveJournalGrades = async (payload) => {
    const authContext = await ensureAuth(payload.config, payload.credentials);
    if (!authContext) {
        return null;
    }
    const authRuntime = authRuntimeByKey.get(authContext.cacheKey) ??
        {
            chatToken: null,
            userId: null,
            studentGroupUuid: null,
            studentGroupUuids: [],
        };
    const hints = authHintsByKey.get(authContext.cacheKey) ?? {
        schoolIds: [],
        groupIds: [],
        eduYears: [],
        periods: [],
        periodTypes: [],
    };
    const schoolDiscoveryCandidates = [];
    pushUniqueNumber(schoolDiscoveryCandidates, payload.binding.schoolId);
    for (const schoolId of hints.schoolIds) {
        pushUniqueNumber(schoolDiscoveryCandidates, schoolId);
    }
    for (const schoolId of collectKnownSchoolIds(payload.config)) {
        pushUniqueNumber(schoolDiscoveryCandidates, schoolId);
    }
    if (hints.groupIds.length === 0) {
        for (const schoolId of schoolDiscoveryCandidates.slice(0, 6)) {
            const discovered = await fetchGroupIds(payload.config, authContext.auth, schoolId, payload.scope.eduYear);
            for (const groupId of discovered) {
                pushUniqueNumber(hints.groupIds, groupId);
            }
        }
    }
    const bindingSeed = {
        ...payload.binding,
        eduYear: payload.scope.eduYear,
        period: payload.scope.period,
        periodType: payload.scope.periodType,
    };
    const candidates = buildBindingCandidates(bindingSeed, payload.config, hints)
        .filter((item) => item.eduYear === payload.scope.eduYear &&
        item.period === payload.scope.period &&
        normalizePeriodType(item.periodType, "") === normalizePeriodType(payload.scope.periodType, ""))
        .slice(0, 64);
    for (const candidate of candidates) {
        const subjects = await fetchDiarySubjects(payload.config, authContext.auth, candidate);
        if (!subjects || subjects.length === 0) {
            continue;
        }
        const scheduleMetaByUuid = extractScheduleMetaFromDiarySubjects(subjects);
        const journalDetailsByUuid = await fetchJournalServiceScoresForScope({
            config: payload.config,
            auth: authContext.auth,
            authRuntime,
            binding: candidate,
            scope: payload.scope,
        });
        const grades = buildJournalGradesFromLiveSources({
            studentId: payload.binding.studentId,
            scope: payload.scope,
            syncedAt: payload.syncedAt,
            scheduleMetaByUuid,
            journalDetailsByUuid,
        });
        const fallbackGrades = grades.length > 0
            ? grades
            : extractJournalGradesFromDiary({
                studentId: payload.binding.studentId,
                scope: payload.scope,
                syncedAt: payload.syncedAt,
                subjects,
            });
        return {
            grades: fallbackGrades,
            resolvedBinding: candidate,
            diaryFinalMarks: extractFinalMarksFromDiarySubjects(subjects),
        };
    }
    return null;
};
exports.bilimClassService = {
    async verifyCredentials(login, password) {
        const config = getConfig();
        if (!config.baseUrl || !config.loginPath) {
            return {
                ok: false,
                accountName: null,
                error: "BilimClass endpoint is not configured",
            };
        }
        try {
            const response = await axios_1.default.post(`${config.baseUrl}${config.loginPath}`, resolveLoginPayload(config, login, password), {
                timeout: config.timeoutMs,
                headers: {
                    "Content-Type": "application/json",
                    ...config.loginHeaders,
                },
            });
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "BilimClass login failed";
            return {
                ok: false,
                accountName: null,
                error: message,
            };
        }
    },
    async getStudentJournal(user, requestedScope, requestedLang = "ru") {
        if (user.role !== "student" && user.role !== "parent") {
            throw new Error("Journal is available only for student and parent roles");
        }
        const config = getConfig();
        const profiles = academicStoreService_1.academicStoreService.listStudentProfiles();
        const context = resolveJournalBindingForUser(user, config, profiles);
        const fallbackBinding = context?.binding ?? {
            studentId: resolveStudentIdForJournal(user) ?? "",
            fullName: user.name,
            classId: normalizeClassId(user.classId || "-"),
            groupId: config.defaultGroupId,
            schoolId: config.schoolId,
            eduYear: config.eduYear,
            period: config.period,
            periodType: normalizePeriodType(config.periodType, "quarter"),
        };
        const scopeList = fallbackBinding.studentId
            ? academicStoreService_1.academicStoreService.listStudentJournalScopes(fallbackBinding.studentId)
            : [];
        let selected = resolveJournalScope({
            requested: requestedScope,
            binding: fallbackBinding,
            config,
            scopes: scopeList,
        });
        let source = "empty";
        let grades = [];
        const finalMarkByUuid = new Map();
        const finalMarkByName = new Map();
        if (context && config.useLive && context.credentials) {
            const liveSyncedAt = new Date().toISOString();
            const liveResult = await fetchLiveJournalGrades({
                config,
                binding: context.binding,
                credentials: context.credentials,
                scope: selected,
                syncedAt: liveSyncedAt,
            });
            if (liveResult && liveResult.grades.length > 0) {
                for (const item of liveResult.diaryFinalMarks) {
                    if (item.subjectUuid) {
                        finalMarkByUuid.set(item.subjectUuid, item.finalMark);
                    }
                    if (item.subjectName) {
                        finalMarkByName.set(normalizeSubjectKey(item.subjectName), item.finalMark);
                    }
                }
                const authContext = await ensureAuth(config, context.credentials);
                if (authContext) {
                    const attestation = await fetchAttestationMarks(config, authContext.auth, liveResult.resolvedBinding);
                    if (attestation) {
                        for (const item of attestation) {
                            const finalMark = item.mark || item.recommendedMark || "";
                            if (!finalMark) {
                                continue;
                            }
                            if (item.subjectUuid) {
                                finalMarkByUuid.set(item.subjectUuid, finalMark);
                            }
                            if (item.subjectName) {
                                finalMarkByName.set(normalizeSubjectKey(item.subjectName), finalMark);
                            }
                        }
                    }
                }
                academicStoreService_1.academicStoreService.replaceStudentJournalGrades({
                    studentId: context.studentId,
                    scope: selected,
                    grades: liveResult.grades,
                });
                grades = liveResult.grades;
                source = "bilimclass";
                lastMode = "live";
                lastSyncAt = liveSyncedAt;
                lastError = null;
            }
        }
        if (grades.length === 0 && fallbackBinding.studentId) {
            grades = academicStoreService_1.academicStoreService.listStudentJournalGrades({
                studentId: fallbackBinding.studentId,
                scope: selected,
            });
            if (grades.length > 0) {
                source = "cache";
            }
            else if (scopeList.length > 0) {
                const fallbackScope = scopeList[0];
                selected = {
                    eduYear: fallbackScope.eduYear,
                    period: fallbackScope.period,
                    periodType: fallbackScope.periodType,
                };
                grades = academicStoreService_1.academicStoreService.listStudentJournalGrades({
                    studentId: fallbackBinding.studentId,
                    scope: selected,
                });
                if (grades.length > 0) {
                    source = "cache";
                }
            }
        }
        const updatedScopes = fallbackBinding.studentId
            ? academicStoreService_1.academicStoreService.listStudentJournalScopes(fallbackBinding.studentId)
            : [];
        const filters = buildJournalFilterOptions({
            selected,
            scopes: updatedScopes,
            binding: fallbackBinding,
            config,
        });
        const subjects = buildJournalSubjectsView(grades, finalMarkByUuid, finalMarkByName).map((item) => ({
            ...item,
            subjectName: (0, subjectNameLocalization_1.localizeSubjectName)(item.subjectName, requestedLang),
        }));
        const localizedGrades = grades.map((item) => ({
            ...item,
            subjectName: (0, subjectNameLocalization_1.localizeSubjectName)(item.subjectName, requestedLang),
        }));
        const selectedScopeMeta = updatedScopes.find((item) => item.eduYear === selected.eduYear &&
            item.period === selected.period &&
            normalizePeriodType(item.periodType, "") === normalizePeriodType(selected.periodType, ""));
        return {
            role: user.role,
            source,
            studentId: fallbackBinding.studentId,
            selected,
            filters,
            stats: {
                subjects: subjects.length,
                grades: localizedGrades.length,
                lastSyncAt: selectedScopeMeta?.lastSyncedAt ??
                    localizedGrades.reduce((acc, item) => {
                        if (!acc || item.syncedAt > acc) {
                            return item.syncedAt;
                        }
                        return acc;
                    }, null),
            },
            subjects,
            grades: localizedGrades,
        };
    },
    async importScheduleSubjects(classId) {
        const config = getConfig();
        const fallbackProfiles = academicStoreService_1.academicStoreService.listStudentProfiles();
        const fallbackSubjects = collectUniqueSubjectsFromProfiles(fallbackProfiles, classId);
        const targetClassId = classId ? normalizeClassId(classId) : null;
        if (!config.useLive) {
            return {
                source: "database",
                subjects: fallbackSubjects,
            };
        }
        const linkedBindings = buildBindingsFromLinkedAccounts(fallbackProfiles, config).filter((item) => targetClassId ? normalizeClassId(item.binding.classId) === targetClassId : true);
        const candidateBindings = [...linkedBindings];
        if (candidateBindings.length === 0) {
            return {
                source: "database",
                subjects: fallbackSubjects,
            };
        }
        const subjectsCache = new Map();
        const groupListCache = new Map();
        const importedSubjects = new Map();
        const knownSchoolIds = collectKnownSchoolIds(config);
        const knownGroupIds = collectKnownGroupIds(config);
        for (const item of candidateBindings) {
            const authContext = await ensureAuth(config, item.credentials);
            if (!authContext) {
                continue;
            }
            const getSubjectsForBinding = (binding) => {
                const credentialsKey = item.credentials
                    ? `${item.credentials.login.toLowerCase()}|${item.credentials.password}`
                    : "default";
                const cacheKey = `${credentialsKey}|${binding.schoolId}|${binding.eduYear}|${binding.period}|${binding.periodType}|${binding.groupId}`;
                const cached = subjectsCache.get(cacheKey);
                if (cached) {
                    return cached;
                }
                const request = fetchDiarySubjects(config, authContext.auth, binding);
                subjectsCache.set(cacheKey, request);
                return request;
            };
            const getGroupIdsBySchoolYear = (schoolId, eduYear) => {
                const cacheKey = `${authContext.cacheKey}|school:${schoolId}|year:${eduYear}`;
                const cached = groupListCache.get(cacheKey);
                if (cached) {
                    return cached;
                }
                const request = fetchGroupIds(config, authContext.auth, schoolId, eduYear);
                groupListCache.set(cacheKey, request);
                return request;
            };
            const hints = authHintsByKey.get(authContext.cacheKey) ?? {
                schoolIds: [],
                groupIds: [],
                eduYears: [],
                periods: [],
                periodTypes: [],
            };
            for (const schoolId of knownSchoolIds) {
                pushUniqueNumber(hints.schoolIds, schoolId);
            }
            for (const groupId of knownGroupIds) {
                pushUniqueNumber(hints.groupIds, groupId);
            }
            const schoolDiscoveryCandidates = [];
            pushUniqueNumber(schoolDiscoveryCandidates, item.binding.schoolId);
            for (const schoolId of hints.schoolIds) {
                pushUniqueNumber(schoolDiscoveryCandidates, schoolId);
            }
            const yearDiscoveryCandidates = [];
            pushUniqueNumber(yearDiscoveryCandidates, item.binding.eduYear, (value) => value >= 2000 && value <= 2100);
            for (const eduYear of hints.eduYears) {
                pushUniqueNumber(yearDiscoveryCandidates, eduYear, (value) => value >= 2000 && value <= 2100);
            }
            pushUniqueNumber(yearDiscoveryCandidates, config.eduYear, (value) => value >= 2000 && value <= 2100);
            pushUniqueNumber(yearDiscoveryCandidates, deriveAcademicYear(), (value) => value >= 2000 && value <= 2100);
            if (hints.groupIds.length === 0) {
                for (const schoolId of schoolDiscoveryCandidates.slice(0, 6)) {
                    for (const eduYear of yearDiscoveryCandidates.slice(0, 4)) {
                        const discoveredGroupIds = await getGroupIdsBySchoolYear(schoolId, eduYear);
                        for (const groupId of discoveredGroupIds) {
                            pushUniqueNumber(hints.groupIds, groupId);
                        }
                    }
                }
            }
            const bindingCandidates = buildBindingCandidates(item.binding, config, hints);
            for (const candidate of bindingCandidates) {
                const subjectsPayload = await getSubjectsForBinding(candidate);
                if (!subjectsPayload) {
                    continue;
                }
                const names = collectSubjectNamesFromDiaryPayload(subjectsPayload);
                for (const name of names) {
                    const key = normalizeSubjectKey(name);
                    if (!importedSubjects.has(key)) {
                        importedSubjects.set(key, name);
                    }
                }
                break;
            }
        }
        if (importedSubjects.size > 0) {
            return {
                source: "bilimclass",
                subjects: [...importedSubjects.values()].sort((a, b) => a.localeCompare(b)),
            };
        }
        return {
            source: "database",
            subjects: fallbackSubjects,
        };
    },
    async getStudentProfiles() {
        const config = getConfig();
        const fallbackProfiles = academicStoreService_1.academicStoreService.listStudentProfiles();
        if (config.useLive) {
            const liveProfiles = await syncLiveProfiles(config, fallbackProfiles);
            if (liveProfiles && liveProfiles.length > 0) {
                academicStoreService_1.academicStoreService.upsertStudentProfiles(liveProfiles);
                lastMode = "live";
                lastSyncAt = new Date().toISOString();
                lastError = null;
                return enrichProfilesFromJournalCache(academicStoreService_1.academicStoreService.listStudentProfiles(), config);
            }
        }
        lastMode = "database";
        lastSyncAt = new Date().toISOString();
        if (!config.allowSeedFallback && fallbackProfiles.length === 0) {
            return [];
        }
        return enrichProfilesFromJournalCache(fallbackProfiles, config);
    },
    status() {
        const config = getConfig();
        const linkedUsers = storageService_1.storageService.listBilimLinkedUsers();
        const hasAuth = Boolean(linkedUsers.length > 0 || config.staticToken || (config.loginValue && config.passwordValue) || config.loginPayload);
        const hasBinding = linkedUsers.length > 0 ||
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
                diaryWeeks: `${config.baseUrl}${config.diaryWeeksPath}`,
                groupList: `${config.baseUrl}${config.groupListPath}`,
                journalService: config.journalServiceUrl,
            },
        };
    },
};
