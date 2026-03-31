import { getPresetWeights } from "../presets";
import { ScheduleAnalyticsInput, ScheduleEvaluationResult, ScheduleIssue } from "../types";
import { clampScore, ratioToPercent, roundTo } from "../../utils/scoringHelpers";

const slotList = (slot: number, duration: number) => [...new Array(duration)].map((_, index) => slot + index);

const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

const countGaps = (values: number[]) => {
  const ordered = uniqueSorted(values);
  if (ordered.length < 2) {
    return 0;
  }
  let gaps = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const diff = ordered[index] - ordered[index - 1];
    if (diff > 1) {
      gaps += diff - 1;
    }
  }
  return gaps;
};

const buildIssue = (
  code: ScheduleIssue["code"],
  text: string,
  severity: ScheduleIssue["severity"],
  value: number,
): ScheduleIssue => ({
  code,
  text,
  severity,
  value: roundTo(value),
});

export const evaluateScheduleQuality = (input: ScheduleAnalyticsInput): ScheduleEvaluationResult => {
  const preset = input.analysisPreset ?? "balanced";
  const weights = getPresetWeights(preset).schedule;
  const entries = input.entries;
  const days = input.days.length > 0 ? input.days : [1, 2, 3, 4, 5];
  const slotsPerDay = Math.max(1, input.slotsPerDay);
  const unscheduledCount = Math.max(0, Math.round(input.unscheduledCount ?? 0));

  const classIds = [...new Set(entries.map((entry) => entry.classId))];
  const teacherIds = [...new Set(entries.map((entry) => entry.teacherId))];

  let classGapUnitsTotal = 0;
  let teacherGapUnitsTotal = 0;
  let overloadedClassDays = 0;
  let lateSlotUnits = 0;
  let totalSlotUnits = 0;

  const classLoadVector: number[] = [];
  for (const classId of classIds) {
    for (const day of days) {
      const dayEntries = entries.filter((entry) => entry.classId === classId && entry.day === day);
      const daySlots = dayEntries.flatMap((entry) => slotList(entry.slot, entry.duration));
      const dayLoad = dayEntries.reduce((sum, entry) => sum + entry.duration, 0);
      classLoadVector.push(dayLoad);
      classGapUnitsTotal += countGaps(daySlots);
      if (dayLoad >= Math.max(7, slotsPerDay - 1)) {
        overloadedClassDays += 1;
      }
      for (const entry of dayEntries) {
        const occupiedSlots = slotList(entry.slot, entry.duration);
        totalSlotUnits += occupiedSlots.length;
        lateSlotUnits += occupiedSlots.filter((slot) => slot >= 7).length;
      }
    }
  }

  for (const teacherId of teacherIds) {
    for (const day of days) {
      const dayEntries = entries.filter((entry) => entry.teacherId === teacherId && entry.day === day);
      const daySlots = dayEntries.flatMap((entry) => slotList(entry.slot, entry.duration));
      teacherGapUnitsTotal += countGaps(daySlots);
    }
  }

  const classDayCount = Math.max(1, classIds.length * days.length);
  const teacherDayCount = Math.max(1, teacherIds.length * days.length);

  const classGapAvg = classGapUnitsTotal / classDayCount;
  const teacherGapAvg = teacherGapUnitsTotal / teacherDayCount;
  const overloadedDayRate = overloadedClassDays / classDayCount;
  const lateLessonShare = totalSlotUnits > 0 ? lateSlotUnits / totalSlotUnits : 0;

  const averageLoad =
    classLoadVector.length > 0
      ? classLoadVector.reduce((sum, value) => sum + value, 0) / classLoadVector.length
      : 0;
  const unevenLoadScore =
    classLoadVector.length > 0
      ? classLoadVector.reduce((sum, value) => sum + Math.abs(value - averageLoad), 0) / classLoadVector.length
      : 0;

  const teacherConflictsMap = new Map<string, number>();
  const roomConflictsMap = new Map<string, number>();
  for (const entry of entries) {
    for (const slot of slotList(entry.slot, entry.duration)) {
      const teacherKey = `${entry.teacherId}|${entry.day}|${slot}`;
      const roomKey = `${entry.room}|${entry.day}|${slot}`;
      teacherConflictsMap.set(teacherKey, (teacherConflictsMap.get(teacherKey) ?? 0) + 1);
      roomConflictsMap.set(roomKey, (roomConflictsMap.get(roomKey) ?? 0) + 1);
    }
  }
  const teacherConflicts = [...teacherConflictsMap.values()].filter((value) => value > 1).length;
  const roomConflicts = [...roomConflictsMap.values()].filter((value) => value > 1).length;

  const classGapPenalty = clampScore(classGapAvg / 2.2) * weights.classGaps;
  const teacherGapPenalty = clampScore(teacherGapAvg / 2.2) * weights.teacherGaps;
  const overloadPenalty = clampScore(overloadedDayRate * 100) * weights.overloadedDays;
  const latePenalty = clampScore(lateLessonShare * 100) * weights.lateLessons;
  const unevenPenalty = clampScore((unevenLoadScore / 2) * 100) * weights.unevenLoad;
  const teacherConflictPenalty = clampScore(teacherConflicts * 15) * weights.teacherConflicts;
  const roomConflictPenalty = clampScore(roomConflicts * 15) * weights.roomConflicts;
  const unscheduledPenalty = clampScore(unscheduledCount * 10) * weights.unscheduledPenalty;

  const totalWeight =
    weights.classGaps +
    weights.teacherGaps +
    weights.overloadedDays +
    weights.lateLessons +
    weights.unevenLoad +
    weights.teacherConflicts +
    weights.roomConflicts +
    weights.unscheduledPenalty;

  const normalizedPenalty =
    (classGapPenalty +
      teacherGapPenalty +
      overloadPenalty +
      latePenalty +
      unevenPenalty +
      teacherConflictPenalty +
      roomConflictPenalty +
      unscheduledPenalty) /
    Math.max(totalWeight, 1);

  const score = clampScore(Math.round(100 - normalizedPenalty));
  const qualityLevel: ScheduleEvaluationResult["qualityLevel"] =
    score >= 86 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "needs_attention" : "critical";

  const severity: ScheduleEvaluationResult["severity"] =
    qualityLevel === "excellent" || qualityLevel === "good"
      ? "low"
      : qualityLevel === "needs_attention"
        ? "medium"
        : "high";

  const issues: ScheduleIssue[] = [];
  if (classGapAvg > 0.7) {
    issues.push(
      buildIssue(
        "class_gaps",
        "Много окон у классов: нагрузка по дням рваная.",
        classGapAvg > 1.3 ? "high" : "medium",
        classGapAvg,
      ),
    );
  }
  if (teacherGapAvg > 0.7) {
    issues.push(
      buildIssue(
        "teacher_gaps",
        "Окна у учителей снижают эффективность расписания.",
        teacherGapAvg > 1.3 ? "high" : "medium",
        teacherGapAvg,
      ),
    );
  }
  if (overloadedDayRate > 0.2) {
    issues.push(
      buildIssue(
        "overloaded_days",
        "Есть перегруженные дни с высокой плотностью уроков.",
        overloadedDayRate > 0.35 ? "high" : "medium",
        ratioToPercent(overloadedClassDays, classDayCount),
      ),
    );
  }
  if (lateLessonShare > 0.18) {
    issues.push(
      buildIssue(
        "late_lessons",
        "Слишком много поздних уроков.",
        lateLessonShare > 0.3 ? "high" : "medium",
        ratioToPercent(lateSlotUnits, Math.max(totalSlotUnits, 1)),
      ),
    );
  }
  if (unevenLoadScore > 0.9) {
    issues.push(
      buildIssue(
        "uneven_load",
        "Нагрузка по неделе распределена неравномерно.",
        unevenLoadScore > 1.4 ? "high" : "medium",
        unevenLoadScore,
      ),
    );
  }
  if (teacherConflicts > 0) {
    issues.push(
      buildIssue(
        "teacher_conflicts",
        "Обнаружены конфликты по учителям в одинаковых слотах.",
        teacherConflicts > 2 ? "high" : "medium",
        teacherConflicts,
      ),
    );
  }
  if (roomConflicts > 0) {
    issues.push(
      buildIssue(
        "room_conflicts",
        "Обнаружены конфликты по кабинетам.",
        roomConflicts > 2 ? "high" : "medium",
        roomConflicts,
      ),
    );
  }
  if (unscheduledCount > 0) {
    issues.push(
      buildIssue(
        "unscheduled",
        "Часть занятий не была размещена в сетке.",
        unscheduledCount >= 4 ? "high" : "medium",
        unscheduledCount,
      ),
    );
  }

  const strengths: string[] = [];
  if (classGapAvg <= 0.5) {
    strengths.push("Низкое количество окон у классов.");
  }
  if (lateLessonShare <= 0.12) {
    strengths.push("Мало поздних уроков в конце дня.");
  }
  if (overloadedDayRate <= 0.12) {
    strengths.push("Нагрузка по дням без заметной перегрузки.");
  }
  if (teacherConflicts === 0 && roomConflicts === 0) {
    strengths.push("Нет конфликтов учителей и кабинетов.");
  }
  if (strengths.length === 0) {
    strengths.push("Базовая сетка расписания построена и пригодна для донастройки.");
  }

  return {
    score,
    severity,
    qualityLevel,
    foundIssues: issues.map((issue) => issue.text),
    strengths,
    issues,
    metrics: {
      classGapAvg: roundTo(classGapAvg),
      teacherGapAvg: roundTo(teacherGapAvg),
      overloadedDayRate: roundTo(overloadedDayRate),
      lateLessonShare: roundTo(lateLessonShare),
      unevenLoadScore: roundTo(unevenLoadScore),
      teacherConflicts,
      roomConflicts,
      unscheduledCount,
      classCount: classIds.length,
      teacherCount: teacherIds.length,
      totalLessons: entries.length,
    },
  };
};
