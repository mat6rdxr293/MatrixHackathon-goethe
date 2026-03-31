import { ScheduleEntry, ScheduleKind, User } from "../types";
import { evaluateScheduleQuality } from "../analytics/schedule/scheduleQuality";
import { AnalysisPreset } from "../analytics/types";
import { bilimClassService } from "./bilimClassService";
import { academicStoreService } from "./academicStoreService";
import { generateLLMSummaryFromStructuredData } from "./llm/llmSummaryService";
import { notificationService } from "./notificationService";
import { scheduleStoreService } from "./scheduleStoreService";
import { storageService } from "./storageService";

type SafeUser = Omit<User, "password">;

type LessonRequirement = {
  classId: string;
  subject: string;
  weeklyHours: number;
  teacherId: string;
  room: string;
  kind?: ScheduleKind;
  duration?: number;
};

type StreamGroup = {
  groupName: string;
  classIds: string[];
  subject: string;
  teacherId: string;
  room: string;
  weeklyHours: number;
  duration?: number;
};

type StreamDefinition = { streamId: string; name: string; groups: StreamGroup[] };
type TeacherBusy = { teacherId: string; day: number; slot: number };
export type PlannerWeights = {
  classDailyLoad: number;
  teacherDailyLoad: number;
  sameSubjectDay: number;
  classGap: number;
  teacherGap: number;
  lateLessons: number;
  classSpread: number;
  teacherSpread: number;
  centerBias: number;
  adjacentSameSubject: number;
};
type PlannerWeightOverrides = Partial<PlannerWeights>;

export type ScheduleGenerateInput = {
  days?: number[];
  slotsPerDay?: number;
  lessonRequirements?: LessonRequirement[];
  streams?: StreamDefinition[];
  teacherBusy?: TeacherBusy[];
  weights?: PlannerWeightOverrides;
  analysisPreset?: AnalysisPreset;
};

export type TeacherAbsenceInput = {
  teacherId: string;
  date: string;
  day: number;
  slots: number[];
  reason?: string;
};

type DraftEntry = {
  classId: string;
  day: number;
  slot: number;
  duration: number;
  subject: string;
  teacherId: string;
  room: string;
  kind: ScheduleKind;
  groupName?: string;
  streamId?: string;
  status?: "planned" | "changed" | "cancelled";
};

export type ScheduleAiReview = {
  model: "ai-constraint-planner-v2";
  weights: PlannerWeights;
  scores: {
    students: number;
    teachers: number;
    overall: number;
  };
  commentary: {
    summary: string;
    students: string;
    teachers: string;
    recommendations: string[];
  };
  metrics: {
    totalLessons: number;
    classCount: number;
    teacherCount: number;
    lateLessonShare: number;
    studentGapAvg: number;
    teacherGapAvg: number;
    studentOverloadRate: number;
    teacherOverloadRate: number;
    repeatedSubjectRate: number;
    unscheduled: number;
  };
};

const slotsByDuration = (slot: number, duration: number) =>
  [...new Array(duration)].map((_, index) => slot + index);

const key = (id: string, day: number, slot: number) => `${id}|${day}|${slot}`;
const normalizeClassId = (value: string) => value.trim().toUpperCase();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const DEFAULT_PLANNER_WEIGHTS: PlannerWeights = {
  classDailyLoad: 1,
  teacherDailyLoad: 1,
  sameSubjectDay: 1,
  classGap: 1,
  teacherGap: 1,
  lateLessons: 1,
  classSpread: 1,
  teacherSpread: 1,
  centerBias: 1,
  adjacentSameSubject: 1,
};

const normalizeWeightValue = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, 0, 3);
};

