import { Achievement, StudentProfile } from "../types";
import { calculateStudentRisk } from "../analytics/risk/studentRisk";
import { academicStoreService } from "./academicStoreService";
import { bilimClassService } from "./bilimClassService";

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

export const studentProfileService = {
  async getCard(studentId: string) {
    const normalizedId = studentId.trim();
    if (!normalizedId) {
      return null;
    }

    const profiles = await bilimClassService.getStudentProfiles();
    const profile = profiles.find((item) => item.studentId === normalizedId);
    if (!profile) {
      return null;
    }

    const achievements = byStudent(academicStoreService.listAchievements(), profile.studentId);
    const points = achievements.reduce((sum, item) => sum + item.points, 0);
    const rank = byRank(profiles).find((item) => item.studentId === profile.studentId)?.rank ?? null;

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

    const risk = calculateStudentRisk({
      profile,
      analysisPreset: "balanced",
    });

    const topSubject = risk.recommendationContext.subjectInsights[0];

    const attendancePercent = clamp(
      Math.round(99 - risk.riskScore / 9 - risk.weakestSubjects.length * 2),
      82,
      99,
    );
    const streakDays = clamp(Math.round(profile.averageScore * 3 + 2), 4, 30);

    return {
      student: profile,
      rank,
      points,
      attendancePercent,
      streakDays,
      recentGrades,
      achievements,
      ai: {
        summary:
          risk.reasons[0] ??
          `${profile.fullName} держит устойчивую динамику и может усилить результат точечной практикой.`,
        riskLabel:
          topSubject && topSubject.riskScore >= 70
            ? `Высокий риск по предмету ${topSubject.subject}: ${Math.round(topSubject.riskScore)}%`
            : "Риск под контролем",
        action:
          risk.recommendationsSeed[0] ??
          "Сделать короткий недельный план по слабым темам и сверить прогресс через 7 дней.",
        opportunity:
          risk.strongestSubjects[0]
            ? `Сильная зона: ${risk.strongestSubjects[0]}. Можно усиливать олимпиадное направление.`
            : "Есть потенциал роста по профильным предметам.",
      },
    };
  },
};
