import {
  Achievement,
  ClassOverview,
  ManagedClass,
  Role,
  StudentProfile,
  User,
} from "../types";
import {
  buildParentSummaryInput,
  buildTeacherClassSummaryInput,
  calculateStudentRisk,
  getRiskLevelLabel,
  summarizeStudentPerformance,
} from "../analytics/risk/studentRisk";
import { aggregateSchoolRisk, buildExplainabilityDrivers } from "../analytics/summaries";
import { academicStoreService } from "./academicStoreService";
import { bilimClassService } from "./bilimClassService";
import { generateLLMSummaryFromStructuredData } from "./llm/llmSummaryService";
import { storageService } from "./storageService";

type SafeUser = Omit<User, "password">;

const listProfiles = async () => bilimClassService.getStudentProfiles();
const listAchievements = () => academicStoreService.listAchievements();
const users = () => storageService.getUsers();
const events = () => storageService.listEvents();

const adminQuickLinks = () => [
  { id: "q-1", title: "Добавить публикацию", href: "/admin/content" },
  { id: "q-2", title: "Собрать расписание", href: "/admin/schedule" },
  { id: "q-3", title: "Пользователи и роли", href: "/admin/users" },
  { id: "q-4", title: "Стенгазета", href: "/kiosk" },
];

const fullNameByStudent = (profiles: StudentProfile[], studentId: string) =>
  profiles.find((student) => student.studentId === studentId)?.fullName ?? "Неизвестный ученик";

const leaderboard = (profiles: StudentProfile[]) =>
  [...profiles]
    .sort((a, b) => b.averageScore - a.averageScore)
    .map((student, index) => ({
      rank: index + 1,
      studentId: student.studentId,
      name: student.fullName,
      averageScore: student.averageScore,
    }));

const calculatePeriodDelta = (profile: StudentProfile) => {
  const deltas = profile.progress
    .map((item) => {
      if (item.history.length >= 2) {
        const last = item.history[item.history.length - 1];
        const prev = item.history[item.history.length - 2];
        return Number((last.score - prev.score).toFixed(2));
      }
      return Number(item.trend.toFixed(2));
    })
    .filter((item) => Number.isFinite(item));

  if (deltas.length === 0) {
    return 0;
  }

  const avg = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return Number(avg.toFixed(2));
};

const withAchievementVerification = (profiles: StudentProfile[], achievements: Achievement[]) => {
  const teacherById = new Map(users().filter((user) => user.role === "teacher").map((user) => [user.id, user.name]));
  const teacherByClass = new Map(
    storageService
      .listClasses()
      .map((schoolClass) => [schoolClass.classId, schoolClass.teacherId ? teacherById.get(schoolClass.teacherId) : undefined]),
  );

  return achievements.map((achievement) => {
    const profile = profiles.find((student) => student.studentId === achievement.studentId);
    const teacherName = profile ? teacherByClass.get(profile.classId) : undefined;
    if (achievement.verification?.status) {
      if (achievement.verification.status === "verified" && !achievement.verification.verifiedBy) {
        return {
          ...achievement,
          verification: {
            ...achievement.verification,
            verifiedBy: teacherName ?? "Куратор",
          },
        };
      }
      return achievement;
    }

    const parsedDate = Date.parse(achievement.date);
    const ageHours = Number.isFinite(parsedDate) ? (Date.now() - parsedDate) / (1000 * 60 * 60) : 999;
    const isVerified = ageHours >= 24;

    return {
      ...achievement,
      verification: isVerified
        ? {
            status: "verified" as const,
            verifiedAt: Number.isFinite(parsedDate)
              ? new Date(parsedDate + 10 * 60 * 60 * 1000).toISOString()
              : new Date().toISOString(),
            verifiedBy: teacherName ?? "Куратор",
            method: "journal-check",
            evidence: `${achievement.title} / ${achievement.badge}`,
          }
        : {
            status: "pending" as const,
            method: "awaiting-review",
            evidence: achievement.badge,
          },
    };
  });
};

