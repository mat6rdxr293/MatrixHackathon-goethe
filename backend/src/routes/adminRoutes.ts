import { Router } from "express";
import { z } from "zod";
import { authMiddleware, requireRoles } from "../middleware/auth";
import { analyticsService } from "../services/analyticsService";
import { notificationService } from "../services/notificationService";
import { scheduleService } from "../services/scheduleService";
import { scheduleStoreService } from "../services/scheduleStoreService";
import { storageService } from "../services/storageService";

const contentSchema = z.object({
  type: z.enum(["news", "event", "announcement"]),
  title: z.string().min(4),
  description: z.string().min(8),
  date: z.string(),
  important: z.boolean().optional(),
  targetRoles: z.array(z.enum(["student", "teacher", "parent", "admin"])).optional(),
  targetClassIds: z.array(z.string().trim().min(2).max(12)).optional(),
});

const classSchema = z.object({
  classId: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[\p{L}\d-]+$/u),
  teacherId: z.string().trim().min(1).optional().nullable(),
});

const userSchema = z.object({
  role: z.enum(["student", "teacher", "parent", "admin"]),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().trim().min(2),
  classId: z.string().trim().min(2).max(12).optional(),
  linkedStudentId: z.string().trim().min(2).optional(),
});

const lessonRequirementSchema = z.object({
  classId: z.string().trim().min(2).max(12),
  subject: z.string().trim().min(2),
  weeklyHours: z.number().int().min(1).max(10),
  teacherId: z.string().trim().min(2),
  room: z.string().trim().min(1),
  kind: z.enum(["lesson", "pair", "academic-hour", "stream", "event"]).optional(),
  duration: z.number().int().min(1).max(2).optional(),
});

const streamGroupSchema = z.object({
  groupName: z.string().trim().min(2),
  classIds: z.array(z.string().trim().min(2).max(12)).min(1),
  subject: z.string().trim().min(2),
  teacherId: z.string().trim().min(2),
  room: z.string().trim().min(1),
  weeklyHours: z.number().int().min(1).max(8),
  duration: z.number().int().min(1).max(2).optional(),
});

const plannerWeightsSchema = z
  .object({
    classDailyLoad: z.number().min(0).max(3),
    teacherDailyLoad: z.number().min(0).max(3),
    sameSubjectDay: z.number().min(0).max(3),
    classGap: z.number().min(0).max(3),
    teacherGap: z.number().min(0).max(3),
    lateLessons: z.number().min(0).max(3),
    classSpread: z.number().min(0).max(3),
    teacherSpread: z.number().min(0).max(3),
    centerBias: z.number().min(0).max(3),
    adjacentSameSubject: z.number().min(0).max(3),
  })
  .partial();

const scheduleGenerateSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  slotsPerDay: z.number().int().min(4).max(10).optional(),
  lessonRequirements: z.array(lessonRequirementSchema).optional(),
  streams: z
    .array(
      z.object({
        streamId: z.string().trim().min(2),
        name: z.string().trim().min(2),
        groups: z.array(streamGroupSchema).min(1),
      }),
    )
    .optional(),
  teacherBusy: z
    .array(
      z.object({
        teacherId: z.string().trim().min(2),
        day: z.number().int().min(1).max(7),
        slot: z.number().int().min(1).max(12),
      }),
    )
    .optional(),
  weights: plannerWeightsSchema.optional(),
});

const teacherAbsenceSchema = z.object({
  teacherId: z.string().trim().min(2),
  date: z.string().trim().min(4),
  day: z.number().int().min(1).max(7),
  slots: z.array(z.number().int().min(1).max(12)).min(1),
  reason: z.string().trim().min(2).optional(),
});

export const adminRoutes = Router();

adminRoutes.use(authMiddleware, requireRoles(["admin"]));

adminRoutes.get("/analytics", async (_req, res) => {
  const analytics = await analyticsService.getAdminAnalytics();
  res.json(analytics);
});

adminRoutes.get("/users", (_req, res) => {
  res.json({
    roles: analyticsService.listRoles(),
    users: analyticsService.listUsers(),
  });
});

adminRoutes.post("/users", (req, res) => {
  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
    return;
  }

  const payload = result.data;
  const emailTaken = storageService.getUserByEmail(payload.email.toLowerCase());
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
    const schoolClass = storageService.getClassByClassId(payload.classId);
    if (!schoolClass) {
      res.status(400).json({ message: "Такого класса нет" });
      return;
    }
  }

  try {
    const user = storageService.createUser(payload);

    if (payload.role === "teacher" && payload.classId) {
      storageService.assignTeacherToClass(payload.classId, user.id);
    }

    const { password: _password, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch {
    res.status(500).json({ message: "Не удалось создать пользователя" });
  }
});

adminRoutes.get("/classes", async (_req, res) => {
  const items = await analyticsService.getClassManagement();
  res.json({
    items,
  });
});

adminRoutes.post("/classes", (req, res) => {
  const result = classSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
    return;
  }

  const { classId, teacherId } = result.data;
  const exists = storageService.getClassByClassId(classId);
  if (exists) {
    res.status(409).json({ message: "Такой класс уже существует" });
    return;
  }

  if (teacherId) {
    const teacher = storageService.getUserById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      res.status(400).json({ message: "Учитель не найден" });
      return;
    }
  }

  try {
    const created = storageService.createClass({ classId, teacherId: teacherId ?? null });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ message: "Не удалось создать класс" });
  }
});

adminRoutes.get("/schedule", (_req, res) => {
  res.json({
    items: scheduleStoreService.listScheduleAll(),
    absences: scheduleStoreService.listTeacherAbsences(),
  });
});

adminRoutes.post("/schedule/generate", async (req, res) => {
  const result = scheduleGenerateSchema.safeParse(req.body ?? {});
  if (!result.success) {
    res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
    return;
  }

  try {
    const generated = await scheduleService.generateAndStore(result.data);
    res.status(201).json(generated);
  } catch {
    res.status(500).json({ message: "Не удалось собрать расписание" });
  }
});

adminRoutes.post("/schedule/teacher-absence", async (req, res) => {
  const result = teacherAbsenceSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
    return;
  }

  const teacher = storageService.getUserById(result.data.teacherId);
  if (!teacher || teacher.role !== "teacher") {
    res.status(400).json({ message: "Учитель не найден" });
    return;
  }

  try {
    const summary = await scheduleService.applyTeacherAbsence(result.data);
    res.status(201).json(summary);
  } catch {
    res.status(500).json({ message: "Не удалось обработать отсутствие учителя" });
  }
});

adminRoutes.get("/content", (_req, res) => {
  res.json({ items: storageService.listEvents() });
});

adminRoutes.post("/content", (req, res) => {
  const result = contentSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Неверные данные запроса", errors: result.error.flatten() });
    return;
  }

  try {
    const created = storageService.createEvent(result.data);
    notificationService.create({
      type: "event",
      title: `Новое сообщение: ${created.title}`,
      message: created.description,
      targetRoles: created.targetRoles,
      targetClassIds: created.targetClassIds,
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ message: "Не удалось создать публикацию" });
  }
});
