"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleService = void 0;
const bilimClassService_1 = require("./bilimClassService");
const academicStoreService_1 = require("./academicStoreService");
const notificationService_1 = require("./notificationService");
const scheduleStoreService_1 = require("./scheduleStoreService");
const storageService_1 = require("./storageService");
const slotsByDuration = (slot, duration) => [...new Array(duration)].map((_, index) => slot + index);
const key = (id, day, slot) => `${id}|${day}|${slot}`;
const normalizeClassId = (value) => value.trim().toUpperCase();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round2 = (value) => Math.round(value * 100) / 100;
const DEFAULT_PLANNER_WEIGHTS = {
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
const normalizeWeightValue = (value, fallback) => {
    const parsed = typeof value === "number" ? value : Number.NaN;
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return clamp(parsed, 0, 3);
};
const normalizePlannerWeights = (weights) => ({
    classDailyLoad: normalizeWeightValue(weights?.classDailyLoad, DEFAULT_PLANNER_WEIGHTS.classDailyLoad),
    teacherDailyLoad: normalizeWeightValue(weights?.teacherDailyLoad, DEFAULT_PLANNER_WEIGHTS.teacherDailyLoad),
    sameSubjectDay: normalizeWeightValue(weights?.sameSubjectDay, DEFAULT_PLANNER_WEIGHTS.sameSubjectDay),
    classGap: normalizeWeightValue(weights?.classGap, DEFAULT_PLANNER_WEIGHTS.classGap),
    teacherGap: normalizeWeightValue(weights?.teacherGap, DEFAULT_PLANNER_WEIGHTS.teacherGap),
    lateLessons: normalizeWeightValue(weights?.lateLessons, DEFAULT_PLANNER_WEIGHTS.lateLessons),
    classSpread: normalizeWeightValue(weights?.classSpread, DEFAULT_PLANNER_WEIGHTS.classSpread),
    teacherSpread: normalizeWeightValue(weights?.teacherSpread, DEFAULT_PLANNER_WEIGHTS.teacherSpread),
    centerBias: normalizeWeightValue(weights?.centerBias, DEFAULT_PLANNER_WEIGHTS.centerBias),
    adjacentSameSubject: normalizeWeightValue(weights?.adjacentSameSubject, DEFAULT_PLANNER_WEIGHTS.adjacentSameSubject),
});
const uniqueSortedNumbers = (values) => [...new Set(values)].sort((a, b) => a - b);
const average = (values) => values.length > 0 ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
const spread = (values) => (values.length > 0 ? Math.max(...values) - Math.min(...values) : 0);
const gapUnits = (slots) => {
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
const classSlotsOnDay = (entries, classId, day) => uniqueSortedNumbers(entries
    .filter((item) => item.classId === classId && item.day === day)
    .flatMap((item) => slotsByDuration(item.slot, item.duration)));
const teacherSlotsOnDay = (entries, teacherId, day) => uniqueSortedNumbers(entries
    .filter((item) => item.teacherId === teacherId && item.day === day)
    .flatMap((item) => slotsByDuration(item.slot, item.duration)));
const classLoadOnDay = (entries, classId, day) => entries
    .filter((item) => item.classId === classId && item.day === day)
    .reduce((sum, item) => sum + item.duration, 0);
const teacherLoadOnDay = (entries, teacherId, day) => entries
    .filter((item) => item.teacherId === teacherId && item.day === day)
    .reduce((sum, item) => sum + item.duration, 0);
const subjectLoadOnDay = (entries, classId, day, subject) => entries.filter((item) => item.classId === classId && item.day === day && item.subject === subject).length;
const hasAdjacentSameSubject = (entries, classId, day, subject, range) => {
    const subjectSlots = entries
        .filter((item) => item.classId === classId && item.day === day && item.subject === subject)
        .flatMap((item) => slotsByDuration(item.slot, item.duration));
    return subjectSlots.some((occupiedSlot) => range.some((candidateSlot) => Math.abs(occupiedSlot - candidateSlot) === 1));
};
const scorePlacement = (candidate, entries, days, slotsPerDay, weights) => {
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
    const classLoadsByDay = days.map((day) => classLoadOnDay(entries, candidate.classId, day) + (day === candidate.day ? candidate.duration : 0));
    const teacherLoadsByDay = days.map((day) => teacherLoadOnDay(entries, candidate.teacherId, day) + (day === candidate.day ? candidate.duration : 0));
    const classSpreadPenalty = spread(classLoadsByDay) / Math.max(1, slotsPerDay);
    const teacherSpreadPenalty = spread(teacherLoadsByDay) / Math.max(1, slotsPerDay);
    const center = (slotsPerDay + 1) / 2;
    const centerBias = Math.abs(candidate.slot + (candidate.duration - 1) / 2 - center) * 0.28;
    const adjacentSubjectPenalty = hasAdjacentSameSubject(entries, candidate.classId, candidate.day, candidate.subject, range)
        ? 2.4
        : 0;
    return (classDayLoad * 1.9 * weights.classDailyLoad +
        teacherDayLoad * 1.35 * weights.teacherDailyLoad +
        sameSubjectDay * 3.8 * weights.sameSubjectDay +
        classGapIncrease * 4.0 * weights.classGap +
        teacherGapIncrease * 3.2 * weights.teacherGap +
        latePenalty * 2.1 * weights.lateLessons +
        classSpreadPenalty * 2.6 * weights.classSpread +
        teacherSpreadPenalty * 2.2 * weights.teacherSpread +
        centerBias * weights.centerBias +
        adjacentSubjectPenalty * weights.adjacentSameSubject);
};
const pickBestSlot = (candidates, requirement, entries, days, slotsPerDay, weights) => {
    let chosen;
    let chosenScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        const score = scorePlacement({
            classId: requirement.classId,
            day: candidate.day,
            slot: candidate.slot,
            duration: requirement.duration,
            subject: requirement.subject,
            teacherId: requirement.teacherId,
        }, entries, days, slotsPerDay, weights);
        if (score < chosenScore ||
            (score === chosenScore &&
                (!chosen || candidate.day < chosen.day || (candidate.day === chosen.day && candidate.slot < chosen.slot)))) {
            chosen = candidate;
            chosenScore = score;
        }
    }
    return chosen;
};
const pickBestStreamSlot = (candidates, stream, hourIndex, entries, days, slotsPerDay, weights) => {
    let chosen;
    let chosenScore = Number.POSITIVE_INFINITY;
    const evaluations = stream.groups.flatMap((group) => {
        if (hourIndex >= group.weeklyHours) {
            return [];
        }
        return group.classIds.map((classId) => ({
            classId,
            subject: group.subject,
            teacherId: group.teacherId,
            duration: group.duration ?? 1,
        }));
    });
    for (const candidate of candidates) {
        const score = evaluations.reduce((sum, item) => sum +
            scorePlacement({
                classId: item.classId,
                day: candidate.day,
                slot: candidate.slot,
                duration: item.duration,
                subject: item.subject,
                teacherId: item.teacherId,
            }, entries, days, slotsPerDay, weights), 0);
        if (score < chosenScore ||
            (score === chosenScore &&
                (!chosen || candidate.day < chosen.day || (candidate.day === chosen.day && candidate.slot < chosen.slot)))) {
            chosen = candidate;
            chosenScore = score;
        }
    }
    return chosen;
};
const canPlace = (entry, slotsPerDay, classBusy, teacherBusy, roomBusy, teacherBlocked) => {
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
const occupy = (entry, classBusy, teacherBusy, roomBusy) => {
    for (const slot of slotsByDuration(entry.slot, entry.duration)) {
        classBusy.add(key(entry.classId, entry.day, slot));
        teacherBusy.add(key(entry.teacherId, entry.day, slot));
        roomBusy.add(key(entry.room, entry.day, slot));
    }
};
const sortedSlots = (days, slotsPerDay) => days.flatMap((day) => [...new Array(slotsPerDay)].map((_, index) => ({ day, slot: index + 1 })));
const defaultRequirements = () => {
    const classes = storageService_1.storageService.listClasses();
    const teachers = storageService_1.storageService.getUsers().filter((item) => item.role === "teacher");
    const subjects = [
        ...new Set(academicStoreService_1.academicStoreService
            .listStudentProfiles()
            .flatMap((item) => item.progress.map((subject) => subject.subject))),
    ];
    if (classes.length === 0 || teachers.length === 0 || subjects.length === 0) {
        return [];
    }
    return classes.flatMap((schoolClass, classIndex) => subjects.map((subject, subjectIndex) => ({
        classId: schoolClass.classId,
        subject,
        weeklyHours: 2,
        teacherId: teachers[(classIndex + subjectIndex) % teachers.length].id,
        room: `Каб-${subjectIndex + 101}`,
        kind: "lesson",
        duration: 1,
    })));
};
const orderRequirements = (requirements, teacherBusyCount) => [...requirements].sort((a, b) => {
    const aDifficulty = a.weeklyHours * a.duration * 3 + (teacherBusyCount.get(a.teacherId) ?? 0) * 0.4;
    const bDifficulty = b.weeklyHours * b.duration * 3 + (teacherBusyCount.get(b.teacherId) ?? 0) * 0.4;
    if (aDifficulty !== bDifficulty) {
        return bDifficulty - aDifficulty;
    }
    return a.classId.localeCompare(b.classId) || a.subject.localeCompare(b.subject);
});
const buildAiReview = (entries, days, slotsPerDay, unscheduledCount, weights) => {
    const classIds = [...new Set(entries.map((entry) => entry.classId))];
    const teacherIds = [...new Set(entries.map((entry) => entry.teacherId))];
    const totalSlotUnits = entries.reduce((sum, entry) => sum + entry.duration, 0);
    const lateSlotUnits = entries.reduce((sum, entry) => sum + slotsByDuration(entry.slot, entry.duration).filter((slot) => slot > 6).length, 0);
    let classGapUnitsTotal = 0;
    let teacherGapUnitsTotal = 0;
    let repeatedSubjectExtras = 0;
    let classDayOverloads = 0;
    let teacherDayOverloads = 0;
    const classDayLoads = [];
    for (const classId of classIds) {
        for (const day of days) {
            const dayEntries = entries.filter((entry) => entry.classId === classId && entry.day === day);
            const slots = dayEntries.flatMap((entry) => slotsByDuration(entry.slot, entry.duration));
            const dayLoad = dayEntries.reduce((sum, entry) => sum + entry.duration, 0);
            classDayLoads.push(dayLoad);
            classGapUnitsTotal += gapUnits(slots);
            if (dayLoad > 7) {
                classDayOverloads += 1;
            }
            const bySubject = new Map();
            for (const entry of dayEntries) {
                bySubject.set(entry.subject, (bySubject.get(entry.subject) ?? 0) + 1);
            }
            for (const count of bySubject.values()) {
                if (count > 1) {
                    repeatedSubjectExtras += count - 1;
                }
            }
        }
    }
    const teacherDayLoads = [];
    for (const teacherId of teacherIds) {
        for (const day of days) {
            const dayEntries = entries.filter((entry) => entry.teacherId === teacherId && entry.day === day);
            const slots = dayEntries.flatMap((entry) => slotsByDuration(entry.slot, entry.duration));
            const dayLoad = dayEntries.reduce((sum, entry) => sum + entry.duration, 0);
            teacherDayLoads.push(dayLoad);
            teacherGapUnitsTotal += gapUnits(slots);
            if (dayLoad > 6) {
                teacherDayOverloads += 1;
            }
        }
    }
    const classDayCount = Math.max(1, classIds.length * days.length);
    const teacherDayCount = Math.max(1, teacherIds.length * days.length);
    const lateLessonShare = totalSlotUnits > 0 ? lateSlotUnits / totalSlotUnits : 0;
    const studentGapAvg = classGapUnitsTotal / classDayCount;
    const teacherGapAvg = teacherGapUnitsTotal / teacherDayCount;
    const studentOverloadRate = classDayOverloads / classDayCount;
    const teacherOverloadRate = teacherDayOverloads / teacherDayCount;
    const repeatedSubjectRate = entries.length > 0 ? repeatedSubjectExtras / entries.length : 0;
    const studentGapNorm = clamp(studentGapAvg / 2, 0, 1);
    const teacherGapNorm = clamp(teacherGapAvg / 2, 0, 1);
    const lateNorm = clamp(lateLessonShare / 0.35, 0, 1);
    const repeatedNorm = clamp(repeatedSubjectRate / 0.3, 0, 1);
    const studentPenalty = studentGapNorm * 22 + lateNorm * 18 + repeatedNorm * 24 + studentOverloadRate * 26;
    const teacherPenalty = teacherGapNorm * 24 + lateNorm * 12 + teacherOverloadRate * 34;
    const studentScore = clamp(Math.round(100 - studentPenalty), 0, 100);
    const teacherScore = clamp(Math.round(100 - teacherPenalty), 0, 100);
    const baseOverall = studentScore * 0.55 + teacherScore * 0.45;
    const overallScore = clamp(Math.round(baseOverall - Math.min(10, unscheduledCount * 0.8)), 0, 100);
    const avgClassLoad = average(classDayLoads);
    const avgTeacherLoad = average(teacherDayLoads);
    const maxClassLoad = classDayLoads.length > 0 ? Math.max(...classDayLoads) : 0;
    const maxTeacherLoad = teacherDayLoads.length > 0 ? Math.max(...teacherDayLoads) : 0;
    const recommendations = [];
    if (lateLessonShare > 0.24) {
        recommendations.push("Снизить долю занятий после 6-го урока, особенно для младших и средних классов.");
    }
    if (studentGapAvg > 0.75) {
        recommendations.push("Убрать окна внутри дня у классов: переносить разорванные пары на соседние слоты.");
    }
    if (teacherGapAvg > 0.75) {
        recommendations.push("Сократить окна у учителей за счет более плотного распределения уроков по дням.");
    }
    if (repeatedSubjectRate > 0.18) {
        recommendations.push("Разнести одинаковые предметы по разным дням, чтобы снизить утомляемость и монотонность.");
    }
    if (studentOverloadRate > 0.2) {
        recommendations.push("Ограничить дни с перегрузом классов и выровнять нагрузку по неделе.");
    }
    if (teacherOverloadRate > 0.2) {
        recommendations.push("Ограничить дни с перегрузом учителей и перераспределить часы на менее загруженные дни.");
    }
    if (unscheduledCount > 0) {
        recommendations.push("Перепроверить ограничения по учителям и кабинетам: часть занятий осталась неразмещенной.");
    }
    if (recommendations.length === 0) {
        recommendations.push("График выглядит сбалансированным: критичных узких мест по нагрузке не обнаружено.");
    }
    const summaryTone = overallScore >= 85
        ? "Расписание выглядит хорошо сбалансированным."
        : overallScore >= 70
            ? "Расписание в целом рабочее, но есть зоны для улучшения."
            : "Расписание требует донастройки, чтобы снизить нагрузку и количество окон.";
    return {
        model: "ai-constraint-planner-v2",
        weights,
        scores: {
            students: studentScore,
            teachers: teacherScore,
            overall: overallScore,
        },
        commentary: {
            summary: `${summaryTone} Общая оценка удобства: ${overallScore}/100.`,
            students: `Ученики: ${studentScore}/100. Средняя дневная нагрузка ${round2(avgClassLoad)} урока, максимум ${maxClassLoad}. Доля поздних уроков: ${round2(lateLessonShare * 100)}%.`,
            teachers: `Учителя: ${teacherScore}/100. Средняя дневная нагрузка ${round2(avgTeacherLoad)} урока, максимум ${maxTeacherLoad}.`,
            recommendations,
        },
        metrics: {
            totalLessons: entries.length,
            classCount: classIds.length,
            teacherCount: teacherIds.length,
            lateLessonShare: round2(lateLessonShare),
            studentGapAvg: round2(studentGapAvg),
            teacherGapAvg: round2(teacherGapAvg),
            studentOverloadRate: round2(studentOverloadRate),
            teacherOverloadRate: round2(teacherOverloadRate),
            repeatedSubjectRate: round2(repeatedSubjectRate),
            unscheduled: unscheduledCount,
        },
    };
};
const classIdForUser = async (user) => {
    if (user.role === "student") {
        if (user.classId) {
            return user.classId;
        }
        const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
        return profiles.find((item) => item.studentId === (user.linkedStudentId ?? user.id))?.classId ?? null;
    }
    if (user.role === "parent") {
        if (!user.linkedStudentId) {
            return null;
        }
        const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
        return profiles.find((item) => item.studentId === user.linkedStudentId)?.classId ?? null;
    }
    return null;
};
exports.scheduleService = {
    async generateAndStore(input) {
        const days = (input.days && input.days.length > 0 ? input.days : [1, 2, 3, 4, 5]).filter((day) => day >= 1 && day <= 7);
        const slotsPerDay = clamp(Math.round(input.slotsPerDay ?? 8), 4, 10);
        const plannerWeights = normalizePlannerWeights(input.weights);
        const requirements = (input.lessonRequirements && input.lessonRequirements.length > 0
            ? input.lessonRequirements
            : defaultRequirements()).map((item) => ({
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
        const teacherBlocked = new Set();
        const teacherBlockedCount = new Map();
        for (const item of input.teacherBusy ?? []) {
            teacherBlocked.add(key(item.teacherId, item.day, item.slot));
            teacherBlockedCount.set(item.teacherId, (teacherBlockedCount.get(item.teacherId) ?? 0) + 1);
        }
        const classBusy = new Set();
        const teacherBusy = new Set();
        const roomBusy = new Set();
        const entries = [];
        const unscheduled = [];
        const allSlots = sortedSlots(days, slotsPerDay);
        for (const stream of streams) {
            const maxHours = Math.max(...stream.groups.map((group) => group.weeklyHours));
            for (let hour = 0; hour < maxHours; hour += 1) {
                const candidates = allSlots.filter(({ day, slot }) => stream.groups.every((group) => {
                    if (hour >= group.weeklyHours) {
                        return true;
                    }
                    return group.classIds.every((classId) => canPlace({
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
                    }, slotsPerDay, classBusy, teacherBusy, roomBusy, teacherBlocked));
                }));
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
                        const entry = {
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
                const candidates = allSlots.filter(({ day, slot }) => canPlace({
                    classId: requirement.classId,
                    day,
                    slot,
                    duration: requirement.duration,
                    subject: requirement.subject,
                    teacherId: requirement.teacherId,
                    room: requirement.room,
                    kind: requirement.kind,
                }, slotsPerDay, classBusy, teacherBusy, roomBusy, teacherBlocked));
                const chosen = pickBestSlot(candidates, {
                    classId: requirement.classId,
                    duration: requirement.duration,
                    subject: requirement.subject,
                    teacherId: requirement.teacherId,
                }, entries, days, slotsPerDay, plannerWeights);
                if (!chosen) {
                    unscheduled.push(`${requirement.classId}: ${requirement.subject} (${hour + 1}/${requirement.weeklyHours}) не размещен`);
                    continue;
                }
                const entry = {
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
        const saved = scheduleStoreService_1.scheduleStoreService.replaceSchedule(entries);
        const aiReview = buildAiReview(saved, days, slotsPerDay, unscheduled.length, plannerWeights);
        notificationService_1.notificationService.create({
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
    async applyTeacherAbsence(input) {
        const slots = [...new Set(input.slots)].filter((item) => item >= 1 && item <= 12);
        if (slots.length === 0) {
            return { replacements: [], cancelled: [] };
        }
        scheduleStoreService_1.scheduleStoreService.addTeacherAbsences(slots.map((slot) => ({
            teacherId: input.teacherId,
            day: input.day,
            slot,
            date: input.date,
            reason: input.reason,
        })));
        const allEntries = scheduleStoreService_1.scheduleStoreService.listScheduleAll();
        const teachers = storageService_1.storageService.getUsers().filter((item) => item.role === "teacher");
        const replacements = [];
        const cancelled = [];
        const teacherBusy = new Set(allEntries.map((item) => key(item.teacherId, item.day, item.slot)));
        const teacherAbsenceSet = new Set(slots.map((slot) => key(input.teacherId, input.day, slot)));
        const updatedEntries = allEntries.map((entry) => {
            const isAffected = entry.teacherId === input.teacherId && entry.day === input.day && slots.includes(entry.slot);
            if (!isAffected) {
                return entry;
            }
            const classTeacher = storageService_1.storageService.getClassByClassId(entry.classId)?.teacherId;
            const preferred = classTeacher ? teachers.find((item) => item.id === classTeacher) : undefined;
            const candidates = [preferred, ...teachers].filter((item, index, arr) => Boolean(item) && arr.findIndex((candidate) => candidate?.id === item?.id) === index);
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
                return { ...entry, teacherId: substitute.id, status: "changed" };
            }
            cancelled.push({ classId: entry.classId, slot: entry.slot, subject: entry.subject });
            return { ...entry, status: "cancelled" };
        });
        scheduleStoreService_1.scheduleStoreService.replaceSchedule(updatedEntries.map((item) => ({
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
        })));
        for (const item of replacements) {
            notificationService_1.notificationService.create({
                type: "schedule",
                title: "Замена учителя",
                message: `Класс ${item.classId}, урок ${item.slot}: назначена замена учителя.`,
                targetRoles: ["student", "parent", "teacher", "admin"],
                targetClassIds: [item.classId],
            });
        }
        for (const item of cancelled) {
            notificationService_1.notificationService.create({
                type: "schedule",
                title: "Изменение расписания",
                message: `Класс ${item.classId}, урок ${item.slot}: ${item.subject} отменен.`,
                targetRoles: ["student", "parent", "teacher", "admin"],
                targetClassIds: [item.classId],
            });
        }
        return { replacements, cancelled };
    },
    async getScheduleForUser(user) {
        if (user.role === "admin") {
            return scheduleStoreService_1.scheduleStoreService.listScheduleAll();
        }
        if (user.role === "teacher") {
            return scheduleStoreService_1.scheduleStoreService.listScheduleByTeacher(user.id);
        }
        const classId = await classIdForUser(user);
        if (!classId) {
            return [];
        }
        return scheduleStoreService_1.scheduleStoreService.listScheduleByClassIds([classId]);
    },
    async getScheduleForKiosk() {
        return scheduleStoreService_1.scheduleStoreService.listScheduleAll().filter((item) => item.status !== "planned");
    },
};