const classOverviewFromManagedClass = (
  item: ManagedClass,
  profiles: StudentProfile[],
): ClassOverview => {
  const classStudents = profiles.filter((student) => student.classId === item.classId);
  const avgScore =
    classStudents.length > 0
      ? classStudents.reduce((sum, student) => sum + student.averageScore, 0) / classStudents.length
      : 0;
  const riskStudents = classStudents
    .map((student) =>
      calculateStudentRisk({
        profile: student,
        analysisPreset: "risk",
      }),
    )
    .filter((student) => student.riskLevel !== "low")
    .map((student) => student.studentId);

  return {
    classId: item.classId,
    teacherId: item.teacherId ?? "",
    avgScore: +avgScore.toFixed(2),
    riskStudents,
  };
};

const classOverviews = (profiles: StudentProfile[]) =>
  storageService.listClasses().map((item) => classOverviewFromManagedClass(item, profiles));

const classSummaries = (teacherId: string, profiles: StudentProfile[]) => {
  const classes = classOverviews(profiles).filter((classInfo) => classInfo.teacherId === teacherId);
  return classes.map((classInfo) => ({
    classId: classInfo.classId,
    averageScore: classInfo.avgScore,
    riskStudents: classInfo.riskStudents.map((studentId) => ({
      studentId,
      name: fullNameByStudent(profiles, studentId),
    })),
  }));
};

const getLinkedStudent = (user: SafeUser, profiles: StudentProfile[]) => {
  const studentId =
    user.role === "student"
      ? user.linkedStudentId ?? user.id
      : user.role === "parent"
        ? user.linkedStudentId
        : undefined;

  if (!studentId) {
    return undefined;
  }

  const existing = profiles.find((student) => student.studentId === studentId);
  if (existing) {
    return existing;
  }

  if (user.role === "student" || user.role === "parent") {
    const sourceUser = user.role === "student" ? storageService.getUserById(user.id) : undefined;
    return {
      studentId,
      fullName: sourceUser?.name ?? user.name ?? "Ученик",
      classId: sourceUser?.classId ?? user.classId ?? "—",
      averageScore: 0,
      weakSubjects: [],
      progress: [],
    };
  }

  return undefined;
};

const averageScore = (profiles: StudentProfile[]) => {
  if (profiles.length === 0) {
    return 0;
  }
  return profiles.reduce((sum, student) => sum + student.averageScore, 0) / profiles.length;
};

const buildTeacherEfficiency = (
  classes: { classId: string; averageScore: number; riskStudents: { studentId: string; name: string }[] }[],
) => {
  const riskStudents = classes.reduce((sum, item) => sum + item.riskStudents.length, 0);
  const weeklyHoursSaved = Math.max(1, Math.round(classes.length * 1.8 + riskStudents * 0.35));
  const automatedActions = Math.max(1, Math.round(classes.length * 2 + riskStudents * 0.6));
  const recommendedActions = Math.max(1, riskStudents);
  const focusClasses = [...classes]
    .sort(
      (a, b) =>
        b.riskStudents.length - a.riskStudents.length ||
        a.averageScore - b.averageScore ||
        a.classId.localeCompare(b.classId),
    )
    .slice(0, 3)
    .map((item) => item.classId);

  return {
    weeklyHoursSaved,
    automatedActions,
    recommendedActions,
    focusClasses,
  };
};

const eventsForUser = (user: SafeUser, profiles: StudentProfile[]) =>
  events().filter((item) => {
    const targetRoles = item.targetRoles ?? [];
    const targetClasses = item.targetClassIds ?? [];

    const roleAllowed = targetRoles.length === 0 || targetRoles.includes(user.role);

    const linkedClassId =
      user.role === "parent"
        ? profiles.find((student) => student.studentId === user.linkedStudentId)?.classId
        : user.classId;

    const classAllowed =
      targetClasses.length === 0 ||
      (typeof linkedClassId === "string" && targetClasses.includes(linkedClassId));

    return roleAllowed && classAllowed;
  });