const normalizePlannerWeights = (weights?: PlannerWeightOverrides): PlannerWeights => ({
  classDailyLoad: normalizeWeightValue(weights?.classDailyLoad, DEFAULT_PLANNER_WEIGHTS.classDailyLoad),
  teacherDailyLoad: normalizeWeightValue(weights?.teacherDailyLoad, DEFAULT_PLANNER_WEIGHTS.teacherDailyLoad),
  sameSubjectDay: normalizeWeightValue(weights?.sameSubjectDay, DEFAULT_PLANNER_WEIGHTS.sameSubjectDay),
  classGap: normalizeWeightValue(weights?.classGap, DEFAULT_PLANNER_WEIGHTS.classGap),
  teacherGap: normalizeWeightValue(weights?.teacherGap, DEFAULT_PLANNER_WEIGHTS.teacherGap),
  lateLessons: normalizeWeightValue(weights?.lateLessons, DEFAULT_PLANNER_WEIGHTS.lateLessons),
  classSpread: normalizeWeightValue(weights?.classSpread, DEFAULT_PLANNER_WEIGHTS.classSpread),
  teacherSpread: normalizeWeightValue(weights?.teacherSpread, DEFAULT_PLANNER_WEIGHTS.teacherSpread),
  centerBias: normalizeWeightValue(weights?.centerBias, DEFAULT_PLANNER_WEIGHTS.centerBias),
  adjacentSameSubject: normalizeWeightValue(
    weights?.adjacentSameSubject,
    DEFAULT_PLANNER_WEIGHTS.adjacentSameSubject,
  ),
});

const uniqueSortedNumbers = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;

const spread = (values: number[]) => (values.length > 0 ? Math.max(...values) - Math.min(...values) : 0);

const gapUnits = (slots: number[]) => {
  const ordered = uniqueSortedNumbers(slots);
  if (ordered.length < 2) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const diff = ordered[index] - ordered[index - 1];
    if (diff > 1) {
      total += diff - 1;
    }
  }
  return total;
};

const classSlotsOnDay = (entries: DraftEntry[], classId: string, day: number) =>
  uniqueSortedNumbers(
    entries
      .filter((item) => item.classId === classId && item.day === day)
      .flatMap((item) => slotsByDuration(item.slot, item.duration)),
  );

const teacherSlotsOnDay = (entries: DraftEntry[], teacherId: string, day: number) =>
  uniqueSortedNumbers(
    entries
      .filter((item) => item.teacherId === teacherId && item.day === day)
      .flatMap((item) => slotsByDuration(item.slot, item.duration)),
  );

const classLoadOnDay = (entries: DraftEntry[], classId: string, day: number) =>
  entries
    .filter((item) => item.classId === classId && item.day === day)
    .reduce((sum, item) => sum + item.duration, 0);

const teacherLoadOnDay = (entries: DraftEntry[], teacherId: string, day: number) =>
  entries
    .filter((item) => item.teacherId === teacherId && item.day === day)
    .reduce((sum, item) => sum + item.duration, 0);

const subjectLoadOnDay = (entries: DraftEntry[], classId: string, day: number, subject: string) =>
  entries.filter((item) => item.classId === classId && item.day === day && item.subject === subject).length;

const hasAdjacentSameSubject = (
  entries: DraftEntry[],
  classId: string,
  day: number,
  subject: string,
  range: number[],
) => {
  const subjectSlots = entries
    .filter((item) => item.classId === classId && item.day === day && item.subject === subject)
    .flatMap((item) => slotsByDuration(item.slot, item.duration));

  return subjectSlots.some((occupiedSlot) => range.some((candidateSlot) => Math.abs(occupiedSlot - candidateSlot) === 1));
};

