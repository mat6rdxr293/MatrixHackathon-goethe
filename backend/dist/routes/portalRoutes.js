"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.portalRoutes = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const analyticsService_1 = require("../services/analyticsService");
const bilimClassService_1 = require("../services/bilimClassService");
const classReportService_1 = require("../services/classReportService");
const notificationService_1 = require("../services/notificationService");
const openAiMentorService_1 = require("../services/openAiMentorService");
const predictionService_1 = require("../services/predictionService");
const scheduleService_1 = require("../services/scheduleService");
const storageService_1 = require("../services/storageService");
const studentProfileService_1 = require("../services/studentProfileService");
const academicStoreService_1 = require("../services/academicStoreService");
exports.portalRoutes = (0, express_1.Router)();
exports.portalRoutes.use(auth_1.authMiddleware);
const aiChatSchema = zod_1.z.object({
    message: zod_1.z.string().trim().min(1).max(1200),
    history: zod_1.z
        .array(zod_1.z.object({
        role: zod_1.z.enum(["user", "assistant"]),
        content: zod_1.z.string().trim().min(1).max(2000),
    }))
        .max(20)
        .optional(),
    context: zod_1.z
        .object({
        mentorSummary: zod_1.z.string().trim().max(3000).optional(),
        predictionsSummary: zod_1.z.string().trim().max(3000).optional(),
        recommendationHints: zod_1.z.array(zod_1.z.string().trim().min(1).max(300)).max(8).optional(),
        analytics: zod_1.z
            .object({
            strengths: zod_1.z.array(zod_1.z.string().trim().min(1).max(160)).max(10).optional(),
            weaknesses: zod_1.z.array(zod_1.z.string().trim().min(1).max(160)).max(10).optional(),
            recommendations: zod_1.z.array(zod_1.z.string().trim().min(1).max(320)).max(10).optional(),
            trends: zod_1.z
                .array(zod_1.z.object({
                subject: zod_1.z.string().trim().min(1).max(120),
                trend: zod_1.z.number(),
            }))
                .max(12)
                .optional(),
            prediction: zod_1.z
                .object({
                overallRisk: zod_1.z.number().min(0).max(100).optional(),
                topRiskMessage: zod_1.z.string().trim().max(400).optional(),
                flags: zod_1.z.array(zod_1.z.string().trim().min(1).max(200)).max(8).optional(),
                nextActions: zod_1.z.array(zod_1.z.string().trim().min(1).max(300)).max(8).optional(),
            })
                .optional(),
            teacherTopRisks: zod_1.z.array(zod_1.z.string().trim().min(1).max(240)).max(8).optional(),
            adminTopRiskClasses: zod_1.z.array(zod_1.z.string().trim().min(1).max(240)).max(8).optional(),
            journal: zod_1.z
                .object({
                selected: zod_1.z
                    .object({
                    eduYear: zod_1.z.number().int().positive().optional(),
                    period: zod_1.z.number().int().positive().optional(),
                    periodType: zod_1.z.string().trim().min(1).max(40).optional(),
                })
                    .optional(),
                source: zod_1.z.enum(["bilimclass", "cache", "empty"]).optional(),
                subjects: zod_1.z.number().int().min(0).optional(),
                grades: zod_1.z.number().int().min(0).optional(),
                topSubjects: zod_1.z.array(zod_1.z.string().trim().min(1).max(200)).max(10).optional(),
                recentGrades: zod_1.z.array(zod_1.z.string().trim().min(1).max(200)).max(10).optional(),
                lastSyncAt: zod_1.z.string().trim().max(80).nullable().optional(),
            })
                .optional(),
        })
            .optional(),
    })
        .optional(),
});
const achievementSubmitSchema = zod_1.z.object({
    studentId: zod_1.z.string().trim().min(1).optional(),
    title: zod_1.z.string().trim().min(2).max(120),
    type: zod_1.z.enum(["academic", "sport", "creative", "social"]),
    badge: zod_1.z.string().trim().min(2).max(120).optional(),
    date: zod_1.z.string().trim().min(6).max(40).optional(),
    points: zod_1.z.number().int().min(1).max(500).optional(),
    proofUrl: zod_1.z.string().trim().url().max(512).optional(),
    proofNote: zod_1.z.string().trim().max(2000).optional(),
    proofAttachment: zod_1.z
        .object({
        fileName: zod_1.z.string().trim().min(1).max(255),
        mimeType: zod_1.z.string().trim().min(1).max(120),
        dataUrl: zod_1.z.string().trim().startsWith("data:").max(3_000_000),
    })
        .optional(),
});
const achievementVerifySchema = zod_1.z.object({
    method: zod_1.z.string().trim().max(80).optional(),
    evidence: zod_1.z.string().trim().max(500).optional(),
});
const bilimBindingSchema = zod_1.z.object({
    login: zod_1.z.string().trim().min(3).max(160),
    password: zod_1.z.string().min(3).max(160),
    schoolId: zod_1.z.number().int().positive().optional(),
    groupId: zod_1.z.number().int().positive().optional(),
    eduYear: zod_1.z.number().int().positive().optional(),
    period: zod_1.z.number().int().positive().optional(),
    periodType: zod_1.z.string().trim().min(1).max(40).optional(),
});
const journalQuerySchema = zod_1.z.object({
    eduYear: zod_1.z.coerce.number().int().positive().optional(),
    period: zod_1.z.coerce.number().int().positive().optional(),
    periodType: zod_1.z.string().trim().min(1).max(40).optional(),
    lang: zod_1.z.enum(["ru", "kk"]).optional(),
});
const aiMentorQuerySchema = zod_1.z.object({
    eduYear: zod_1.z.coerce.number().int().positive().optional(),
    period: zod_1.z.coerce.number().int().positive().optional(),
    periodType: zod_1.z.string().trim().min(1).max(40).optional(),
    lang: zod_1.z.enum(["ru", "kk"]).optional(),
});
const localizedLangQuerySchema = zod_1.z.object({
    lang: zod_1.z.enum(["ru", "kk"]).optional(),
});
const summarizePredictions = (payload) => {
    if (payload.role === "student" || payload.role === "parent") {
        return payload.prediction?.topRiskMessage ?? "";
    }
    if (payload.role === "teacher") {
        const top = payload.students.slice(0, 3);
        if (top.length === 0) {
            return "";
        }
        return top.map((item) => `${item.fullName}: ${item.weakSubject} (${item.probability}%)`).join("; ");
    }
    if ("classRadar" in payload && Array.isArray(payload.classRadar)) {
        const topClasses = payload.classRadar.slice(0, 3);
        return topClasses.map((item) => `${item.classId}: ${item.averageRisk}%`).join("; ");
    }
    return "";
};
const summarizeJournalForChat = (journal) => {
    const topSubjects = journal.subjects
        .slice(0, 3)
        .map((item) => `${item.subjectName}: ${item.averageScore !== null ? item.averageScore.toFixed(2) : "нет среднего"} (${item.gradesCount})`);
    const recentGrades = [...journal.grades]
        .sort((a, b) => {
        const left = `${a.lessonDate} ${a.lessonTime ?? ""}`.trim();
        const right = `${b.lessonDate} ${b.lessonTime ?? ""}`.trim();
        return right.localeCompare(left);
    })
        .slice(0, 5)
        .map((item) => `${item.subjectName} ${item.scoreRaw}`);
    return {
        selected: journal.selected,
        source: journal.source,
        subjects: journal.stats.subjects,
        grades: journal.stats.grades,
        topSubjects,
        recentGrades,
        lastSyncAt: journal.stats.lastSyncAt,
    };
};
exports.portalRoutes.get("/dashboard", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const dashboard = await analyticsService_1.analyticsService.getDashboardByRole(req.user);
    res.json(dashboard);
});
exports.portalRoutes.get("/progress", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = localizedLangQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
        return;
    }
    const progress = await analyticsService_1.analyticsService.getProgress(req.user, parsed.data.lang ?? "ru");
    res.json(progress);
});
exports.portalRoutes.get("/journal", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "student" && req.user.role !== "parent") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const parsed = journalQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
        return;
    }
    try {
        const { lang = "ru", ...scope } = parsed.data;
        const journal = await bilimClassService_1.bilimClassService.getStudentJournal(req.user, scope, lang);
        res.json(journal);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось получить журнал ученика";
        res.status(502).json({ message });
    }
});
exports.portalRoutes.get("/achievements", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const achievements = await analyticsService_1.analyticsService.getAchievements(req.user);
    res.json(achievements);
});
exports.portalRoutes.post("/achievements", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = achievementSubmitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const payload = parsed.data;
    let studentId = "";
    if (req.user.role === "student") {
        studentId = req.user.linkedStudentId ?? req.user.id;
    }
    else if (req.user.role === "parent") {
        if (!req.user.linkedStudentId) {
            res.status(400).json({ message: "Для этой роли нужно указать связанного ученика" });
            return;
        }
        studentId = req.user.linkedStudentId;
    }
    else {
        if (!payload.studentId) {
            res.status(400).json({ message: "Нужно указать ученика" });
            return;
        }
        studentId = payload.studentId;
    }
    const created = academicStoreService_1.academicStoreService.createAchievement({
        studentId,
        title: payload.title,
        type: payload.type,
        badge: payload.badge ?? "Заявка с пруфом",
        date: payload.date ?? new Date().toISOString().slice(0, 10),
        points: payload.points ?? 10,
        proofUrl: payload.proofUrl,
        proofNote: payload.proofNote,
        proofAttachment: payload.proofAttachment,
        submittedBy: req.user.name,
    });
    res.status(201).json({ item: created });
});
exports.portalRoutes.post("/achievements/:achievementId/verify", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const parsed = achievementVerifySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const achievementId = (req.params.achievementId ?? "").trim();
    if (!achievementId) {
        res.status(400).json({ message: "Нужно указать достижение" });
        return;
    }
    try {
        const verified = academicStoreService_1.academicStoreService.verifyAchievement({
            achievementId,
            verifiedBy: req.user.name,
            method: parsed.data.method,
            evidence: parsed.data.evidence,
        });
        res.json({ item: verified });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось подтвердить достижение";
        const status = message === "Achievement not found" ? 404 : 500;
        res.status(status).json({ message });
    }
});
exports.portalRoutes.get("/events", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const feed = await analyticsService_1.analyticsService.getEvents(req.user);
    res.json(feed);
});
exports.portalRoutes.get("/profile/bilimclass", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const binding = storageService_1.storageService.getBilimBinding(req.user.id);
    if (!binding) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    res.json({
        provider: "BilimClass",
        linked: binding.linked,
        login: binding.login,
        linkedAt: binding.linkedAt,
        schoolId: binding.schoolId,
        groupId: binding.groupId,
        eduYear: binding.eduYear,
        period: binding.period,
        periodType: binding.periodType,
    });
});
exports.portalRoutes.put("/profile/bilimclass", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = bilimBindingSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const { login, password, schoolId, groupId, eduYear, period, periodType } = parsed.data;
    const verification = await bilimClassService_1.bilimClassService.verifyCredentials(login, password);
    if (!verification.ok) {
        res.status(400).json({
            message: verification.error ?? "Не удалось подключить аккаунт BilimClass",
        });
        return;
    }
    const binding = storageService_1.storageService.setBilimBinding(req.user.id, {
        login,
        password,
        schoolId,
        groupId,
        eduYear,
        period,
        periodType,
    });
    if (!binding) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    res.json({
        provider: "BilimClass",
        linked: binding.linked,
        login: binding.login,
        linkedAt: binding.linkedAt,
        schoolId: binding.schoolId,
        groupId: binding.groupId,
        eduYear: binding.eduYear,
        period: binding.period,
        periodType: binding.periodType,
        accountName: verification.accountName,
    });
});
exports.portalRoutes.delete("/profile/bilimclass", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const binding = storageService_1.storageService.clearBilimBinding(req.user.id);
    if (!binding) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    res.json({
        provider: "BilimClass",
        linked: false,
        login: null,
        linkedAt: null,
        schoolId: null,
        groupId: null,
        eduYear: null,
        period: null,
        periodType: null,
    });
});
exports.portalRoutes.get("/ai-mentor", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = aiMentorQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
        return;
    }
    try {
        const { lang = "ru", ...scope } = parsed.data;
        const aiMentorData = await analyticsService_1.analyticsService.getAiMentor(req.user, scope, lang);
        res.json(aiMentorData);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось получить ИИ-анализ";
        res.status(502).json({ message });
    }
});
exports.portalRoutes.post("/ai-chat", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = aiChatSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const { message, history, context } = parsed.data;
    let mentorSummary = context?.mentorSummary;
    let predictionsSummary = context?.predictionsSummary;
    let recommendationHints = context?.recommendationHints;
    let analyticsContext = context?.analytics;
    if (!mentorSummary || !recommendationHints || recommendationHints.length === 0 || !analyticsContext) {
        const mentorData = await analyticsService_1.analyticsService.getAiMentor(req.user);
        mentorSummary = mentorSummary ?? mentorData.summary;
        recommendationHints = recommendationHints?.length ? recommendationHints : mentorData.recommendations?.slice(0, 3);
        analyticsContext = analyticsContext ?? {
            strengths: mentorData.strengths ?? [],
            weaknesses: mentorData.weaknesses ?? [],
            recommendations: mentorData.recommendations ?? [],
            trends: mentorData.trends ?? [],
        };
    }
    if (!predictionsSummary || !analyticsContext?.prediction) {
        const predictions = await predictionService_1.predictionService.getPredictionsByRole(req.user);
        predictionsSummary = predictionsSummary ?? summarizePredictions(predictions);
        if (!analyticsContext?.prediction) {
            const nextContext = { ...(analyticsContext ?? {}) };
            if (predictions.role === "student" || predictions.role === "parent") {
                if (predictions.prediction) {
                    nextContext.prediction = {
                        overallRisk: predictions.prediction.overallRisk,
                        topRiskMessage: predictions.prediction.topRiskMessage,
                        flags: predictions.prediction.flags,
                        nextActions: predictions.prediction.nextActions,
                    };
                }
            }
            else if (predictions.role === "teacher") {
                nextContext.teacherTopRisks = predictions.students
                    .slice(0, 5)
                    .map((item) => `${item.fullName} (${item.classId}) — ${item.probability}%`);
            }
            else {
                nextContext.adminTopRiskClasses = (predictions.classRadar ?? [])
                    .slice(0, 5)
                    .map((item) => `${item.classId}: ${item.averageRisk}% (${item.highRiskStudents}/${item.totalStudents})`);
            }
            analyticsContext = nextContext;
        }
    }
    if (req.user.role === "student" || req.user.role === "parent") {
        try {
            const journal = await bilimClassService_1.bilimClassService.getStudentJournal(req.user, undefined, "ru");
            const nextContext = { ...(analyticsContext ?? {}) };
            nextContext.journal = summarizeJournalForChat(journal);
            analyticsContext = nextContext;
        }
        catch {
            // Keep chat working even if journal sync/cache is unavailable.
        }
    }
    try {
        const aiReply = await openAiMentorService_1.openAiMentorService.generateChatReply({
            role: req.user.role,
            userName: req.user.name,
            message,
            history,
            context: {
                mentorSummary,
                predictionsSummary,
                recommendationHints,
                analytics: analyticsContext,
            },
        });
        res.json({
            reply: aiReply.reply,
            source: aiReply.mode,
            mode: aiReply.mode,
        });
    }
    catch (error) {
        const messageText = error instanceof Error ? error.message : "Не удалось получить ответ AI-чата";
        res.status(502).json({ message: messageText });
    }
});
exports.portalRoutes.get("/kiosk", async (_req, res) => {
    const kiosk = await analyticsService_1.analyticsService.getKioskData();
    const scheduleUpdates = await scheduleService_1.scheduleService.getScheduleForKiosk();
    res.json({
        ...kiosk,
        scheduleUpdates,
    });
});
exports.portalRoutes.get("/schedule", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const items = await scheduleService_1.scheduleService.getScheduleForUser(req.user);
    res.json({ items });
});
exports.portalRoutes.get("/notifications", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const classIdOverride = req.user.role === "parent" && req.user.linkedStudentId
        ? (await bilimClassService_1.bilimClassService.getStudentProfiles()).find((student) => student.studentId === req.user?.linkedStudentId)?.classId
        : null;
    const items = notificationService_1.notificationService.listForUser(req.user, classIdOverride);
    res.json({ items });
});
exports.portalRoutes.get("/predictions", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const payload = await predictionService_1.predictionService.getPredictionsByRole(req.user);
    res.json(payload);
});
exports.portalRoutes.get("/teacher/class-report", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const classIdQuery = typeof req.query.classId === "string" ? req.query.classId : "";
    const normalizedClassId = classIdQuery.trim().toUpperCase();
    const fallbackTeacherClass = req.user.role === "teacher"
        ? storageService_1.storageService.listClasses().find((item) => item.teacherId === req.user?.id)?.classId
        : undefined;
    const classId = normalizedClassId || fallbackTeacherClass;
    if (!classId) {
        res.status(400).json({ message: "Нужно указать класс" });
        return;
    }
    const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
    try {
        const report = await classReportService_1.classReportService.buildClassReport(classId, profiles, req.user.name);
        if (!report) {
            res.status(404).json({ message: "Класс не найден в профилях учеников" });
            return;
        }
        res.json(report);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось сгенерировать отчет класса";
        res.status(502).json({ message });
    }
});
exports.portalRoutes.get("/integrations/bilimclass/status", (_req, res) => {
    res.json(bilimClassService_1.bilimClassService.status());
});
exports.portalRoutes.get("/integrations/bilimclass/students", async (_req, res) => {
    const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
    res.json({ students: profiles });
});
exports.portalRoutes.get("/student-profiles/:studentId", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const result = await studentProfileService_1.studentProfileService.getCard(req.params.studentId ?? "", req.user);
    if (!result) {
        res.status(404).json({ message: "Профиль ученика не найден" });
        return;
    }
    res.json(result);
});
// ─── Subject Practice ─────────────────────────────────────────────────────────
const subjectPracticeSchema = zod_1.z.object({
    subject: zod_1.z.string().trim().min(1).max(80),
    mode: zod_1.z.enum(["hint", "check", "solution"]),
    problem: zod_1.z.string().trim().min(1).max(2000),
    studentAttempt: zod_1.z.string().trim().max(2000).optional(),
    taskId: zod_1.z.coerce.number().int().min(1).optional(),
});
const subjectSessionSchema = zod_1.z.object({
    subject: zod_1.z.string().trim().min(1).max(80),
    taskId: zod_1.z.coerce.number().int().min(1),
    score: zod_1.z.number().min(0).max(100),
    timeSpentSeconds: zod_1.z.number().int().min(0).optional(),
});
const subjectPracticeOptionSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1).max(80),
    text: zod_1.z.string().trim().min(1).max(300),
});
const subjectPracticePairSchema = zod_1.z.object({
    leftId: zod_1.z.string().trim().min(1).max(80),
    rightId: zod_1.z.string().trim().min(1).max(80),
});
const subjectPracticeQuestionPayloadSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({
        type: zod_1.z.literal("single_choice"),
        prompt: zod_1.z.string().trim().min(5).max(1200),
        explanation: zod_1.z.string().trim().max(1200).optional(),
        sortOrder: zod_1.z.number().int().min(0).optional(),
        options: zod_1.z.array(subjectPracticeOptionSchema).min(2).max(10),
        correctOptionId: zod_1.z.string().trim().min(1).max(80),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("multiple_choice"),
        prompt: zod_1.z.string().trim().min(5).max(1200),
        explanation: zod_1.z.string().trim().max(1200).optional(),
        sortOrder: zod_1.z.number().int().min(0).optional(),
        options: zod_1.z.array(subjectPracticeOptionSchema).min(2).max(12),
        correctOptionIds: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).min(1).max(12),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("short_answer"),
        prompt: zod_1.z.string().trim().min(5).max(1200),
        explanation: zod_1.z.string().trim().max(1200).optional(),
        sortOrder: zod_1.z.number().int().min(0).optional(),
        acceptedAnswers: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).min(1).max(20),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("matching"),
        prompt: zod_1.z.string().trim().min(5).max(1200),
        explanation: zod_1.z.string().trim().max(1200).optional(),
        sortOrder: zod_1.z.number().int().min(0).optional(),
        leftItems: zod_1.z.array(subjectPracticeOptionSchema).min(2).max(12),
        rightItems: zod_1.z.array(subjectPracticeOptionSchema).min(2).max(12),
        correctPairs: zod_1.z.array(subjectPracticePairSchema).min(1).max(20),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("ordering"),
        prompt: zod_1.z.string().trim().min(5).max(1200),
        explanation: zod_1.z.string().trim().max(1200).optional(),
        sortOrder: zod_1.z.number().int().min(0).optional(),
        items: zod_1.z.array(subjectPracticeOptionSchema).min(2).max(12),
        correctOrder: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).min(2).max(12),
    }),
]);
const subjectPracticeSubmissionSchema = zod_1.z.object({
    subject: zod_1.z.string().trim().min(1).max(80),
    answers: zod_1.z
        .array(zod_1.z.object({
        questionId: zod_1.z.string().trim().min(1).max(80),
        answer: zod_1.z.discriminatedUnion("type", [
            zod_1.z.object({
                type: zod_1.z.literal("single_choice"),
                optionId: zod_1.z.string().trim().min(1).max(80),
            }),
            zod_1.z.object({
                type: zod_1.z.literal("multiple_choice"),
                optionIds: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).max(40),
            }),
            zod_1.z.object({
                type: zod_1.z.literal("short_answer"),
                text: zod_1.z.string().trim().max(500),
            }),
            zod_1.z.object({
                type: zod_1.z.literal("matching"),
                pairs: zod_1.z.array(subjectPracticePairSchema).max(30),
            }),
            zod_1.z.object({
                type: zod_1.z.literal("ordering"),
                order: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).max(20),
            }),
        ]),
    }))
        .max(200),
});
const subjectPathParamSchema = zod_1.z.object({
    subject: zod_1.z.string().trim().min(1).max(80),
});
const questionPathParamSchema = zod_1.z.object({
    subject: zod_1.z.string().trim().min(1).max(80),
    questionId: zod_1.z.string().trim().min(1).max(80),
});
exports.portalRoutes.get("/subject-practice/questions/:subject", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = subjectPathParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверный предмет", errors: parsed.error.flatten() });
        return;
    }
    const includeAnswers = req.user.role === "teacher" || req.user.role === "admin";
    const items = academicStoreService_1.academicStoreService.listSubjectPracticeQuestions(parsed.data.subject, includeAnswers);
    res.json({ items });
});
exports.portalRoutes.post("/subject-practice/questions/submit", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = subjectPracticeSubmissionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные ответа", errors: parsed.error.flatten() });
        return;
    }
    const result = academicStoreService_1.academicStoreService.evaluateSubjectPracticeSubmission(parsed.data);
    res.json(result);
});
exports.portalRoutes.post("/subject-practice/questions/:subject", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const paramsParsed = subjectPathParamSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
        res.status(400).json({ message: "Неверный предмет", errors: paramsParsed.error.flatten() });
        return;
    }
    const payloadParsed = subjectPracticeQuestionPayloadSchema.safeParse(req.body ?? {});
    if (!payloadParsed.success) {
        res.status(400).json({ message: "Неверные данные вопроса", errors: payloadParsed.error.flatten() });
        return;
    }
    try {
        const item = academicStoreService_1.academicStoreService.createSubjectPracticeQuestion({
            subject: paramsParsed.data.subject,
            question: payloadParsed.data,
            createdBy: req.user.name,
        });
        res.status(201).json({ item });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось создать вопрос";
        res.status(400).json({ message });
    }
});
exports.portalRoutes.put("/subject-practice/questions/:subject/:questionId", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const paramsParsed = questionPathParamSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
        res.status(400).json({ message: "Неверные параметры", errors: paramsParsed.error.flatten() });
        return;
    }
    const payloadParsed = subjectPracticeQuestionPayloadSchema.safeParse(req.body ?? {});
    if (!payloadParsed.success) {
        res.status(400).json({ message: "Неверные данные вопроса", errors: payloadParsed.error.flatten() });
        return;
    }
    try {
        const item = academicStoreService_1.academicStoreService.updateSubjectPracticeQuestion({
            subject: paramsParsed.data.subject,
            questionId: paramsParsed.data.questionId,
            question: payloadParsed.data,
        });
        res.json({ item });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось обновить вопрос";
        res.status(message === "Question not found" ? 404 : 400).json({ message });
    }
});
exports.portalRoutes.delete("/subject-practice/questions/:subject/:questionId", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
        res.status(403).json({ message: "Недостаточно прав доступа" });
        return;
    }
    const paramsParsed = questionPathParamSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
        res.status(400).json({ message: "Неверные параметры", errors: paramsParsed.error.flatten() });
        return;
    }
    const removed = academicStoreService_1.academicStoreService.deleteSubjectPracticeQuestion(paramsParsed.data.subject, paramsParsed.data.questionId);
    if (!removed) {
        res.status(404).json({ message: "Вопрос не найден" });
        return;
    }
    res.json({ ok: true });
});
exports.portalRoutes.post("/subject-practice/ai", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = subjectPracticeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const { subject, mode, problem, studentAttempt } = parsed.data;
    const modeLabel = mode === "hint" ? "подсказку" : mode === "check" ? "проверку" : "полное решение";
    const systemPrompt = `Ты — умный ИИ-ассистент по предмету "${subject}" для школьников лицея. Отвечай строго по делу, кратко и понятно. Используй математическую нотацию если нужно. Отвечай на русском языке.`;
    const userMessage = mode === "hint"
        ? `Дай ${modeLabel} для задачи без решения:\n${problem}`
        : mode === "check"
            ? `Проверь решение ученика. Задача: ${problem}\nРешение ученика: ${studentAttempt ?? "(нет)"}\nНапиши процент выполнения в формате "Выполнено: X%".`
            : `Дай ${modeLabel} для задачи:\n${problem}`;
    try {
        const aiReply = await openAiMentorService_1.openAiMentorService.generateChatReply({
            role: req.user.role,
            userName: req.user.name,
            message: userMessage,
            history: [],
            context: { mentorSummary: systemPrompt, recommendationHints: [] },
        });
        res.json({ text: aiReply.reply, mode: aiReply.mode });
    }
    catch (error) {
        const messageText = error instanceof Error ? error.message : "Ошибка AI-ответа";
        res.status(502).json({ message: messageText });
    }
});
exports.portalRoutes.post("/subject-practice/session", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const parsed = subjectSessionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные", errors: parsed.error.flatten() });
        return;
    }
    const studentId = req.user.role === "student" ? (req.user.linkedStudentId ?? req.user.id) : req.user.id;
    academicStoreService_1.academicStoreService.recordSubjectSession({
        studentId,
        subject: parsed.data.subject,
        taskId: parsed.data.taskId,
        score: parsed.data.score,
        timeSpentSeconds: parsed.data.timeSpentSeconds ?? 0,
    });
    res.json({ ok: true });
});
exports.portalRoutes.get("/subject-practice/sessions", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const studentId = req.user.role === "student" ? (req.user.linkedStudentId ?? req.user.id) : req.user.id;
    const items = academicStoreService_1.academicStoreService.listSubjectSessions(studentId);
    res.json({ items });
});
// ── Practice Module auth token ──────────────────────────────────────────────
// Issues a short-lived signed JWT so the practice module can verify the role
// without trusting a plain URL parameter.
exports.portalRoutes.get("/practice-token", (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const secret = process.env.PM_SHARED_SECRET;
    if (!secret) {
        res.status(503).json({ message: "PM_SHARED_SECRET не задан на сервере" });
        return;
    }
    const payload = { sub: req.user.id, role: req.user.role };
    const token = jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "5m", algorithm: "HS256" });
    res.json({ token });
});
