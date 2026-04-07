"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const analyticsService_1 = require("../services/analyticsService");
const academicStoreService_1 = require("../services/academicStoreService");
const bilimClassService_1 = require("../services/bilimClassService");
const notificationService_1 = require("../services/notificationService");
const scheduleService_1 = require("../services/scheduleService");
const scheduleStoreService_1 = require("../services/scheduleStoreService");
const storageService_1 = require("../services/storageService");
const contentSchema = zod_1.z.object({
    type: zod_1.z.enum(["news", "event", "announcement"]),
    title: zod_1.z.string().min(4),
    description: zod_1.z.string().min(8),
    date: zod_1.z.string(),
    important: zod_1.z.boolean().optional(),
    targetRoles: zod_1.z.array(zod_1.z.enum(["student", "teacher", "parent", "admin"])).optional(),
    targetClassIds: zod_1.z.array(zod_1.z.string().trim().min(2).max(12)).optional(),
});
const classSchema = zod_1.z.object({
    classId: zod_1.z
        .string()
        .trim()
        .min(2)
        .max(12)
        .regex(/^[\p{L}\d-]+$/u),
    teacherId: zod_1.z.string().trim().min(1).optional().nullable(),
});
const userSchema = zod_1.z.object({
    role: zod_1.z.enum(["student", "teacher", "parent", "admin"]),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().trim().min(2),
    classId: zod_1.z.string().trim().min(2).max(12).optional(),
    linkedStudentId: zod_1.z.string().trim().min(2).optional(),
});
const userPasswordSchema = zod_1.z.object({
    password: zod_1.z.string().trim().min(6).max(120),
});
const lessonRequirementSchema = zod_1.z.object({
    classId: zod_1.z.string().trim().min(2).max(12),
    subject: zod_1.z.string().trim().min(2),
    weeklyHours: zod_1.z.number().int().min(1).max(10),
    teacherId: zod_1.z.string().trim().min(2),
    room: zod_1.z.string().trim().min(1),
    kind: zod_1.z.enum(["lesson", "pair", "academic-hour", "stream", "event"]).optional(),
    duration: zod_1.z.number().int().min(1).max(2).optional(),
});
const streamGroupSchema = zod_1.z.object({
    groupName: zod_1.z.string().trim().min(2),
    classIds: zod_1.z.array(zod_1.z.string().trim().min(2).max(12)).min(1),
    subject: zod_1.z.string().trim().min(2),
    teacherId: zod_1.z.string().trim().min(2),
    room: zod_1.z.string().trim().min(1),
    weeklyHours: zod_1.z.number().int().min(1).max(8),
    duration: zod_1.z.number().int().min(1).max(2).optional(),
});
const plannerWeightsSchema = zod_1.z
    .object({
    classDailyLoad: zod_1.z.number().min(0).max(3),
    teacherDailyLoad: zod_1.z.number().min(0).max(3),
    sameSubjectDay: zod_1.z.number().min(0).max(3),
    classGap: zod_1.z.number().min(0).max(3),
    teacherGap: zod_1.z.number().min(0).max(3),
    lateLessons: zod_1.z.number().min(0).max(3),
    classSpread: zod_1.z.number().min(0).max(3),
    teacherSpread: zod_1.z.number().min(0).max(3),
    centerBias: zod_1.z.number().min(0).max(3),
    adjacentSameSubject: zod_1.z.number().min(0).max(3),
})
    .partial();
