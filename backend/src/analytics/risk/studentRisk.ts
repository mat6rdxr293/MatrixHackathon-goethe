import {
  ParentSummaryInput,
  StudentAnalyticsInput,
  StudentPerformanceSummary,
  StudentRiskReason,
  StudentRiskResult,
  TeacherClassSummaryInput,
} from "../types";
import { getPresetWeights } from "../presets";
import { clampScore, deviation, normalizeByThreshold, roundTo } from "../../utils/scoringHelpers";

const averageTrend = (historyDeltas: number[]) => {
  if (historyDeltas.length === 0) {
    return 0;
  }
  return historyDeltas.reduce((sum, value) => sum + value, 0) / historyDeltas.length;
};

const trendFromProfile = (input: StudentAnalyticsInput) => {
  const trendValues = input.profile.progress.map((item) => item.trend);
  const trend = averageTrend(trendValues);
  if (trend > 0.08) {
    return { direction: "up" as const, value: roundTo(trend) };
  }
  if (trend < -0.08) {
    return { direction: "down" as const, value: roundTo(trend) };
  }
  return { direction: "flat" as const, value: roundTo(trend) };
};

const estimateAttendanceRate = (input: StudentAnalyticsInput) => {
  if (typeof input.attendanceRate === "number") {
    return clampScore(input.attendanceRate, 0, 100);
  }
  if (typeof input.missedLessons === "number") {
    return clampScore(100 - input.missedLessons * 2.2, 45, 100);
  }
  const riskTaggedSubjects = input.profile.progress.filter((item) => item.risk).length;
  return clampScore(98 - riskTaggedSubjects * 2.5, 55, 100);
};

const estimateMissedLessons = (input: StudentAnalyticsInput, attendanceRate: number) => {
  if (typeof input.missedLessons === "number") {
    return Math.max(0, Math.round(input.missedLessons));
  }
  return Math.max(0, Math.round((100 - attendanceRate) / 2.2));
};

const buildSubjectRiskScore = (current: number, trend: number, riskFlag: boolean) => {
  let score = 0;
  score += normalizeByThreshold(Math.max(0, 4.6 - current), 1.6) * 0.58;
  score += normalizeByThreshold(Math.max(0, -trend), 0.8) * 0.32;
  score += riskFlag ? 10 : 0;
  return clampScore(score);
};

export const getRiskLevelLabel = (riskLevel: StudentRiskResult["riskLevel"]) => {
  if (riskLevel === "high") {
    return "высокий";
  }
  if (riskLevel === "medium") {
    return "средний";
  }
  return "низкий";
};

export const buildStudentRiskReasons = (input: StudentAnalyticsInput, riskScore: number): StudentRiskReason[] => {
  const reasons: StudentRiskReason[] = [];
  const profile = input.profile;
  const attendanceRate = estimateAttendanceRate(input);
  const missedLessons = estimateMissedLessons(input, attendanceRate);
  const overdueTasks = Math.max(0, Math.round(input.overdueTasks ?? 0));
  const trend = trendFromProfile(input).value;
  const trendVolatility = deviation(profile.progress.map((item) => item.trend));

  if (profile.averageScore < 3.9) {
    reasons.push({
      code: "low_average_score",
      text: "Низкий средний балл по предметам.",
      severity: profile.averageScore < 3.6 ? "high" : "medium",
    });
  }

  if (trend <= -0.2) {
    reasons.push({
      code: "sharp_score_drop",
      text: "Заметное снижение среднего результата за период.",
      severity: trend <= -0.35 ? "high" : "medium",
    });
  }

  if (trendVolatility >= 0.32) {
    reasons.push({
      code: "unstable_results",
      text: "Нестабильная динамика по предметам.",
      severity: trendVolatility >= 0.45 ? "high" : "medium",
    });
  }

  if (attendanceRate < 90 || missedLessons >= 4) {
    reasons.push({
      code: "frequent_absences",
      text: "Частые пропуски влияют на прогресс.",
      severity: attendanceRate < 84 || missedLessons >= 6 ? "high" : "medium",
    });
  }

  if (overdueTasks > 0) {
    reasons.push({
      code: "overdue_tasks",
      text: "Есть просроченные или невыполненные задания.",
      severity: overdueTasks >= 4 ? "high" : "medium",
    });
  }

  const weakSubject = profile.progress
    .filter((item) => item.current < 4 || item.risk || item.trend < -0.18)
    .sort((a, b) => a.current - b.current)[0];
  if (weakSubject) {
    reasons.push({
      code: "weak_key_subject",
      text: `Низкий результат по ключевому предмету: ${weakSubject.subject}.`,
      severity: weakSubject.current < 3.5 ? "high" : "medium",
    });
  }

  if (reasons.length === 0 && riskScore >= 45) {
    reasons.push({
      code: "unstable_results",
      text: "Нужна стабилизация учебного темпа в ближайший период.",
      severity: "low",
    });
  }

  return reasons;
};

