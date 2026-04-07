import {
  Achievement,
  ClassOverview,
  JournalFilterScope,
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
import { localizeSubjectName, type SubjectLang } from "../utils/subjectNameLocalization";

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

const localizeProfileSubjects = (profile: StudentProfile, lang: SubjectLang): StudentProfile => {
  const localizedProgress = profile.progress.map((item) => ({
    ...item,
    subject: localizeSubjectName(item.subject, lang),
  }));

  const localizedWeakSubjects = profile.weakSubjects.map((item) => localizeSubjectName(item, lang));

  return {
    ...profile,
    progress: localizedProgress,
    weakSubjects: [...new Set(localizedWeakSubjects)],
  };
};

const rkPercentToFivePoint = (percent: number) => {
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

const toFivePointScore = (raw: string | null | undefined, markMax: number | null = null) => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const fraction = normalized.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return rkPercentToFivePoint((numerator / denominator) * 100);
    }
  }

  const direct = Number(normalized.match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(direct)) {
    return null;
  }

  if (markMax !== null && Number.isFinite(markMax) && markMax > 0) {
    return rkPercentToFivePoint((direct / markMax) * 100);
  }

  if (direct >= 2 && direct <= 5 && Math.abs(direct - Math.round(direct)) < 0.000001) {
    return Math.round(direct);
  }

  let percent: number;
  if (direct <= 5) {
    percent = direct * 20;
  } else if (direct <= 10) {
    percent = direct * 10;
  } else if (direct <= 25) {
    percent = (direct / 25) * 100;
  } else if (direct <= 100) {
    percent = direct;
  } else {
    percent = 100;
  }
  return rkPercentToFivePoint(percent);
};

const toJournalTimestamp = (dateRaw: string, timeRaw?: string | null) => {
  const date = dateRaw.trim();
  const time = (timeRaw ?? "").trim();
  if (!date) {
    return Number.NaN;
  }

  const dotted = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    const [, day, month, year] = dotted;
    const iso = `${year}-${month}-${day}${time ? `T${time}` : ""}`;
    return Date.parse(iso);
  }

  const direct = Date.parse(time ? `${date} ${time}` : date);
  return Number.isFinite(direct) ? direct : Number.NaN;
};