const scorePlacement = (
  candidate: {
    classId: string;
    day: number;
    slot: number;
    duration: number;
    subject: string;
    teacherId: string;
  },
  entries: DraftEntry[],
  days: number[],
  slotsPerDay: number,
  weights: PlannerWeights,
) => {
  const range = slotsByDuration(candidate.slot, candidate.duration);
  const classDayLoad = classLoadOnDay(entries, candidate.classId, candidate.day);
  const teacherDayLoad = teacherLoadOnDay(entries, candidate.teacherId, candidate.day);
  const sameSubjectDay = subjectLoadOnDay(entries, candidate.classId, candidate.day, candidate.subject);

  const classSlots = classSlotsOnDay(entries, candidate.classId, candidate.day);
  const teacherSlots = teacherSlotsOnDay(entries, candidate.teacherId, candidate.day);
  const classGapIncrease = gapUnits([...classSlots, ...range]) - gapUnits(classSlots);
  const teacherGapIncrease = gapUnits([...teacherSlots, ...range]) - gapUnits(teacherSlots);

  const latePenalty = range.reduce((sum, slot) => {
    if (slot >= Math.max(7, slotsPerDay - 1)) {
      return sum + 1.3;
    }
    if (slot >= 6) {
      return sum + 0.45;
    }
    return sum;
  }, 0);

  const classLoadsByDay = days.map((day) =>
    classLoadOnDay(entries, candidate.classId, day) + (day === candidate.day ? candidate.duration : 0),
  );
  const teacherLoadsByDay = days.map((day) =>
    teacherLoadOnDay(entries, candidate.teacherId, day) + (day === candidate.day ? candidate.duration : 0),
  );
  const classSpreadPenalty = spread(classLoadsByDay) / Math.max(1, slotsPerDay);
  const teacherSpreadPenalty = spread(teacherLoadsByDay) / Math.max(1, slotsPerDay);

  const center = (slotsPerDay + 1) / 2;
  const centerBias = Math.abs(candidate.slot + (candidate.duration - 1) / 2 - center) * 0.28;
  const adjacentSubjectPenalty = hasAdjacentSameSubject(
    entries,
    candidate.classId,
    candidate.day,
    candidate.subject,
    range,
  )
    ? 2.4
    : 0;

  return (
    classDayLoad * 1.9 * weights.classDailyLoad +
    teacherDayLoad * 1.35 * weights.teacherDailyLoad +
    sameSubjectDay * 3.8 * weights.sameSubjectDay +
    classGapIncrease * 4.0 * weights.classGap +
    teacherGapIncrease * 3.2 * weights.teacherGap +
    latePenalty * 2.1 * weights.lateLessons +
    classSpreadPenalty * 2.6 * weights.classSpread +
    teacherSpreadPenalty * 2.2 * weights.teacherSpread +
    centerBias * weights.centerBias +
    adjacentSubjectPenalty * weights.adjacentSameSubject
  );
};

const pickBestSlot = (
  candidates: { day: number; slot: number }[],
  requirement: {
    classId: string;
    duration: number;
    subject: string;
    teacherId: string;
  },
  entries: DraftEntry[],
  days: number[],
  slotsPerDay: number,
  weights: PlannerWeights,
) => {
  let chosen: { day: number; slot: number } | undefined;
  let chosenScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scorePlacement(
      {
        classId: requirement.classId,
        day: candidate.day,
        slot: candidate.slot,
        duration: requirement.duration,
        subject: requirement.subject,
        teacherId: requirement.teacherId,
      },
      entries,
      days,
      slotsPerDay,
      weights,
    );

    if (
      score < chosenScore ||
      (score === chosenScore &&
        (!chosen || candidate.day < chosen.day || (candidate.day === chosen.day && candidate.slot < chosen.slot)))
    ) {
      chosen = candidate;
      chosenScore = score;
    }
  }

  return chosen;
};

const pickBestStreamSlot = (
  candidates: { day: number; slot: number }[],
  stream: StreamDefinition,
  hourIndex: number,
  entries: DraftEntry[],
  days: number[],
  slotsPerDay: number,
  weights: PlannerWeights,
) => {
  let chosen: { day: number; slot: number } | undefined;
  let chosenScore = Number.POSITIVE_INFINITY;

  const evaluations = stream.groups.flatMap((group) => {
    if (hourIndex >= group.weeklyHours) {
      return [] as Array<{
        classId: string;
        subject: string;
        teacherId: string;
        duration: number;
      }>;
    }
    return group.classIds.map((classId) => ({
      classId,
      subject: group.subject,
      teacherId: group.teacherId,
      duration: group.duration ?? 1,
    }));
  });

  for (const candidate of candidates) {
    const score = evaluations.reduce(
      (sum, item) =>
        sum +
        scorePlacement(
          {
            classId: item.classId,
            day: candidate.day,
            slot: candidate.slot,
            duration: item.duration,
            subject: item.subject,
            teacherId: item.teacherId,
          },
          entries,
          days,
          slotsPerDay,
          weights,
        ),
      0,
    );

    if (
      score < chosenScore ||
      (score === chosenScore &&
        (!chosen || candidate.day < chosen.day || (candidate.day === chosen.day && candidate.slot < chosen.slot)))
    ) {
      chosen = candidate;
      chosenScore = score;
    }
  }

  return chosen;
};

