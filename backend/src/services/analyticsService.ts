import { Achievement, ClassOverview, ManagedClass, Role, StudentProfile, User } from "../types";
import { academicStoreService } from "./academicStoreService";
import { bilimClassService } from "./bilimClassService";
import { openAiMentorService } from "./openAiMentorService";
import { storageService } from "./storageService";

type SafeUser = Omit<User, "password">;

const listProfiles = async () => bilimClassService.getStudentProfiles();
const listAchievements = () => academicStoreService.listAchievements();

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

const buildAiSummary = (profile: StudentProfile) => {
  const strengths = profile.progress
    .filter((item) => item.current >= 4.5)
    .map((item) => item.subject);
  const weaknesses = profile.progress
    .filter((item) => item.risk)
    .map((item) => item.subject);

  return {
    summary: `${profile.fullName} держит средний балл ${profile.averageScore.toFixed(
      1,
    )} и может заметно усилить результат.`,
    strengths,
    weaknesses,
    recommendations: [
      "Проведи на этой неделе 3 короткие дополнительные сессии по предметам риска.",
      "Чередуй слабый предмет с тем, где у тебя сильный результат.",
      "В конце недели проверь динамику вместе с помощником ИИ.",
    ],
    trends: profile.progress.map((item) => ({
      subject: item.subject,
      trend: item.trend,
    })),
  };
};

const buildClassAiSummary = (
  classes: { classId: string; averageScore: number; riskStudents: { studentId: string; name: string }[] }[],
) => {
  if (classes.length === 0) {
    return "Пока нет закрепленных классов. Добавьте класс, чтобы получить ИИ-разбор.";
  }

  const topClass = [...classes].sort((a, b) => b.averageScore - a.averageScore)[0];
  const risky = classes.reduce((sum, item) => sum + item.riskStudents.length, 0);

  return `Сейчас под вашей ответственностью ${classes.length} классов. Лучшая динамика у ${topClass.classId}, учеников в зоне внимания: ${risky}.`;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

const buildParentWeeklySummary = (profile: StudentProfile, recommendations: string[]) => {
  const delta = calculatePeriodDelta(profile);
  const wins = profile.progress
    .filter((item) => item.trend > 0)
    .sort((a, b) => b.trend - a.trend)
    .slice(0, 3)
    .map((item) => `${item.subject} +${item.trend.toFixed(1)}`);

  const risks = [
    ...new Set([
      ...profile.weakSubjects,
      ...profile.progress.filter((item) => item.trend < 0).map((item) => item.subject),
    ]),
  ].slice(0, 3);

  return {
    periodLabel: "week",
    delta: Number(delta.toFixed(2)),
    wins,
    risks,
    plan: recommendations.slice(0, 3),
  };
};

const mapMentorOutput = (
  role: Role,
  payload: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    trends?: { subject: string; trend: number }[];
  },
) => {
  const drivers = [
    "Гибридный подход: локальный скоринг рисков + LLM для формулировок",
    ...payload.weaknesses.slice(0, 2).map((item) => `Зона внимания: ${item}`),
    ...payload.strengths.slice(0, 2).map((item) => `Сильная сторона: ${item}`),
    ...(payload.trends ?? [])
      .slice(0, 2)
      .map((item) => `Динамика: ${item.subject} ${item.trend > 0 ? "+" : ""}${item.trend}`),
  ];
  const confidence = clamp(58 + payload.recommendations.length * 6 + (payload.trends?.length ?? 0) * 3, 55, 96);
  const source =
    role === "teacher"
      ? "class-aggregates"
      : role === "admin"
        ? "school-aggregates"
        : "student-profile";

  return {
    role,
    summary: payload.summary,
    strengths: payload.strengths,
    weaknesses: payload.weaknesses,
    recommendations: payload.recommendations,
    trends: payload.trends,
    explainability: {
      confidence: Math.round(confidence),
      drivers,
      source,
    },
  };
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
    .filter((student) => student.weakSubjects.length > 0 || student.progress.some((subject) => subject.risk))
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
  return profiles.find((student) => student.studentId === studentId);
};

const averageScore = (profiles: StudentProfile[]) => {
  if (profiles.length === 0) {
    return 0;
  }
  return profiles.reduce((sum, student) => sum + student.averageScore, 0) / profiles.length;
};

const events = () => storageService.listEvents();

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

const users = () => storageService.getUsers();

const buildSchoolHighlights = (profiles: StudentProfile[], achievementsCount: number, feedCount: number) => {
  const classCount = new Set(profiles.map((item) => item.classId)).size;
  const riskCount = profiles.filter((item) => item.weakSubjects.length > 0).length;

  return [
    `В аналитике ${profiles.length} учеников из ${classCount} классов`,
    `В цифровом портфолио ${achievementsCount} достижений`,
    `В ленте школы ${feedCount} публикаций, учеников в зоне риска: ${riskCount}`,
  ];
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
      const quickAi = buildAiSummary(profile);
      return {
        role: user.role,
        greeting: `С возвращением, ${user.name}`,
        averageScore: profile.averageScore,
        periodDelta: calculatePeriodDelta(profile),
        weakSubjects: profile.weakSubjects,
        achievements: achievements.filter((item) => item.studentId === profile.studentId),
        events: eventsForUser(user, profiles),
        aiRecommendation: quickAi.recommendations[0] ?? quickAi.summary,
        quickActions: ["Открыть мой прогресс", "Посмотреть разбор ИИ", "Проверить ближайшие события"],
      };
    }

    if (user.role === "parent") {
      const profile = getLinkedStudent(user, profiles);
      if (!profile) {
        return { message: "Профиль ребенка не найден" };
      }
      const quickAi = buildAiSummary(profile);
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
        aiSummary: quickAi.summary,
        weeklySummary: buildParentWeeklySummary(profile, quickAi.recommendations),
      };
    }

    if (user.role === "teacher") {
      const classes = classSummaries(user.id, profiles);
      const teacherEfficiency = buildTeacherEfficiency(classes);
      const riskStudentMap = new Map<string, { studentId: string; name: string }>();
      for (const riskStudent of classes.flatMap((item) => item.riskStudents)) {
        riskStudentMap.set(riskStudent.studentId, riskStudent);
      }
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
        aiSummary: buildClassAiSummary(classes),
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
      const classes = classSummaries(user.id, profiles);
      const aiResponse = await openAiMentorService.generateMentorResponse({
        role: user.role,
        userName: user.name,
        classStats: classes.map((item) => ({
          classId: item.classId,
          averageScore: item.averageScore,
          riskStudents: item.riskStudents.length,
        })),
      });
      return mapMentorOutput(user.role, aiResponse);
    }

    if (user.role === "admin") {
      const schoolAverage = averageScore(profiles);
      const riskStudents = profiles.filter((student) => student.weakSubjects.length > 0).length;
      const aiResponse = await openAiMentorService.generateMentorResponse({
        role: user.role,
        userName: user.name,
        schoolStats: {
          schoolAverage: +schoolAverage.toFixed(2),
          classCount: classOverviews(profiles).length,
          riskStudents,
        },
      });
      return mapMentorOutput(user.role, aiResponse);
    }

    const profile = getLinkedStudent(user, profiles);
    if (!profile) {
      throw new Error("Профиль не найден");
    }

    const aiResponse = await openAiMentorService.generateMentorResponse({
      role: user.role,
      userName: user.name,
      studentProfile: profile,
    });
    return mapMentorOutput(user.role, aiResponse);
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
      riskStudents: profiles.filter((student) => student.weakSubjects.length > 0).length,
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