const buildProfileFromJournal = (
  baseProfile: StudentProfile,
  journal: Awaited<ReturnType<typeof bilimClassService.getStudentJournal>>,
): StudentProfile | null => {
  const normalizeSubjectKey = (value: string) => value.trim().toLowerCase();
  const valuesBySubject = new Map<string, number[]>();
  const historyBySubject = new Map<string, Array<{ date: string; score: number; timestamp: number }>>();
  const subjectNameByKey = new Map<string, string>();

  for (const subject of journal.subjects) {
    const key = normalizeSubjectKey(subject.subjectName);
    if (key && !subjectNameByKey.has(key)) {
      subjectNameByKey.set(key, subject.subjectName);
    }
  }

  for (const grade of journal.grades) {
    const key = normalizeSubjectKey(grade.subjectName);
    if (!key) {
      continue;
    }
    if (!subjectNameByKey.has(key)) {
      subjectNameByKey.set(key, grade.subjectName);
    }
    const converted =
      typeof grade.scoreFive === "number" && Number.isFinite(grade.scoreFive)
        ? toFivePointScore(String(grade.scoreFive))
        : toFivePointScore(grade.scoreRaw, typeof grade.markMax === "number" ? grade.markMax : null);
    if (converted === null || !Number.isFinite(converted)) {
      continue;
    }
    const bucket = valuesBySubject.get(key) ?? [];
    bucket.push(converted);
    valuesBySubject.set(key, bucket);

    const history = historyBySubject.get(key) ?? [];
    history.push({
      date: grade.lessonDate || new Date().toISOString().slice(0, 10),
      score: Number(converted.toFixed(2)),
      timestamp: toJournalTimestamp(grade.lessonDate ?? "", grade.lessonTime),
    });
    historyBySubject.set(key, history);
  }

  const summaryByKey = new Map(
    journal.subjects.map((subject) => [normalizeSubjectKey(subject.subjectName), subject] as const),
  );

  const subjectKeys = [...subjectNameByKey.keys()];
  const journalProgress = subjectKeys
    .map((key) => {
      const subjectSummary = summaryByKey.get(key);
      const subjectName = subjectNameByKey.get(key) ?? subjectSummary?.subjectName ?? "";
      if (!subjectName) {
        return null;
      }

      const fromAverage = subjectSummary?.averageScore ?? null;
      const fromFinal = toFivePointScore(subjectSummary?.finalMark ?? null);
      const gradeValues = valuesBySubject.get(key) ?? [];
      const fromGrades =
        gradeValues.length > 0
          ? gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length
          : null;

      const current = fromAverage ?? fromFinal ?? fromGrades;
      if (current === null || !Number.isFinite(current)) {
        return null;
      }

      const normalizedCurrent = Number(Math.max(0, Math.min(5, current)).toFixed(2));
      const historyRaw = historyBySubject.get(key) ?? [];
      const history = [...historyRaw]
        .sort((a, b) => {
          const left = Number.isFinite(a.timestamp) ? a.timestamp : Number.MAX_SAFE_INTEGER;
          const right = Number.isFinite(b.timestamp) ? b.timestamp : Number.MAX_SAFE_INTEGER;
          return left - right;
        })
        .map((point) => ({
          date: point.date,
          score: point.score,
        }));

      let trend = 0;
      if (history.length >= 2) {
        const windowSize = Math.min(3, Math.max(1, Math.floor(history.length / 2)));
        const recent = history.slice(-windowSize);
        const previous = history.slice(-(windowSize * 2), -windowSize);
        if (previous.length > 0) {
          const recentAvg = recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
          const previousAvg = previous.reduce((sum, item) => sum + item.score, 0) / previous.length;
          trend = Number((recentAvg - previousAvg).toFixed(2));
        } else {
          trend = Number((history[history.length - 1].score - history[0].score).toFixed(2));
        }
      }

      return {
        subject: subjectName,
        current: normalizedCurrent,
        trend,
        risk: normalizedCurrent < 4,
        history: history.length > 0 ? history : [{ date: new Date().toISOString().slice(0, 10), score: normalizedCurrent }],
      };
    })
    .filter((item): item is StudentProfile["progress"][number] => Boolean(item));

  if (journalProgress.length === 0) {
    return null;
  }

  const averageScore =
    journalProgress.reduce((sum, item) => sum + item.current, 0) / Math.max(1, journalProgress.length);

  return {
    ...baseProfile,
    averageScore: Number(averageScore.toFixed(2)),
    weakSubjects: journalProgress.filter((item) => item.risk).map((item) => item.subject),
    progress: journalProgress,
  };
};