const canPlace = (
  entry: Omit<DraftEntry, "day" | "slot"> & { day: number; slot: number },
  slotsPerDay: number,
  classBusy: Set<string>,
  teacherBusy: Set<string>,
  roomBusy: Set<string>,
  teacherBlocked: Set<string>,
) => {
  const range = slotsByDuration(entry.slot, entry.duration);
  if (range.some((slot) => slot > slotsPerDay)) {
    return false;
  }
  for (const slot of range) {
    if (classBusy.has(key(entry.classId, entry.day, slot))) {
      return false;
    }
    if (teacherBusy.has(key(entry.teacherId, entry.day, slot))) {
      return false;
    }
    if (roomBusy.has(key(entry.room, entry.day, slot))) {
      return false;
    }
    if (teacherBlocked.has(key(entry.teacherId, entry.day, slot))) {
      return false;
    }
  }
  return true;
};

const occupy = (entry: DraftEntry, classBusy: Set<string>, teacherBusy: Set<string>, roomBusy: Set<string>) => {
  for (const slot of slotsByDuration(entry.slot, entry.duration)) {
    classBusy.add(key(entry.classId, entry.day, slot));
    teacherBusy.add(key(entry.teacherId, entry.day, slot));
    roomBusy.add(key(entry.room, entry.day, slot));
  }
};

const sortedSlots = (days: number[], slotsPerDay: number) =>
  days.flatMap((day) => [...new Array(slotsPerDay)].map((_, index) => ({ day, slot: index + 1 })));

const defaultRequirements = () => {
  const classes = storageService.listClasses();
  const teachers = storageService.getUsers().filter((item) => item.role === "teacher");
  const subjects = [
    ...new Set(
      academicStoreService
        .listStudentProfiles()
        .flatMap((item) => item.progress.map((subject) => subject.subject)),
    ),
  ];
  if (classes.length === 0 || teachers.length === 0 || subjects.length === 0) {
    return [] as LessonRequirement[];
  }
  return classes.flatMap((schoolClass, classIndex) =>
    subjects.map((subject, subjectIndex) => ({
      classId: schoolClass.classId,
      subject,
      weeklyHours: 2,
      teacherId: teachers[(classIndex + subjectIndex) % teachers.length].id,
      room: `Каб-${subjectIndex + 101}`,
      kind: "lesson" as const,
      duration: 1,
    })),
  );
};

const orderRequirements = (
  requirements: Array<LessonRequirement & { classId: string; kind: ScheduleKind; duration: number }>,
  teacherBusyCount: Map<string, number>,
) =>
  [...requirements].sort((a, b) => {
    const aDifficulty = a.weeklyHours * a.duration * 3 + (teacherBusyCount.get(a.teacherId) ?? 0) * 0.4;
    const bDifficulty = b.weeklyHours * b.duration * 3 + (teacherBusyCount.get(b.teacherId) ?? 0) * 0.4;
    if (aDifficulty !== bDifficulty) {
      return bDifficulty - aDifficulty;
    }
    return a.classId.localeCompare(b.classId) || a.subject.localeCompare(b.subject);
  });