export const calculateStudentRisk = (input: StudentAnalyticsInput): StudentRiskResult => {
  const profile = input.profile;
  const preset = input.analysisPreset ?? "balanced";
  const weights = getPresetWeights(preset).risk;

  const attendanceRate = estimateAttendanceRate(input);
  const missedLessons = estimateMissedLessons(input, attendanceRate);
  const overdueTasks = Math.max(0, Math.round(input.overdueTasks ?? 0));

  const trendValues = profile.progress.map((item) => item.trend);
  const trendAverage = averageTrend(trendValues);
  const trendVolatility = deviation(trendValues);

  const subjectInsights = profile.progress
    .map((item) => ({
      subject: item.subject,
      current: item.current,
      trend: item.trend,
      riskScore: roundTo(buildSubjectRiskScore(item.current, item.trend, item.risk)),
    }))
    .sort((a, b) => b.riskScore - a.riskScore);

  const weakSubjectCount = profile.progress.filter((item) => item.current < 4 || item.risk || item.trend < -0.2).length;
  const weightedComponents = [
    normalizeByThreshold(Math.max(0, 4.6 - profile.averageScore), 1.8) * weights.averageScore,
    normalizeByThreshold(Math.max(0, -trendAverage), 0.65) * weights.scoreDrop,
    normalizeByThreshold(Math.max(0, 95 - attendanceRate), 25) * weights.attendance,
    normalizeByThreshold(trendVolatility, 0.7) * weights.instability,
    normalizeByThreshold(overdueTasks, 6) * weights.overdueTasks,
    normalizeByThreshold(weakSubjectCount, Math.max(2, profile.progress.length * 0.5)) * weights.weakSubjectLoad,
  ];

  const totalWeight =
    weights.averageScore +
    weights.scoreDrop +
    weights.attendance +
    weights.instability +
    weights.overdueTasks +
    weights.weakSubjectLoad;

  const riskScore = clampScore(
    weightedComponents.reduce((sum, component) => sum + component, 0) / Math.max(1, totalWeight),
    0,
    100,
  );

  const riskLevel: StudentRiskResult["riskLevel"] = riskScore >= 67 ? "high" : riskScore >= 40 ? "medium" : "low";
  const reasonsDetailed = buildStudentRiskReasons(input, riskScore);

  const strongestSubjects = [...profile.progress]
    .sort((a, b) => b.current - a.current || b.trend - a.trend)
    .slice(0, 3)
    .map((item) => item.subject);

  const weakestSubjects = [...profile.progress]
    .sort((a, b) => a.current - b.current || a.trend - b.trend)
    .slice(0, 3)
    .map((item) => item.subject);

  const recommendationsSeed = [
    weakestSubjects[0] ? `Сфокусироваться на теме "${weakestSubjects[0]}" тремя короткими блоками в неделю.` : "",
    reasonsDetailed.some((reason) => reason.code === "frequent_absences")
      ? "Сократить пропуски: проверить посещаемость и закрепить график повторения."
      : "",
    reasonsDetailed.some((reason) => reason.code === "unstable_results")
      ? "Выравнивать темп: мини-проверка каждые 3-4 дня по сложным темам."
      : "",
    strongestSubjects[0] ? `Использовать сильный предмет "${strongestSubjects[0]}" как опору для мотивации.` : "",
  ].filter(Boolean);

  return {
    studentId: profile.studentId,
    fullName: profile.fullName,
    classId: profile.classId,
    riskLevel,
    riskScore: Math.round(riskScore),
    reasons: reasonsDetailed.map((reason) => reason.text),
    reasonDetails: reasonsDetailed,
    strongestSubjects,
    weakestSubjects,
    trend: trendFromProfile(input),
    recommendationsSeed: recommendationsSeed.slice(0, 4),
    recommendationContext: {
      averageScore: roundTo(profile.averageScore),
      attendanceRate: roundTo(attendanceRate),
      missedLessons,
      overdueTasks,
      weakSubjects: profile.weakSubjects,
      subjectInsights,
      preset,
    },
  };
};

