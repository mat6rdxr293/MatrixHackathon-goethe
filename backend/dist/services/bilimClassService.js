"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bilimClassService = void 0;
const axios_1 = __importDefault(require("axios"));
const academicStoreService_1 = require("./academicStoreService");
const storageService_1 = require("./storageService");
let lastMode = "database";
let lastSyncAt = null;
let lastError = null;
const authCacheByKey = new Map();
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
const normalizeToFiveScale = (rawScore, markMax) => {
    let score = rawScore;
    if (markMax && markMax > 0) {
        score = (rawScore / markMax) * 5;
    }
    else if (rawScore > 5) {
        if (rawScore <= 10) {
            score = rawScore / 2;
        }
        else if (rawScore <= 25) {
            score = (rawScore / 25) * 5;
        }
        else if (rawScore <= 100) {
            score = (rawScore / 100) * 5;
        }
        else {
            score = 5;
        }
    }
    return Number(Math.max(0, Math.min(5, score)).toFixed(2));
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
    const current = Number(history[history.length - 1].score.toFixed(2));
    const trend = history.length >= 2 ? Number((history[history.length - 1].score - history[history.length - 2].score).toFixed(2)) : 0;
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
    if (config.staticToken && !credentials) {
        return {
            accessToken: config.staticToken,
        };
    }
    const cacheKey = buildAuthCacheKey(config, credentials);
    const cachedAuth = authCacheByKey.get(cacheKey);
    if (cachedAuth?.accessToken) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (!cachedAuth.expiresAtEpochSec || cachedAuth.expiresAtEpochSec > nowSec + 60) {
            return cachedAuth;
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
        return auth;
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
        if (!binding.groupId || !binding.schoolId || !binding.eduYear || !binding.period || !binding.periodType) {
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
    for (const item of bindings) {
        const auth = await ensureAuth(config, item.credentials);
        if (!auth) {
            continue;
        }
        const subjects = await getSubjectsForBinding(item.binding, auth, item.credentials);
        if (!subjects) {
            continue;
        }
        const fallbackProfile = fallbackByStudent.get(item.binding.studentId) ?? null;
        const profile = buildProfileFromDiary(item.binding, subjects, fallbackProfile);
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
const syncLiveProfiles = async (config, fallbackProfiles) => {
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
                return academicStoreService_1.academicStoreService.listStudentProfiles();
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
        const linkedUsers = storageService_1.storageService.listBilimLinkedUsers();
        const hasAuth = Boolean(linkedUsers.length > 0 || config.staticToken || (config.loginValue && config.passwordValue) || config.loginPayload);
        const hasBinding = Boolean(config.defaultGroupId) ||
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