const buildAiReviewFromAnalytics = async (
  entries: ScheduleEntry[],
  days: number[],
  slotsPerDay: number,
  unscheduledCount: number,
  weights: PlannerWeights,
  analysisPreset: AnalysisPreset,
) => {
  const evaluation = evaluateScheduleQuality({
    entries,
    days,
    slotsPerDay,
    unscheduledCount,
    analysisPreset,
  });

  const fallbackSummary = `Качество расписания: ${evaluation.score}/100 (${evaluation.qualityLevel}).`;
  const fallbackRecommendations =
    evaluation.foundIssues.length > 0
      ? evaluation.foundIssues.slice(0, 3)
      : [
          "Сетка расписания стабильна: удерживайте баланс по нагрузке и поздним урокам.",
          "Проверяйте качество расписания при каждом крупном изменении.",
        ];

  const llmSummary = await generateLLMSummaryFromStructuredData({
    role: "admin",
    kind: "schedule-quality",
    structuredData: {
      evaluation,
      slotsPerDay,
      days,
      lessonCount: entries.length,
    },
    fallbackSummary,
    fallbackRecommendations,
  });

  const studentPenalty =
    evaluation.metrics.classGapAvg * 8 +
    evaluation.metrics.lateLessonShare * 35 +
    evaluation.metrics.overloadedDayRate * 32 +
    evaluation.metrics.unevenLoadScore * 8;

  const teacherPenalty =
    evaluation.metrics.teacherGapAvg * 10 +
    evaluation.metrics.teacherConflicts * 15 +
    evaluation.metrics.roomConflicts * 8 +
    evaluation.metrics.overloadedDayRate * 12;

  const studentsScore = clamp(Math.round(100 - studentPenalty), 0, 100);
  const teachersScore = clamp(Math.round(100 - teacherPenalty), 0, 100);

  return {
    model: "rule-based-schedule-evaluator-v1",
    weights,
    scores: {
      students: studentsScore,
      teachers: teachersScore,
      overall: evaluation.score,
    },
    commentary: {
      summary: llmSummary.summary,
      students: `Окна у классов: ${round2(evaluation.metrics.classGapAvg)}, поздние уроки: ${round2(
        evaluation.metrics.lateLessonShare * 100,
      )}%`,
      teachers: `Окна у учителей: ${round2(evaluation.metrics.teacherGapAvg)}, конфликты учителей: ${
        evaluation.metrics.teacherConflicts
      }`,
      recommendations: llmSummary.recommendations,
    },
    metrics: {
      totalLessons: evaluation.metrics.totalLessons,
      classCount: evaluation.metrics.classCount,
      teacherCount: evaluation.metrics.teacherCount,
      lateLessonShare: evaluation.metrics.lateLessonShare,
      studentGapAvg: evaluation.metrics.classGapAvg,
      teacherGapAvg: evaluation.metrics.teacherGapAvg,
      studentOverloadRate: evaluation.metrics.overloadedDayRate,
      teacherOverloadRate: evaluation.metrics.overloadedDayRate,
      repeatedSubjectRate: evaluation.metrics.unevenLoadScore,
      unscheduled: evaluation.metrics.unscheduledCount,
    },
    evaluation,
  };
};

const classIdForUser = async (user: SafeUser) => {
  if (user.role === "student") {
    if (user.classId) {
      return user.classId;
    }
    const profiles = await bilimClassService.getStudentProfiles();
    return profiles.find((item) => item.studentId === (user.linkedStudentId ?? user.id))?.classId ?? null;
  }
  if (user.role === "parent") {
    if (!user.linkedStudentId) {
      return null;
    }
    const profiles = await bilimClassService.getStudentProfiles();
    return profiles.find((item) => item.studentId === user.linkedStudentId)?.classId ?? null;
  }
  return null;
};

