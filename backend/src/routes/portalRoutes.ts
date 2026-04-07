import { Router } from "express";
import jwt from "jsonwebtoken";
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
          journal: z
            .object({
              selected: z
                .object({
                  eduYear: z.number().int().positive().optional(),
                  period: z.number().int().positive().optional(),
                  periodType: z.string().trim().min(1).max(40).optional(),
                })
                .optional(),
              source: z.enum(["bilimclass", "cache", "empty"]).optional(),
              subjects: z.number().int().min(0).optional(),
              grades: z.number().int().min(0).optional(),
              topSubjects: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
              recentGrades: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
              lastSyncAt: z.string().trim().max(80).nullable().optional(),
            })
            .optional(),
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

const journalQuerySchema = z.object({
  eduYear: z.coerce.number().int().positive().optional(),
  period: z.coerce.number().int().positive().optional(),
  periodType: z.string().trim().min(1).max(40).optional(),
  lang: z.enum(["ru", "kk"]).optional(),
});

const aiMentorQuerySchema = z.object({
  eduYear: z.coerce.number().int().positive().optional(),
  period: z.coerce.number().int().positive().optional(),
  periodType: z.string().trim().min(1).max(40).optional(),
  lang: z.enum(["ru", "kk"]).optional(),
});

const localizedLangQuerySchema = z.object({
  lang: z.enum(["ru", "kk"]).optional(),
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

const summarizeJournalForChat = (
  journal: Awaited<ReturnType<typeof bilimClassService.getStudentJournal>>,
) => {
  const topSubjects = journal.subjects
    .slice(0, 3)
    .map((item) =>
      `${item.subjectName}: ${item.averageScore !== null ? item.averageScore.toFixed(2) : "нет среднего"} (${item.gradesCount})`,
    );

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
  const parsed = localizedLangQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
    return;
  }
  const progress = await analyticsService.getProgress(req.user, parsed.data.lang ?? "ru");
  res.json(progress);
});

portalRoutes.get("/journal", async (req, res) => {
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
    const journal = await bilimClassService.getStudentJournal(req.user, scope, lang);
    res.json(journal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить журнал ученика";
    res.status(502).json({ message });
  }
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
  const parsed = aiMentorQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Неверные параметры запроса", errors: parsed.error.flatten() });
    return;
  }
  try {
    const { lang = "ru", ...scope } = parsed.data;
    const aiMentorData = await analyticsService.getAiMentor(req.user, scope, lang);
    res.json(aiMentorData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ИИ-анализ";
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

  if (req.user.role === "student" || req.user.role === "parent") {
    try {
      const journal = await bilimClassService.getStudentJournal(req.user, undefined, "ru");
      const nextContext = { ...(analyticsContext ?? {}) } as NonNullable<typeof analyticsContext> & {
        journal?: ReturnType<typeof summarizeJournalForChat>;
      };
      nextContext.journal = summarizeJournalForChat(journal);
      analyticsContext = nextContext;
    } catch {
      // Keep chat working even if journal sync/cache is unavailable.
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

// ─── Subject Practice ─────────────────────────────────────────────────────────

const subjectPracticeSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  mode: z.enum(["hint", "check", "solution"]),
  problem: z.string().trim().min(1).max(2000),
  studentAttempt: z.string().trim().max(2000).optional(),
  taskId: z.coerce.number().int().min(1).optional(),
});

const subjectSessionSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  taskId: z.coerce.number().int().min(1),
  score: z.number().min(0).max(100),
  timeSpentSeconds: z.number().int().min(0).optional(),
});

const subjectPracticeOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(300),
});

const subjectPracticePairSchema = z.object({
  leftId: z.string().trim().min(1).max(80),
  rightId: z.string().trim().min(1).max(80),
});

const subjectPracticeQuestionPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single_choice"),
    prompt: z.string().trim().min(5).max(1200),
    explanation: z.string().trim().max(1200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    options: z.array(subjectPracticeOptionSchema).min(2).max(10),
    correctOptionId: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("multiple_choice"),
    prompt: z.string().trim().min(5).max(1200),
    explanation: z.string().trim().max(1200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    options: z.array(subjectPracticeOptionSchema).min(2).max(12),
    correctOptionIds: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  }),
  z.object({
    type: z.literal("short_answer"),
    prompt: z.string().trim().min(5).max(1200),
    explanation: z.string().trim().max(1200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    acceptedAnswers: z.array(z.string().trim().min(1).max(180)).min(1).max(20),
  }),
  z.object({
    type: z.literal("matching"),
    prompt: z.string().trim().min(5).max(1200),
    explanation: z.string().trim().max(1200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    leftItems: z.array(subjectPracticeOptionSchema).min(2).max(12),
    rightItems: z.array(subjectPracticeOptionSchema).min(2).max(12),
    correctPairs: z.array(subjectPracticePairSchema).min(1).max(20),
  }),
  z.object({
    type: z.literal("ordering"),
    prompt: z.string().trim().min(5).max(1200),
    explanation: z.string().trim().max(1200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    items: z.array(subjectPracticeOptionSchema).min(2).max(12),
    correctOrder: z.array(z.string().trim().min(1).max(80)).min(2).max(12),
  }),
]);

const subjectPracticeSubmissionSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(80),
        answer: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("single_choice"),
            optionId: z.string().trim().min(1).max(80),
          }),
          z.object({
            type: z.literal("multiple_choice"),
            optionIds: z.array(z.string().trim().min(1).max(80)).max(40),
          }),
          z.object({
            type: z.literal("short_answer"),
            text: z.string().trim().max(500),
          }),
          z.object({
            type: z.literal("matching"),
            pairs: z.array(subjectPracticePairSchema).max(30),
          }),
          z.object({
            type: z.literal("ordering"),
            order: z.array(z.string().trim().min(1).max(80)).max(20),
          }),
        ]),
      }),
    )
    .max(200),
});

