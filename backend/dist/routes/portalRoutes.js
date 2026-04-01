"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portalRoutes = void 0;
const express_1 = require("express");
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
    const progress = await analyticsService_1.analyticsService.getProgress(req.user);
    res.json(progress);
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
    try {
        const aiMentorData = await analyticsService_1.analyticsService.getAiMentor(req.user);
        res.json(aiMentorData);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось получить AI-анализ";
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