const scheduleGenerateSchema = zod_1.z.object({
    days: zod_1.z.array(zod_1.z.number().int().min(1).max(7)).min(1).optional(),
    slotsPerDay: zod_1.z.number().int().min(4).max(10).optional(),
    lessonRequirements: zod_1.z.array(lessonRequirementSchema).optional(),
    streams: zod_1.z
        .array(zod_1.z.object({
        streamId: zod_1.z.string().trim().min(2),
        name: zod_1.z.string().trim().min(2),
        groups: zod_1.z.array(streamGroupSchema).min(1),
    }))
        .optional(),
    teacherBusy: zod_1.z
        .array(zod_1.z.object({
        teacherId: zod_1.z.string().trim().min(2),
        day: zod_1.z.number().int().min(1).max(7),
        slot: zod_1.z.number().int().min(1).max(12),
    }))
        .optional(),
    analysisPreset: zod_1.z.enum(["balanced", "risk", "comfort"]).optional(),
    weights: plannerWeightsSchema.optional(),
});
const teacherAbsenceSchema = zod_1.z.object({
    teacherId: zod_1.z.string().trim().min(2),
    date: zod_1.z.string().trim().min(4),
    day: zod_1.z.number().int().min(1).max(7),
    slots: zod_1.z.array(zod_1.z.number().int().min(1).max(12)).min(1),
    reason: zod_1.z.string().trim().min(2).optional(),
});
const scheduleSubjectsImportQuerySchema = zod_1.z.object({
    classId: zod_1.z.string().trim().min(2).max(12).optional(),
});
exports.adminRoutes = (0, express_1.Router)();
exports.adminRoutes.use(auth_1.authMiddleware, (0, auth_1.requireRoles)(["admin"]));
exports.adminRoutes.get("/analytics", async (_req, res) => {
    const analytics = await analyticsService_1.analyticsService.getAdminAnalytics();
    res.json(analytics);
});
exports.adminRoutes.get("/users", (_req, res) => {
    res.json({
        roles: analyticsService_1.analyticsService.listRoles(),
        users: analyticsService_1.analyticsService.listUsers(),
    });
});
exports.adminRoutes.post("/users", (req, res) => {
    const result = userSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
        return;
    }
    const payload = result.data;
    const emailTaken = storageService_1.storageService.getUserByEmail(payload.email.toLowerCase());
    if (emailTaken) {
        res.status(409).json({ message: "Пользователь с такой почтой уже существует" });
        return;
    }
    if (payload.role === "student" && !payload.classId) {
        res.status(400).json({ message: "Для аккаунта ученика нужно указать класс" });
        return;
    }
    if (payload.role === "parent" && !payload.linkedStudentId) {
        res.status(400).json({ message: "Для аккаунта родителя нужно указать связанного ученика" });
        return;
    }
    if (payload.classId) {
        const schoolClass = storageService_1.storageService.getClassByClassId(payload.classId);
        if (!schoolClass) {
            res.status(400).json({ message: "Такого класса нет" });
            return;
        }
    }
    try {
        const user = storageService_1.storageService.createUser(payload);
        if (payload.role === "teacher" && payload.classId) {
            storageService_1.storageService.assignTeacherToClass(payload.classId, user.id);
        }
        if (payload.role === "student") {
            const studentId = user.linkedStudentId ?? user.id;
            academicStoreService_1.academicStoreService.upsertStudentProfiles([
                {
                    studentId,
                    fullName: user.name,
                    classId: user.classId ?? payload.classId ?? "—",
                    averageScore: 0,
                    weakSubjects: [],
                    progress: [],
                },
            ]);
        }
        const { password: _password, ...safeUser } = user;
        res.status(201).json(safeUser);
    }
    catch {
        res.status(500).json({ message: "Не удалось создать пользователя" });
    }
});
exports.adminRoutes.patch("/users/:userId/password", (req, res) => {
    const userId = (req.params.userId ?? "").trim();
    if (!userId) {
        res.status(400).json({ message: "Нужно указать пользователя" });
        return;
    }
    const parsed = userPasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: parsed.error.flatten() });
        return;
    }
    const targetUser = storageService_1.storageService.getUserById(userId);
    if (!targetUser) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    try {
        const updated = storageService_1.storageService.updateUserPassword(userId, parsed.data.password);
        if (!updated) {
            res.status(404).json({ message: "Пользователь не найден" });
            return;
        }
        res.json({ message: "Пароль обновлён" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось обновить пароль";
        res.status(400).json({ message });
    }
});
exports.adminRoutes.delete("/users/:userId", (req, res) => {
    const userId = (req.params.userId ?? "").trim();
    if (!userId) {
        res.status(400).json({ message: "Нужно указать пользователя" });
        return;
    }
    const targetUser = storageService_1.storageService.getUserById(userId);
    if (!targetUser) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    if (req.user?.id === userId) {
        res.status(400).json({ message: "Нельзя удалить собственный аккаунт" });
        return;
    }
    if (targetUser.role === "admin") {
        const admins = storageService_1.storageService.getUsers().filter((user) => user.role === "admin");
        if (admins.length <= 1) {
            res.status(400).json({ message: "Нельзя удалить последнего администратора" });
            return;
        }
    }
    const deleted = storageService_1.storageService.deleteUserById(userId);
    if (!deleted) {
        res.status(404).json({ message: "Пользователь не найден" });
        return;
    }
    res.json({ message: "Аккаунт удалён" });
});
exports.adminRoutes.get("/classes", async (_req, res) => {
    const items = await analyticsService_1.analyticsService.getClassManagement();
    res.json({
        items,
    });
});
exports.adminRoutes.post("/classes", (req, res) => {
    const result = classSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
        return;
    }
    const { classId, teacherId } = result.data;
    const exists = storageService_1.storageService.getClassByClassId(classId);
    if (exists) {
        res.status(409).json({ message: "Такой класс уже существует" });
        return;
    }
    if (teacherId) {
        const teacher = storageService_1.storageService.getUserById(teacherId);
        if (!teacher || teacher.role !== "teacher") {
            res.status(400).json({ message: "Учитель не найден" });
            return;
        }
    }
    try {
        const created = storageService_1.storageService.createClass({ classId, teacherId: teacherId ?? null });
        res.status(201).json(created);
    }
    catch {
        res.status(500).json({ message: "Не удалось создать класс" });
    }
});
exports.adminRoutes.get("/schedule", (_req, res) => {
    res.json({
        items: scheduleStoreService_1.scheduleStoreService.listScheduleAll(),
        absences: scheduleStoreService_1.scheduleStoreService.listTeacherAbsences(),
    });
});
exports.adminRoutes.post("/schedule/generate", async (req, res) => {
    const result = scheduleGenerateSchema.safeParse(req.body ?? {});
    if (!result.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
        return;
    }
    try {
        const generated = await scheduleService_1.scheduleService.generateAndStore(result.data);
        res.status(201).json(generated);
    }
    catch {
        res.status(500).json({ message: "Не удалось собрать расписание" });
    }
});
exports.adminRoutes.get("/schedule/import-subjects", async (req, res) => {
    const parsed = scheduleSubjectsImportQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
        res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
        return;
    }
    try {
        const result = await bilimClassService_1.bilimClassService.importScheduleSubjects(parsed.data.classId);
        res.json(result);
    }
    catch {
        res.status(502).json({ message: "Не удалось импортировать предметы из BilimClass" });
    }
});
exports.adminRoutes.post("/schedule/teacher-absence", async (req, res) => {
    const result = teacherAbsenceSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
        return;
    }
    const teacher = storageService_1.storageService.getUserById(result.data.teacherId);
    if (!teacher || teacher.role !== "teacher") {
        res.status(400).json({ message: "Учитель не найден" });
        return;
    }
    try {
        const summary = await scheduleService_1.scheduleService.applyTeacherAbsence(result.data);
        res.status(201).json(summary);
    }
    catch {
        res.status(500).json({ message: "Не удалось обработать отсутствие учителя" });
    }
});
exports.adminRoutes.get("/content", (_req, res) => {
    res.json({ items: storageService_1.storageService.listEvents() });
});
exports.adminRoutes.post("/content", (req, res) => {
    const result = contentSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
        return;
    }
    try {
        const created = storageService_1.storageService.createEvent(result.data);
        notificationService_1.notificationService.create({
            type: "event",
            title: `Новое сообщение: ${created.title}`,
            message: created.description,
            targetRoles: created.targetRoles,
            targetClassIds: created.targetClassIds,
        });
        res.status(201).json(created);
    }
    catch {
        res.status(500).json({ message: "Не удалось создать публикацию" });
    }
});