const subjectPathParamSchema = z.object({
  subject: z.string().trim().min(1).max(80),
});

const questionPathParamSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  questionId: z.string().trim().min(1).max(80),
});

portalRoutes.get("/subject-practice/questions/:subject", (req, res) => {
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
  const items = academicStoreService.listSubjectPracticeQuestions(parsed.data.subject, includeAnswers);
  res.json({ items });
});

portalRoutes.post("/subject-practice/questions/submit", (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }

  const parsed = subjectPracticeSubmissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Неверные данные ответа", errors: parsed.error.flatten() });
    return;
  }

  const result = academicStoreService.evaluateSubjectPracticeSubmission(parsed.data);
  res.json(result);
});

portalRoutes.post("/subject-practice/questions/:subject", (req, res) => {
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
    const item = academicStoreService.createSubjectPracticeQuestion({
      subject: paramsParsed.data.subject,
      question: payloadParsed.data,
      createdBy: req.user.name,
    });
    res.status(201).json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать вопрос";
    res.status(400).json({ message });
  }
});

portalRoutes.put("/subject-practice/questions/:subject/:questionId", (req, res) => {
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
    const item = academicStoreService.updateSubjectPracticeQuestion({
      subject: paramsParsed.data.subject,
      questionId: paramsParsed.data.questionId,
      question: payloadParsed.data,
    });
    res.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить вопрос";
    res.status(message === "Question not found" ? 404 : 400).json({ message });
  }
});

portalRoutes.delete("/subject-practice/questions/:subject/:questionId", (req, res) => {
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

  const removed = academicStoreService.deleteSubjectPracticeQuestion(
    paramsParsed.data.subject,
    paramsParsed.data.questionId,
  );
  if (!removed) {
    res.status(404).json({ message: "Вопрос не найден" });
    return;
  }
  res.json({ ok: true });
});

portalRoutes.post("/subject-practice/ai", async (req, res) => {
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
  const userMessage =
    mode === "hint"
      ? `Дай ${modeLabel} для задачи без решения:\n${problem}`
      : mode === "check"
        ? `Проверь решение ученика. Задача: ${problem}\nРешение ученика: ${studentAttempt ?? "(нет)"}\nНапиши процент выполнения в формате "Выполнено: X%".`
        : `Дай ${modeLabel} для задачи:\n${problem}`;

  try {
    const aiReply = await openAiMentorService.generateChatReply({
      role: req.user.role,
      userName: req.user.name,
      message: userMessage,
      history: [],
      context: { mentorSummary: systemPrompt, recommendationHints: [] },
    });
    res.json({ text: aiReply.reply, mode: aiReply.mode });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Ошибка AI-ответа";
    res.status(502).json({ message: messageText });
  }
});

portalRoutes.post("/subject-practice/session", (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const parsed = subjectSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Неверные данные", errors: parsed.error.flatten() });
    return;
  }
  const studentId =
    req.user.role === "student" ? (req.user.linkedStudentId ?? req.user.id) : req.user.id;
  academicStoreService.recordSubjectSession({
    studentId,
    subject: parsed.data.subject,
    taskId: parsed.data.taskId,
    score: parsed.data.score,
    timeSpentSeconds: parsed.data.timeSpentSeconds ?? 0,
  });
  res.json({ ok: true });
});

portalRoutes.get("/subject-practice/sessions", (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  const studentId =
    req.user.role === "student" ? (req.user.linkedStudentId ?? req.user.id) : req.user.id;
  const items = academicStoreService.listSubjectSessions(studentId);
  res.json({ items });
});

// ── Practice Module auth token ──────────────────────────────────────────────
// Issues a short-lived signed JWT so the practice module can verify the role
// without trusting a plain URL parameter.
portalRoutes.get("/practice-token", (req, res) => {
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
  const token = jwt.sign(payload, secret, { expiresIn: "5m", algorithm: "HS256" });
  res.json({ token });
});