const buildSchoolHighlights = (profiles: StudentProfile[], achievementsCount: number, feedCount: number) => {
  const classCount = new Set(profiles.map((item) => item.classId)).size;
  const riskCount = profiles
    .map((profile) => calculateStudentRisk({ profile, analysisPreset: "risk" }))
    .filter((item) => item.riskLevel !== "low").length;

  return [
    `В аналитике ${profiles.length} учеников из ${classCount} классов`,
    `В цифровом портфолио ${achievementsCount} достижений`,
    `В ленте школы ${feedCount} публикаций, учеников в зоне риска: ${riskCount}`,
  ];
};

const mapMentorOutput = (
  role: Role,
  payload: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    trends?: { subject: string; trend: number }[];
    mode: "openai" | "local" | "demo";
    explainability: {
      confidence: number;
      drivers: string[];
      source: string;
    };
  },
) => ({
  role,
  summary: payload.summary,
  strengths: payload.strengths,
  weaknesses: payload.weaknesses,
  recommendations: payload.recommendations,
  trends: payload.trends,
  mode: payload.mode,
  explainability: payload.explainability,
});

export const analyticsService = {
  async getDashboardByRole(user: SafeUser) {
    const profiles = await listProfiles();
    const achievements = withAchievementVerification(profiles, listAchievements());

    if (user.role === "student") {
      const profile = getLinkedStudent(user, profiles);
      if (!profile) {
        return { message: "Профиль ученика не найден" };
      }

      const risk = calculateStudentRisk({ profile, analysisPreset: "balanced" });
      const performance = summarizeStudentPerformance({ profile, analysisPreset: "balanced" }, risk);

      return {
        role: user.role,
        greeting: `С возвращением, ${user.name}`,
        averageScore: profile.averageScore,
        periodDelta: performance.trendValue,
        weakSubjects: risk.weakestSubjects,
        achievements: achievements.filter((item) => item.studentId === profile.studentId),
        events: eventsForUser(user, profiles),
        aiRecommendation: risk.recommendationsSeed[0] ?? "Продолжай работать в стабильном учебном темпе.",
        quickActions: ["Открыть мой прогресс", "Посмотреть разбор ИИ", "Проверить ближайшие события"],
      };
    }

    if (user.role === "parent") {
      const profile = getLinkedStudent(user, profiles);
      if (!profile) {
        return { message: "Профиль ребенка не найден" };
      }

      const risk = calculateStudentRisk({ profile, analysisPreset: "balanced" });
      const parentSummary = buildParentSummaryInput(risk);

      return {
        role: user.role,
        child: profile.fullName,
        averageScore: profile.averageScore,
        dynamicTrend: profile.progress.map((item) => ({
          subject: item.subject,
          current: item.current,
          trend: item.trend,
        })),
        achievements: achievements.filter((item) => item.studentId === profile.studentId),
        events: eventsForUser(user, profiles),
        aiSummary: `${profile.fullName}: уровень риска ${risk.riskLevel}, score ${risk.riskScore}/100.`,
        weeklySummary: {
          periodLabel: "week",
          delta: calculatePeriodDelta(profile),
          wins: parentSummary.wins,
          risks: parentSummary.risks,
          plan: parentSummary.weeklyPlan,
        },
      };
    }

    if (user.role === "teacher") {
      const classes = classSummaries(user.id, profiles);
      const teacherEfficiency = buildTeacherEfficiency(classes);
      const riskStudentMap = new Map<string, { studentId: string; name: string }>();
      for (const riskStudent of classes.flatMap((item) => item.riskStudents)) {
        riskStudentMap.set(riskStudent.studentId, riskStudent);
      }

      const classAnalytics = classes.map((item) => {
        const students = profiles
          .filter((profile) => profile.classId === item.classId)
          .map((profile) => calculateStudentRisk({ profile, analysisPreset: "risk" }));
        return buildTeacherClassSummaryInput(item.classId, students);
      });

      const topClass = [...classAnalytics].sort((a, b) => b.highRiskStudents - a.highRiskStudents)[0];

      return {
        role: user.role,
        classes,
        averageByClass: classes.map((item) => ({
          classId: item.classId,
          averageScore: item.averageScore,
        })),
        riskStudents: [...riskStudentMap.values()],
        studentAchievements: achievements,
        events: eventsForUser(user, profiles),
        aiSummary: topClass
          ? `Главная зона внимания: ${topClass.classId} (${topClass.highRiskStudents} учеников в high risk).`
          : "Критичных зон внимания по классам не обнаружено.",
        teacherEfficiency,
      };
    }

    const schoolAverage = averageScore(profiles);
    const overview = classOverviews(profiles);
    const topClasses = [...overview]
      .sort((a, b) => b.avgScore - a.avgScore)
      .map((item) => item.classId);

    return {
      role: user.role,
      schoolAverage: +schoolAverage.toFixed(2),
      topClasses,
      riskyClasses: overview
        .filter((classInfo) => classInfo.riskStudents.length > 0)
        .map((classInfo) => classInfo.classId),
      totalEvents: events().length,
      newAchievements: achievements.length,
      quickLinks: adminQuickLinks(),
    };
  },

  async getProgress(user: SafeUser) {
    const profiles = await listProfiles();

    if (user.role === "teacher") {
      return {
        role: user.role,
        classes: classSummaries(user.id, profiles),
      };
    }

    if (user.role === "admin") {
      return {
        role: user.role,
        byClass: classOverviews(profiles),
      };
    }

    const profile = getLinkedStudent(user, profiles);
    return {
      role: user.role,
      student: profile ?? null,
      periodSwitch: ["Месяц", "Четверть", "Год"],
    };
  },

  async getAchievements(user: SafeUser) {
    const profiles = await listProfiles();
    const achievements = withAchievementVerification(profiles, listAchievements());
    const board = leaderboard(profiles);

    if (user.role === "student") {
      const profile = getLinkedStudent(user, profiles);
      return {
        role: user.role,
        items: achievements.filter((item) => item.studentId === (profile?.studentId ?? user.id)),
        leaderboard: board,
      };
    }

    if (user.role === "parent") {
      return {
        role: user.role,
        items: achievements.filter((item) => item.studentId === user.linkedStudentId),
        leaderboard: board,
      };
    }

    return {
      role: user.role,
      items: achievements,
      leaderboard: board,
    };
  },

  async getAiMentor(user: SafeUser) {
    const profiles = await listProfiles();

    if (user.role === "teacher") {
      const teacherClasses = storageService
        .listClasses()
        .filter((item) => item.teacherId === user.id)
        .map((item) => item.classId);

      const teacherStudents = profiles.filter((profile) => teacherClasses.includes(profile.classId));
      const teacherRisk = teacherStudents.map((profile) =>
        calculateStudentRisk({
          profile,
          analysisPreset: "risk",
        }),
      );

      const classSummariesInput = teacherClasses.map((classId) =>
        buildTeacherClassSummaryInput(
          classId,
          teacherRisk.filter((item) => item.classId === classId),
        ),
      );

      const fallbackSummary =
        classSummariesInput.length > 0
          ? `Под контролем ${classSummariesInput.length} классов. Требуют внимания: ${classSummariesInput
              .sort((a, b) => b.highRiskStudents - a.highRiskStudents)
              .slice(0, 2)
              .map((item) => `${item.classId} (${item.highRiskStudents})`)
              .join(", ")}.`
          : "Нет закрепленных классов для аналитики.";

      const fallbackRecommendations = classSummariesInput
        .flatMap((item) => item.recommendationsSeed)
        .filter((value, index, array) => array.indexOf(value) === index)
        .slice(0, 4);

      const llmSummary = await generateLLMSummaryFromStructuredData({
        role: user.role,
        kind: "teacher-class-report",
        structuredData: {
          teacherName: user.name,
          classes: classSummariesInput,
          highRiskStudents: teacherRisk.filter((item) => item.riskLevel === "high").length,
        },
        fallbackSummary,
        fallbackRecommendations:
          fallbackRecommendations.length > 0
            ? fallbackRecommendations
            : [
                "Проверить 2-3 ключевых причины риска по каждому классу.",
                "Согласовать недельный план с учениками в high risk.",
              ],
      });

      return mapMentorOutput(user.role, {
        summary: llmSummary.summary,
        strengths: classSummariesInput
          .filter((item) => item.highRiskStudents === 0)
          .slice(0, 3)
          .map((item) => item.classId),
        weaknesses: classSummariesInput
          .filter((item) => item.highRiskStudents > 0)
          .sort((a, b) => b.highRiskStudents - a.highRiskStudents)
          .slice(0, 3)
          .map((item) => `${item.classId}: ${item.highRiskStudents}`),
        recommendations: llmSummary.recommendations,
        mode: llmSummary.source,
        trends: classSummariesInput.map((item) => ({
          subject: item.classId,
          trend: Number((4 - item.averageScore).toFixed(2)),
        })),
        explainability: buildExplainabilityDrivers(user.role, teacherRisk),
      });
    }

    if (user.role === "admin") {
      const schoolRisk = profiles.map((profile) =>
        calculateStudentRisk({
          profile,
          analysisPreset: "risk",
        }),
      );
      const schoolAggregate = aggregateSchoolRisk(schoolRisk);

      const fallbackSummary =
        `По школе средний риск ${schoolAggregate.schoolRiskAverage}/100. ` +
        `Классов в аналитике: ${schoolAggregate.classes}, учеников в high risk: ${schoolAggregate.highRiskStudents}.`;

      const llmSummary = await generateLLMSummaryFromStructuredData({
        role: user.role,
        kind: "admin-school-summary",
        structuredData: {
          schoolAggregate,
          topRiskClasses: schoolAggregate.classBreakdown.slice(0, 4),
        },
        fallbackSummary,
        fallbackRecommendations: [
          "Сконцентрировать поддержку на классах с наибольшим средним риском.",
          "Ввести еженедельный контроль динамики high-risk учеников.",
          "Проверить, как распределены риски по ключевым предметам и параллелям.",
        ],
      });

      return mapMentorOutput(user.role, {
        summary: llmSummary.summary,
        strengths: schoolAggregate.classBreakdown
          .slice(-3)
          .map((item) => `${item.classId}: ${item.averageRisk}/100`),
        weaknesses: schoolAggregate.classBreakdown
          .slice(0, 3)
          .map((item) => `${item.classId}: ${item.averageRisk}/100`),
        recommendations: llmSummary.recommendations,
        mode: llmSummary.source,
        trends: schoolAggregate.classBreakdown.map((item) => ({
          subject: item.classId,
          trend: Number((item.averageRisk / 100).toFixed(2)),
        })),
        explainability: buildExplainabilityDrivers(user.role, schoolRisk),
      });
    }

    const profile = getLinkedStudent(user, profiles);
    if (!profile) {
      return mapMentorOutput(user.role, {
        summary: "Профиль ученика пока пустой. Подключите BilimClass в разделе «Профиль», чтобы запустить персональную аналитику.",
        strengths: [],
        weaknesses: [],
        recommendations: [
          "Откройте «Профиль» и привяжите аккаунт BilimClass.",
          "После подключения обновите страницу ИИ-помощника.",
        ],
        mode: "demo",
        trends: [],
        explainability: {
          confidence: 35,
          drivers: ["Недостаточно академических данных для расчета персонального риска."],
          source: "Профиль пользователя",
        },
      });
    }

    if (profile.progress.length === 0) {
      return mapMentorOutput(user.role, {
        summary: `${profile.fullName}: пока нет оценок и трендов в дневнике, поэтому детальный риск не рассчитан.`,
        strengths: [],
        weaknesses: [],
        recommendations: [
          "Подключите BilimClass-аккаунт в профиле.",
          "Проверьте, что выбран корректный ученик и класс.",
          "После появления оценок откройте анализ повторно.",
        ],
        mode: "demo",
        trends: [],
        explainability: {
          confidence: 42,
          drivers: ["Данные по предметам отсутствуют, расчет риска временно ограничен."],
          source: "Профиль ученика",
        },
      });
    }

    const risk = calculateStudentRisk({
      profile,
      analysisPreset: user.role === "parent" ? "balanced" : "comfort",
    });
    const performance = summarizeStudentPerformance({ profile, analysisPreset: "balanced" }, risk);

    const fallbackSummary =
      `${profile.fullName}: риск ${getRiskLevelLabel(risk.riskLevel)} (${risk.riskScore}/100). ` +
      `Средний балл ${performance.averageScore}, тренд ${performance.trendValue > 0 ? "+" : ""}${performance.trendValue}.`;

    const llmSummary = await generateLLMSummaryFromStructuredData({
      role: user.role,
      kind: user.role === "parent" ? "parent-weekly-summary" : "student-mentor",
      structuredData: {
        student: {
          id: risk.studentId,
          name: risk.fullName,
          classId: risk.classId,
        },
        risk,
        performance,
      },
      fallbackSummary,
      fallbackRecommendations:
        risk.recommendationsSeed.length > 0
          ? risk.recommendationsSeed
          : ["Выбрать 1-2 предмета для фокуса на неделю и провести мини-проверку прогресса."],
    });

    return mapMentorOutput(user.role, {
      summary: llmSummary.summary,
      strengths: risk.strongestSubjects,
      weaknesses: risk.weakestSubjects,
      recommendations: llmSummary.recommendations,
      mode: llmSummary.source,
      trends: profile.progress.map((item) => ({
        subject: item.subject,
        trend: Number(item.trend.toFixed(2)),
      })),
      explainability: buildExplainabilityDrivers(user.role, [risk], [
        `Итоговый риск: ${risk.riskScore}/100`,
        ...risk.reasons.slice(0, 2),
      ]),
    });
  },

  async getEvents(user: SafeUser) {
    const profiles = await listProfiles();
    const feed = eventsForUser(user, profiles);
    return {
      feed,
      upcoming: feed.filter((item) => item.type === "event"),
    };
  },

  async getKioskData() {
    const profiles = await listProfiles();
    const achievements = listAchievements();
    const feed = events();

    return {
      fullscreenHero: {
        title: "Главные события Aqbobek Lyceum",
        subtitle: "Учеба, достижения, школьная жизнь",
      },
      achievements,
      news: feed.filter((item) => item.type === "news"),
      upcomingEvents: feed.filter((item) => item.type === "event"),
      topStudents: leaderboard(profiles).slice(0, 3),
      schoolHighlights: buildSchoolHighlights(profiles, achievements.length, feed.length),
    };
  },

  async getAdminAnalytics() {
    const profiles = await listProfiles();
    const achievements = listAchievements();
    const schoolAverage = averageScore(profiles);
    const comparison = classOverviews(profiles);
    return {
      schoolAverage: +schoolAverage.toFixed(2),
      classComparison: comparison,
      totalUsers: users().length,
      eventsCount: events().length,
      achievementsCount: achievements.length,
      riskStudents: profiles
        .map((profile) => calculateStudentRisk({ profile, analysisPreset: "risk" }))
        .filter((item) => item.riskLevel !== "low").length,
    };
  },

  async getClassManagement() {
    const profiles = await listProfiles();
    return classOverviews(profiles).map((item) => ({
      classId: item.classId,
      teacherId: item.teacherId || null,
      avgScore: item.avgScore,
      riskStudents: item.riskStudents.length,
      studentsCount: profiles.filter((student) => student.classId === item.classId).length,
    }));
  },

  listUsers() {
    return storageService.getSafeUsers();
  },

  listRoles(): Role[] {
    return ["student", "teacher", "parent", "admin"];
  },
};

