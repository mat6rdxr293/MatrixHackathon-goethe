import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { analyticsService } from "../services/analyticsService";
import { bilimClassService } from "../services/bilimClassService";
import { classReportService } from "../services/classReportService";
import { notificationService } from "../services/notificationService";
import { openAiMentorService } from "../services/openAiMentorService";
import { predictionService } from "../services/predictionService";
import { scheduleService } from "../services/scheduleService";
import { storageService } from "../services/storageService";
import { studentProfileService } from "../services/studentProfileService";
import { academicStoreService } from "../services/academicStoreService";

export const portalRoutes = Router();

portalRoutes.use(authMiddleware);

const aiChatSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(20)
    .optional(),
  context: z
    .object({
      mentorSummary: z.string().trim().max(3000).optional(),
      predictionsSummary: z.string().trim().max(3000).optional(),
      recommendationHints: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
      analytics: z
        .object({
          strengths: z.array(z.string().trim().min(1).max(160)).max(10).optional(),
          weaknesses: z.array(z.string().trim().min(1).max(160)).max(10).optional(),
          recommendations: z.array(z.string().trim().min(1).max(320)).max(10).optional(),
          trends: z
            .array(
              z.object({
                subject: z.string().trim().min(1).max(120),
                trend: z.number(),
              }),
            )
            .max(12)
            .optional(),
          prediction: z
            .object({
              overallRisk: z.number().min(0).max(100).optional(),
              topRiskMessage: z.string().trim().max(400).optional(),
              flags: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
              nextActions: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
            })
            .optional(),
          teacherTopRisks: z.array(z.string().trim().min(1).max(240)).max(8).optional(),
          adminTopRiskClasses: z.array(z.string().trim().min(1).max(240)).max(8).optional(),
        })
        .optional(),
    })
    .optional(),
});

const achievementSubmitSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(120),
  type: z.enum(["academic", "sport", "creative", "social"]),
  badge: z.string().trim().min(2).max(120).optional(),
  date: z.string().trim().min(6).max(40).optional(),
  points: z.number().int().min(1).max(500).optional(),
  proofUrl: z.string().trim().url().max(512).optional(),
  proofNote: z.string().trim().max(2000).optional(),
  proofAttachment: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(120),
      dataUrl: z.string().trim().startsWith("data:").max(3_000_000),
    })
    .optional(),
});

const achievementVerifySchema = z.object({
  method: z.string().trim().max(80).optional(),
  evidence: z.string().trim().max(500).optional(),
});

const bilimBindingSchema = z.object({
  login: z.string().trim().min(3).max(160),
  password: z.string().min(3).max(160),
  schoolId: z.number().int().positive().optional(),
  groupId: z.number().int().positive().optional(),
  eduYear: z.number().int().positive().optional(),
  period: z.number().int().positive().optional(),
  periodType: z.string().trim().min(1).max(40).optional(),
});

const summarizePredictions = (payload: Awaited<ReturnType<typeof predictionService.getPredictionsByRole>>) => {
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

portalRoutes.get("/dashboard", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const dashboard = await analyticsService.getDashboardByRole(req.user);
  res.json(dashboard);
});

portalRoutes.get("/progress", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const progress = await analyticsService.getProgress(req.user);
  res.json(progress);
});

portalRoutes.get("/achievements", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const achievements = await analyticsService.getAchievements(req.user);
  res.json(achievements);
});

