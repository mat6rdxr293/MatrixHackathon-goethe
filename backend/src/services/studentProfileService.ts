import { Achievement, StudentProfile, User } from "../types";
import { calculateStudentRisk } from "../analytics/risk/studentRisk";
import { academicStoreService } from "./academicStoreService";
import { bilimClassService } from "./bilimClassService";
import { storageService } from "./storageService";

type SafeUser = Omit<User, "password">;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const byRank = (profiles: StudentProfile[]) =>
  [...profiles]
    .sort((a, b) => b.averageScore - a.averageScore)
    .map((student, index) => ({
      rank: index + 1,
      studentId: student.studentId,
      name: student.fullName,
      averageScore: student.averageScore,
    }));

const byStudent = (items: Achievement[], studentId: string) =>
  items
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

const canUseOwnFallback = (requester: SafeUser | undefined, studentId: string) => {
  if (!requester) {
    return false;
  }

  if (requester.role === "student") {
    return requester.id === studentId || requester.linkedStudentId === studentId;
  }

  if (requester.role === "parent") {
    return requester.linkedStudentId === studentId;
  }

  return false;
};

const buildFallbackProfile = (
  studentId: string,
  requester: SafeUser | undefined,
  profiles: StudentProfile[],
): StudentProfile => {
  const currentUser = requester?.id ? storageService.getUserById(requester.id) : undefined;
  const fullName =
    (requester?.role === "parent" ? profiles.find((item) => item.studentId === studentId)?.fullName : undefined) ??
    currentUser?.name ??
    requester?.name ??
    "Ученик";

  const classId =
    currentUser?.classId ??
    requester?.classId ??
    (requester?.linkedStudentId
      ? profiles.find((item) => item.studentId === requester.linkedStudentId)?.classId
      : undefined) ??
    "—";

  return {
    studentId,
    fullName,
    classId,
    averageScore: 0,
    weakSubjects: [],
    progress: [],
  };
};

export const studentProfileService = {
  async getCard(studentId: string, requester?: SafeUser) {
    const normalizedId = studentId.trim();
    if (!normalizedId) {
      return null;
    }

    const profiles = await bilimClassService.getStudentProfiles();
    const profileFromData = profiles.find((item) => item.studentId === normalizedId) ?? null;

    const profile =
      profileFromData ??
      (canUseOwnFallback(requester, normalizedId) ? buildFallbackProfile(normalizedId, requester, profiles) : null);

    if (!profile) {
      return null;
    }

    const achievements = byStudent(academicStoreService.listAchievements(), profile.studentId);
    const points = achievements.reduce((sum, item) => sum + item.points, 0);
    const rank = profileFromData ? byRank(profiles).find((item) => item.studentId === profile.studentId)?.rank ?? null : null;

    const recentGrades = profile.progress
      .flatMap((subject) =>
        subject.history.map((historyItem) => ({
          subject: subject.subject,
          score: Number(historyItem.score.toFixed(2)),
          date: historyItem.date,
        })),
      )
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 10);

    const hasAcademicData = profile.progress.length > 0;
    const risk = hasAcademicData
      ? calculateStudentRisk({
          profile,
          analysisPreset: "balanced",
        })
      : null;

    const topSubject = risk?.recommendationContext.subjectInsights[0];
    const attendancePercent = hasAcademicData
      ? clamp(
          Math.round(99 - (risk?.riskScore ?? 0) / 9 - (risk?.weakestSubjects.length ?? 0) * 2),
          82,
          99,
        )
      : 95;
    const streakDays = hasAcademicData ? clamp(Math.round(profile.averageScore * 3 + 2), 4, 30) : 0;

    return {
      student: profile,
      rank,
      points,
      attendancePercent,
      streakDays,
      recentGrades,
      achievements,
      ai: {
        summary: hasAcademicData
          ? risk?.reasons[0] ??
            `${profile.fullName} держит устойчивую динамику и может усилить результат точечной практикой.`
          : "Данные из дневника пока не синхронизированы. Подключите BilimClass в профиле и обновите страницу.",
        riskLabel:
          hasAcademicData && topSubject && topSubject.riskScore >= 70
            ? `Высокий риск по предмету ${topSubject.subject}: ${Math.round(topSubject.riskScore)}%`
            : hasAcademicData
              ? "Риск под контролем"
              : "Ожидаем данные BilimClass",
        action: hasAcademicData
          ? risk?.recommendationsSeed[0] ??
            "Сделать короткий недельный план по слабым темам и сверить прогресс через 7 дней."
          : "Откройте раздел «Профиль» и привяжите BilimClass-аккаунт.",
        opportunity: hasAcademicData
          ? risk?.strongestSubjects[0]
            ? `Сильная зона: ${risk.strongestSubjects[0]}. Можно усиливать олимпиадное направление.`
            : "Есть потенциал роста по профильным предметам."
          : "После синхронизации появятся сильные стороны, риски и персональные рекомендации.",
      },
    };
  },
};

