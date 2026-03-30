import { Achievement, StudentProfile } from "../types";
import { academicStoreService } from "./academicStoreService";
import { bilimClassService } from "./bilimClassService";
import { studentPrediction } from "./riskEngineService";

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

    const prediction = studentPrediction(profile);
    const topSubject = prediction.subjects[0];

    const attendancePercent = clamp(
      Math.round(99 - prediction.overallRisk / 9 - profile.weakSubjects.length * 2),
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
          prediction.flags[0] ??
          `${profile.fullName} держит устойчивую динамику и может усилить результат точечной практикой.`,
        riskLabel:
          topSubject && topSubject.probability >= 70
            ? `Высокий риск по предмету ${topSubject.subject}: ${topSubject.probability}%`
            : "Риск под контролем",
        action:
          topSubject?.resources[0] ??
          "Сделать короткий недельный план по слабым темам и сверить прогресс через 7 дней.",
        opportunity:
          prediction.subjects.at(-1)?.subject
            ? `Сильная зона: ${prediction.subjects.at(-1)?.subject}. Можно усиливать олимпиадное направление.`
            : "Есть потенциал роста по профильным предметам.",
      },
    };
  },
};