portalRoutes.post("/achievements", async (req, res) => {
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
  } else if (req.user.role === "parent") {
    if (!req.user.linkedStudentId) {
      res.status(400).json({ message: "Для этой роли нужно указать связанного ученика" });
      return;
    }
    studentId = req.user.linkedStudentId;
  } else {
    if (!payload.studentId) {
      res.status(400).json({ message: "Нужно указать ученика" });
      return;
    }
    studentId = payload.studentId;
  }

  const created = academicStoreService.createAchievement({
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

portalRoutes.post("/achievements/:achievementId/verify", async (req, res) => {
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
    const verified = academicStoreService.verifyAchievement({
      achievementId,
      verifiedBy: req.user.name,
      method: parsed.data.method,
      evidence: parsed.data.evidence,
    });
    res.json({ item: verified });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подтвердить достижение";
    const status = message === "Achievement not found" ? 404 : 500;
    res.status(status).json({ message });
  }
});

portalRoutes.get("/events", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const feed = await analyticsService.getEvents(req.user);
  res.json(feed);
});

portalRoutes.get("/profile/bilimclass", (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }

  const binding = storageService.getBilimBinding(req.user.id);
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

portalRoutes.put("/profile/bilimclass", async (req, res) => {
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
  const verification = await bilimClassService.verifyCredentials(login, password);

  if (!verification.ok) {
    res.status(400).json({
      message: verification.error ?? "Не удалось подключить аккаунт BilimClass",
    });
    return;
  }

  const binding = storageService.setBilimBinding(req.user.id, {
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

portalRoutes.delete("/profile/bilimclass", (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }

  const binding = storageService.clearBilimBinding(req.user.id);
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

portalRoutes.get("/ai-mentor", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  try {
    const aiMentorData = await analyticsService.getAiMentor(req.user);
    res.json(aiMentorData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить AI-анализ";
    res.status(502).json({ message });
  }
});

portalRoutes.post("/ai-chat", async (req, res) => {
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
    const mentorData = await analyticsService.getAiMentor(req.user);
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
    const predictions = await predictionService.getPredictionsByRole(req.user);
    predictionsSummary = predictionsSummary ?? summarizePredictions(predictions);
    if (!analyticsContext?.prediction) {
      const nextContext = { ...(analyticsContext ?? {}) } as NonNullable<typeof analyticsContext>;
      if (predictions.role === "student" || predictions.role === "parent") {
        if (predictions.prediction) {
          nextContext.prediction = {
            overallRisk: predictions.prediction.overallRisk,
            topRiskMessage: predictions.prediction.topRiskMessage,
            flags: predictions.prediction.flags,
            nextActions: predictions.prediction.nextActions,
          };
        }
      } else if (predictions.role === "teacher") {
        nextContext.teacherTopRisks = predictions.students
          .slice(0, 5)
          .map((item) => `${item.fullName} (${item.classId}) — ${item.probability}%`);
      } else {
        nextContext.adminTopRiskClasses = (predictions.classRadar ?? [])
          .slice(0, 5)
          .map((item) => `${item.classId}: ${item.averageRisk}% (${item.highRiskStudents}/${item.totalStudents})`);
      }
      analyticsContext = nextContext;
    }
  }

  try {
    const aiReply = await openAiMentorService.generateChatReply({
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
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Не удалось получить ответ AI-чата";
    res.status(502).json({ message: messageText });
  }
});

portalRoutes.get("/kiosk", async (_req, res) => {
  const kiosk = await analyticsService.getKioskData();
  const scheduleUpdates = await scheduleService.getScheduleForKiosk();
  res.json({
    ...kiosk,
    scheduleUpdates,
  });
});

portalRoutes.get("/schedule", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const items = await scheduleService.getScheduleForUser(req.user);
  res.json({ items });
});

portalRoutes.get("/notifications", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const classIdOverride =
    req.user.role === "parent" && req.user.linkedStudentId
      ? (await bilimClassService.getStudentProfiles()).find(
          (student) => student.studentId === req.user?.linkedStudentId,
        )?.classId
      : null;
  const items = notificationService.listForUser(req.user, classIdOverride);
  res.json({ items });
});

portalRoutes.get("/predictions", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const payload = await predictionService.getPredictionsByRole(req.user);
  res.json(payload);
});

portalRoutes.get("/teacher/class-report", async (req, res) => {
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

  const fallbackTeacherClass =
    req.user.role === "teacher"
      ? storageService.listClasses().find((item) => item.teacherId === req.user?.id)?.classId
      : undefined;

  const classId = normalizedClassId || fallbackTeacherClass;
  if (!classId) {
    res.status(400).json({ message: "Нужно указать класс" });
    return;
  }

  const profiles = await bilimClassService.getStudentProfiles();
  try {
    const report = await classReportService.buildClassReport(classId, profiles, req.user.name);
    if (!report) {
      res.status(404).json({ message: "Класс не найден в профилях учеников" });
      return;
    }

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сгенерировать отчет класса";
    res.status(502).json({ message });
  }
});

portalRoutes.get("/integrations/bilimclass/status", (_req, res) => {
  res.json(bilimClassService.status());
});

portalRoutes.get("/integrations/bilimclass/students", async (_req, res) => {
  const profiles = await bilimClassService.getStudentProfiles();
  res.json({ students: profiles });
});

portalRoutes.get("/student-profiles/:studentId", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }

  const result = await studentProfileService.getCard(req.params.studentId ?? "", req.user);
  if (!result) {
    res.status(404).json({ message: "Профиль ученика не найден" });
    return;
  }

  res.json(result);
});