export const summarizeStudentPerformance = (
  input: StudentAnalyticsInput,
  risk: StudentRiskResult,
): StudentPerformanceSummary => {
  const averageScore = roundTo(input.profile.averageScore);
  const basePerformance = averageScore >= 4.5 ? "high" : averageScore >= 4 ? "medium" : "low";
  return {
    basePerformance,
    averageScore,
    trendValue: risk.trend.value,
    trendDirection: risk.trend.direction,
    weakSubjects: risk.weakestSubjects,
    strongestSubjects: risk.strongestSubjects,
    nextActions: risk.recommendationsSeed.slice(0, 3),
  };
};

export const buildTeacherClassSummaryInput = (
  classId: string,
  analytics: StudentRiskResult[],
): TeacherClassSummaryInput => {
  const students = analytics.length;
  const averageScore =
    students > 0
      ? roundTo(
          analytics.reduce((sum, item) => sum + item.recommendationContext.averageScore, 0) / students,
        )
      : 0;
  const highRiskStudents = analytics.filter((item) => item.riskLevel === "high").length;
  const reasonCounter = new Map<string, number>();
  for (const item of analytics) {
    for (const reason of item.reasons) {
      reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1);
    }
  }

  const topRiskReasons = [...reasonCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason]) => reason);

  const strongestSubjectCounter = new Map<string, number>();
  const weakSubjectCounter = new Map<string, number>();
  const recommendationsSeed: string[] = [];
  for (const item of analytics) {
    for (const subject of item.strongestSubjects.slice(0, 2)) {
      strongestSubjectCounter.set(subject, (strongestSubjectCounter.get(subject) ?? 0) + 1);
    }
    for (const subject of item.weakestSubjects.slice(0, 2)) {
      weakSubjectCounter.set(subject, (weakSubjectCounter.get(subject) ?? 0) + 1);
    }
    recommendationsSeed.push(...item.recommendationsSeed.slice(0, 1));
  }

  return {
    classId,
    students,
    averageScore,
    highRiskStudents,
    topRiskReasons,
    strongestSubjects: [...strongestSubjectCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([subject]) => subject),
    weakestSubjects: [...weakSubjectCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([subject]) => subject),
    recommendationsSeed: recommendationsSeed.filter((value, index, array) => array.indexOf(value) === index).slice(0, 4),
  };
};

export const buildParentSummaryInput = (risk: StudentRiskResult): ParentSummaryInput => ({
  childName: risk.fullName,
  riskLevel: risk.riskLevel,
  riskScore: risk.riskScore,
  trendDirection: risk.trend.direction,
  wins: risk.strongestSubjects.slice(0, 3),
  risks: risk.weakestSubjects.slice(0, 3),
  weeklyPlan: risk.recommendationsSeed.slice(0, 3),
});