export const scheduleService = {
  async generateAndStore(input: ScheduleGenerateInput) {
    const days = (input.days && input.days.length > 0 ? input.days : [1, 2, 3, 4, 5]).filter(
      (day) => day >= 1 && day <= 7,
    );
    const slotsPerDay = clamp(Math.round(input.slotsPerDay ?? 8), 4, 10);
    const plannerWeights = normalizePlannerWeights(input.weights);

    const requirements = (input.lessonRequirements && input.lessonRequirements.length > 0
      ? input.lessonRequirements
      : defaultRequirements()
    ).map((item) => ({
      ...item,
      classId: normalizeClassId(item.classId),
      kind: item.kind ?? "lesson",
      duration: clamp(Math.round(item.duration ?? 1), 1, 2),
      weeklyHours: clamp(Math.round(item.weeklyHours), 1, 10),
    }));

    const streams = (input.streams ?? []).map((stream) => ({
      ...stream,
      groups: stream.groups.map((group) => ({
        ...group,
        classIds: group.classIds.map(normalizeClassId),
        weeklyHours: clamp(Math.round(group.weeklyHours), 1, 8),
        duration: clamp(Math.round(group.duration ?? 1), 1, 2),
      })),
    }));

    const teacherBlocked = new Set<string>();
    const teacherBlockedCount = new Map<string, number>();
    for (const item of input.teacherBusy ?? []) {
      teacherBlocked.add(key(item.teacherId, item.day, item.slot));
      teacherBlockedCount.set(item.teacherId, (teacherBlockedCount.get(item.teacherId) ?? 0) + 1);
    }

    const classBusy = new Set<string>();
    const teacherBusy = new Set<string>();
    const roomBusy = new Set<string>();
    const entries: DraftEntry[] = [];
    const unscheduled: string[] = [];
    const allSlots = sortedSlots(days, slotsPerDay);

    for (const stream of streams) {
      const maxHours = Math.max(...stream.groups.map((group) => group.weeklyHours));
      for (let hour = 0; hour < maxHours; hour += 1) {
        const candidates = allSlots.filter(({ day, slot }) =>
          stream.groups.every((group) => {
            if (hour >= group.weeklyHours) {
              return true;
            }
            return group.classIds.every((classId) =>
              canPlace(
                {
                  classId,
                  day,
                  slot,
                  duration: group.duration ?? 1,
                  subject: group.subject,
                  teacherId: group.teacherId,
                  room: group.room,
                  kind: "stream",
                  groupName: group.groupName,
                  streamId: stream.streamId,
                },
                slotsPerDay,
                classBusy,
                teacherBusy,
                roomBusy,
                teacherBlocked,
              ),
            );
          }),
        );

        const chosen = pickBestStreamSlot(candidates, stream, hour, entries, days, slotsPerDay, plannerWeights);
        if (!chosen) {
          unscheduled.push(`Лента ${stream.name}: час ${hour + 1} не удалось разместить`);
          continue;
        }

        for (const group of stream.groups) {
          if (hour >= group.weeklyHours) {
            continue;
          }
          for (const classId of group.classIds) {
            const entry: DraftEntry = {
              classId,
              day: chosen.day,
              slot: chosen.slot,
              duration: group.duration ?? 1,
              subject: group.subject,
              teacherId: group.teacherId,
              room: group.room,
              kind: "stream",
              groupName: group.groupName,
              streamId: stream.streamId,
            };
            entries.push(entry);
            occupy(entry, classBusy, teacherBusy, roomBusy);
          }
        }
      }
    }

    const orderedRequirements = orderRequirements(requirements, teacherBlockedCount);

    for (const requirement of orderedRequirements) {
      for (let hour = 0; hour < requirement.weeklyHours; hour += 1) {
        const candidates = allSlots.filter(({ day, slot }) =>
          canPlace(
            {
              classId: requirement.classId,
              day,
              slot,
              duration: requirement.duration,
              subject: requirement.subject,
              teacherId: requirement.teacherId,
              room: requirement.room,
              kind: requirement.kind,
            },
            slotsPerDay,
            classBusy,
            teacherBusy,
            roomBusy,
            teacherBlocked,
          ),
        );

        const chosen = pickBestSlot(
          candidates,
          {
            classId: requirement.classId,
            duration: requirement.duration,
            subject: requirement.subject,
            teacherId: requirement.teacherId,
          },
          entries,
          days,
          slotsPerDay,
          plannerWeights,
        );

        if (!chosen) {
          unscheduled.push(
            `${requirement.classId}: ${requirement.subject} (${hour + 1}/${requirement.weeklyHours}) не размещен`,
          );
          continue;
        }

        const entry: DraftEntry = {
          classId: requirement.classId,
          day: chosen.day,
          slot: chosen.slot,
          duration: requirement.duration,
          subject: requirement.subject,
          teacherId: requirement.teacherId,
          room: requirement.room,
          kind: requirement.kind,
        };
        entries.push(entry);
        occupy(entry, classBusy, teacherBusy, roomBusy);
      }
    }

    const saved = scheduleStoreService.replaceSchedule(entries);
    const aiReview = await buildAiReviewFromAnalytics(saved, days, slotsPerDay, unscheduled.length, plannerWeights, input.analysisPreset ?? "balanced");

    notificationService.create({
      type: "schedule",
      title: "Расписание обновлено",
      message: `Сформировано новое расписание. Неразмещенных занятий: ${unscheduled.length}.`,
      targetRoles: ["student", "teacher", "parent", "admin"],
      meta: { unscheduled, aiReview },
    });

    return {
      entries: saved,
      unscheduled,
      stats: {
        total: saved.length,
        classes: [...new Set(saved.map((item) => item.classId))].length,
      },
      aiReview,
    };
  },

  async applyTeacherAbsence(input: TeacherAbsenceInput) {
    const slots = [...new Set(input.slots)].filter((item) => item >= 1 && item <= 12);
    if (slots.length === 0) {
      return { replacements: [], cancelled: [] };
    }

    scheduleStoreService.addTeacherAbsences(
      slots.map((slot) => ({
        teacherId: input.teacherId,
        day: input.day,
        slot,
        date: input.date,
        reason: input.reason,
      })),
    );

    const allEntries = scheduleStoreService.listScheduleAll();
    const teachers = storageService.getUsers().filter((item) => item.role === "teacher");
    const replacements: Array<{ classId: string; slot: number; oldTeacherId: string; newTeacherId: string }> = [];
    const cancelled: Array<{ classId: string; slot: number; subject: string }> = [];

    const teacherBusy = new Set(allEntries.map((item) => key(item.teacherId, item.day, item.slot)));
    const teacherAbsenceSet = new Set(slots.map((slot) => key(input.teacherId, input.day, slot)));

    const updatedEntries = allEntries.map((entry) => {
      const isAffected = entry.teacherId === input.teacherId && entry.day === input.day && slots.includes(entry.slot);
      if (!isAffected) {
        return entry;
      }

      const classTeacher = storageService.getClassByClassId(entry.classId)?.teacherId;
      const preferred = classTeacher ? teachers.find((item) => item.id === classTeacher) : undefined;
      const candidates = [preferred, ...teachers].filter(
        (item, index, arr): item is User =>
          Boolean(item) && arr.findIndex((candidate) => candidate?.id === item?.id) === index,
      );

      const substitute = candidates.find((candidate) => {
        if (candidate.id === input.teacherId) {
          return false;
        }
        if (teacherAbsenceSet.has(key(candidate.id, input.day, entry.slot))) {
          return false;
        }
        return !teacherBusy.has(key(candidate.id, input.day, entry.slot));
      });

      if (substitute) {
        teacherBusy.add(key(substitute.id, input.day, entry.slot));
        replacements.push({
          classId: entry.classId,
          slot: entry.slot,
          oldTeacherId: entry.teacherId,
          newTeacherId: substitute.id,
        });
        return { ...entry, teacherId: substitute.id, status: "changed" as const };
      }

      cancelled.push({ classId: entry.classId, slot: entry.slot, subject: entry.subject });
      return { ...entry, status: "cancelled" as const };
    });

    scheduleStoreService.replaceSchedule(
      updatedEntries.map((item) => ({
        classId: item.classId,
        day: item.day,
        slot: item.slot,
        duration: item.duration,
        subject: item.subject,
        teacherId: item.teacherId,
        room: item.room,
        kind: item.kind,
        groupName: item.groupName,
        streamId: item.streamId,
        status: item.status,
      })),
    );

    for (const item of replacements) {
      notificationService.create({
        type: "schedule",
        title: "Замена учителя",
        message: `Класс ${item.classId}, урок ${item.slot}: назначена замена учителя.`,
        targetRoles: ["student", "parent", "teacher", "admin"],
        targetClassIds: [item.classId],
      });
    }

    for (const item of cancelled) {
      notificationService.create({
        type: "schedule",
        title: "Изменение расписания",
        message: `Класс ${item.classId}, урок ${item.slot}: ${item.subject} отменен.`,
        targetRoles: ["student", "parent", "teacher", "admin"],
        targetClassIds: [item.classId],
      });
    }

    return { replacements, cancelled };
  },

  async getScheduleForUser(user: SafeUser) {
    if (user.role === "admin") {
      return scheduleStoreService.listScheduleAll();
    }
    if (user.role === "teacher") {
      return scheduleStoreService.listScheduleByTeacher(user.id);
    }
    const classId = await classIdForUser(user);
    if (!classId) {
      return [];
    }
    return scheduleStoreService.listScheduleByClassIds([classId]);
  },

  async getScheduleForKiosk() {
    return scheduleStoreService.listScheduleAll().filter((item) => item.status !== "planned");
  },
};



