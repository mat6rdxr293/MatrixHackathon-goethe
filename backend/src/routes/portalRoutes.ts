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

portalRoutes.get("/events", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const feed = await analyticsService.getEvents(req.user);
  res.json(feed);
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

  const { message, history } = parsed.data;
  const [mentorData, predictions] = await Promise.all([
    analyticsService.getAiMentor(req.user),
    predictionService.getPredictionsByRole(req.user),
  ]);

  const mentorSummary = mentorData.summary;
  const predictionsSummary = summarizePredictions(predictions);
  try {
    const aiReply = await openAiMentorService.generateChatReply({
      role: req.user.role,
      userName: req.user.name,
      message,
      history,
      context: {
        mentorSummary,
        predictionsSummary,
        recommendationHints: mentorData.recommendations?.slice(0, 3),
      },
    });

    res.json({
      reply: aiReply,
      source: "openai",
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

  const result = await studentProfileService.getCard(req.params.studentId ?? "");
  if (!result) {
    res.status(404).json({ message: "Профиль ученика не найден" });
    return;
  }

  res.json(result);
});