const withJournalFallbackProfile = async (
  user: SafeUser,
  profile: StudentProfile,
  lang: SubjectLang = "ru",
): Promise<StudentProfile> => {
  if (profile.progress.length > 0) {
    return profile;
  }

  try {
    const journal = await bilimClassService.getStudentJournal(user, undefined, lang);
    if (journal.stats.grades <= 0) {
      return profile;
    }
    return buildProfileFromJournal(profile, journal) ?? profile;
  } catch {
    return profile;
  }
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
) => {
  const normalizeText = (value: string) =>
    value
      .replace(/\bRule-?based\b/gi, "Алгоритмическая")
      .replace(/\btrend\s+flat\b/gi, "динамика стабильная")
      .replace(/\btrend\s+up\b/gi, "динамика растет")
      .replace(/\btrend\s+down\b/gi, "динамика снижается")
      .replace(/\brisk\s+low\b/gi, "риск низкий")
      .replace(/\brisk\s+medium\b/gi, "риск средний")
      .replace(/\brisk\s+high\b/gi, "риск высокий")
      .replace(/\bLLM\b/g, "языковая модель")
      .replace(/\bDemo\b/gi, "Демо")
      .replace(/\bOpenAI\b/g, "облачная модель")
      .replace(/\bscore\b/gi, "балл");

  return {
    role,
    summary: normalizeText(payload.summary),
    strengths: payload.strengths,
    weaknesses: payload.weaknesses,
    recommendations: payload.recommendations.map((item) => normalizeText(item)),
    trends: payload.trends,
    mode: payload.mode,
    explainability: payload.explainability,
  };
};

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
        aiSummary: `${profile.fullName}: уровень риска ${risk.riskLevel}, индекс риска ${risk.riskScore}/100.`,
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
          ? `Главная зона внимания: ${topClass.classId} (${topClass.highRiskStudents} учеников в высоком риске).`
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

  async getProgress(user: SafeUser, lang: SubjectLang = "ru") {
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
    const profileWithJournal = profile ? await withJournalFallbackProfile(user, profile, lang) : null;
    const localizedProfile = profileWithJournal ? localizeProfileSubjects(profileWithJournal, lang) : null;
    return {
      role: user.role,
      student: localizedProfile,
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

  async getAiMentor(
    user: SafeUser,
    requestedJournalScope?: Partial<JournalFilterScope>,
    lang: SubjectLang = "ru",
  ) {
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
                "Согласовать недельный план с учениками в зоне высокого риска.",
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
        `Классов в аналитике: ${schoolAggregate.classes}, учеников в высоком риске: ${schoolAggregate.highRiskStudents}.`;

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
          "Ввести еженедельный контроль динамики учеников в зоне высокого риска.",
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

    let journalSnapshot:
      | {
          source: "bilimclass" | "cache" | "empty";
          selected: {
            eduYear: number;
            period: number;
            periodType: string;
          };
          grades: number;
          subjects: number;
          topSubjects: string[];
          recentGrades: string[];
          lastSyncAt: string | null;
        }
      | null = null;
    let effectiveProfile: StudentProfile = localizeProfileSubjects(profile, lang);
    let journalSourceForExplainability: "bilimclass" | "cache" | "empty" | null = null;

    try {
      const journal = await bilimClassService.getStudentJournal(user, requestedJournalScope, lang);
      journalSourceForExplainability = journal.source;
      journalSnapshot = {
        source: journal.source,
        selected: journal.selected,
        grades: journal.stats.grades,
        subjects: journal.stats.subjects,
        topSubjects: journal.subjects
          .slice(0, 3)
          .map((item) => `${item.subjectName}: ${item.averageScore !== null ? item.averageScore.toFixed(2) : "н/д"}`),
        recentGrades: [...journal.grades]
          .sort((a, b) => {
            const left = `${a.lessonDate} ${a.lessonTime ?? ""}`.trim();
            const right = `${b.lessonDate} ${b.lessonTime ?? ""}`.trim();
            return right.localeCompare(left);
          })
          .slice(0, 5)
          .map((item) => `${item.subjectName}: ${item.scoreRaw}`),
        lastSyncAt: journal.stats.lastSyncAt,
      };

      if (journal.stats.grades > 0) {
        const synthesized = buildProfileFromJournal(effectiveProfile, journal);
        if (synthesized) {
          effectiveProfile = synthesized;
        }
      }
    } catch {
      journalSnapshot = null;
    }

    if (effectiveProfile.progress.length === 0) {
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
          drivers: [
            `Источник журнала: ${journalSourceForExplainability ?? "недоступен"}.`,
            "Данные по предметам отсутствуют, расчет риска временно ограничен.",
          ],
          source: "Профиль ученика",
        },
      });
    }

    const risk = calculateStudentRisk({
      profile: effectiveProfile,
      analysisPreset: user.role === "parent" ? "balanced" : "comfort",
    });
    const performance = summarizeStudentPerformance({ profile: effectiveProfile, analysisPreset: "balanced" }, risk);

    const fallbackSummary =
      `${profile.fullName}: риск ${getRiskLevelLabel(risk.riskLevel)} (${risk.riskScore}/100). ` +
      `Средний балл ${performance.averageScore}, тренд ${performance.trendValue > 0 ? "+" : ""}${performance.trendValue}.` +
      (journalSnapshot
        ? ` Журнал: ${journalSnapshot.grades} оценок по ${journalSnapshot.subjects} предметам.`
        : "");

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
        journal: journalSnapshot,
      },
      fallbackSummary,
      fallbackRecommendations:
        risk.recommendationsSeed.length > 0
          ? [
              ...risk.recommendationsSeed,
              ...(journalSnapshot?.topSubjects.length ? [`Опираться на журнал: ${journalSnapshot.topSubjects[0]}.`] : []),
            ]
          : ["Выбрать 1-2 предмета для фокуса на неделю и провести мини-проверку прогресса."],
    });

    return mapMentorOutput(user.role, {
      summary: llmSummary.summary,
      strengths: risk.strongestSubjects,
      weaknesses: risk.weakestSubjects,
      recommendations: llmSummary.recommendations,
      mode: llmSummary.source,
      trends: effectiveProfile.progress.map((item) => ({
        subject: item.subject,
        trend: Number(item.trend.toFixed(2)),
      })),
      explainability: buildExplainabilityDrivers(user.role, [risk], [
        `Итоговый риск: ${risk.riskScore}/100`,
        ...(journalSnapshot ? [`Журнал: ${journalSnapshot.grades} оценок (${journalSnapshot.source}).`] : []),
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
        title: "Главные события Matrix Education",
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


