import { ScheduleKind, User } from "../types";
import { bilimClassService } from "./bilimClassService";
import { academicStoreService } from "./academicStoreService";
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

export type ScheduleGenerateInput = {
  days?: number[];
  slotsPerDay?: number;
  lessonRequirements?: LessonRequirement[];
  streams?: StreamDefinition[];
  teacherBusy?: TeacherBusy[];
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

const slotsByDuration = (slot: number, duration: number) =>
  [...new Array(duration)].map((_, index) => slot + index);
const key = (id: string, day: number, slot: number) => `${id}|${day}|${slot}`;
const normalizeClassId = (value: string) => value.trim().toUpperCase();

const defaultRequirements = () => {
  const classes = storageService.listClasses();
  const teachers = storageService.getUsers().filter((item) => item.role === "teacher");
  const subjects = [...new Set(academicStoreService.listStudentProfiles().flatMap((item) => item.progress.map((subject) => subject.subject)))];
  if (classes.length === 0 || teachers.length === 0) {
    return [] as LessonRequirement[];
  }
  if (subjects.length === 0) {
    return [] as LessonRequirement[];
  }
  return classes.flatMap((schoolClass, classIndex) =>
    subjects.map((subject, index) => ({
      classId: schoolClass.classId,
      subject,
      weeklyHours: 2,
      teacherId: teachers[(classIndex + index) % teachers.length].id,
      room: `Каб-${index + 101}`,
      kind: "lesson" as const,
      duration: 1,
    })),
  );
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
  if (range.some((item) => item > slotsPerDay)) {
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

const classLoadOnDay = (entries: DraftEntry[], classId: string, day: number) =>
  entries.filter((item) => item.classId === classId && item.day === day).length;

const subjectLoadOnDay = (entries: DraftEntry[], classId: string, day: number, subject: string) =>
  entries.filter((item) => item.classId === classId && item.day === day && item.subject === subject).length;

const pickBestSlot = (
  candidates: { day: number; slot: number }[],
  entries: DraftEntry[],
  classId: string,
  subject: string,
) =>
  [...candidates]
    .sort((a, b) => {
      const aScore =
        classLoadOnDay(entries, classId, a.day) * 3 +
        subjectLoadOnDay(entries, classId, a.day, subject) * 4 +
        (a.slot > 6 ? 1 : 0);
      const bScore =
        classLoadOnDay(entries, classId, b.day) * 3 +
        subjectLoadOnDay(entries, classId, b.day, subject) * 4 +
        (b.slot > 6 ? 1 : 0);
      return aScore - bScore;
    })
    .at(0);

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
    const slotsPerDay = Math.max(4, Math.min(10, input.slotsPerDay ?? 8));
    const requirements = (input.lessonRequirements && input.lessonRequirements.length > 0
      ? input.lessonRequirements
      : defaultRequirements()
    ).map((item) => ({
      ...item,
      classId: normalizeClassId(item.classId),
      kind: item.kind ?? "lesson",
      duration: Math.max(1, Math.min(2, item.duration ?? 1)),
      weeklyHours: Math.max(1, Math.min(10, Math.round(item.weeklyHours))),
    }));

    const streams = (input.streams ?? []).map((stream) => ({
      ...stream,
      groups: stream.groups.map((group) => ({
        ...group,
        classIds: group.classIds.map(normalizeClassId),
        weeklyHours: Math.max(1, Math.min(8, Math.round(group.weeklyHours))),
        duration: Math.max(1, Math.min(2, group.duration ?? 1)),
      })),
    }));

    const teacherBlocked = new Set<string>();
    for (const item of input.teacherBusy ?? []) {
      teacherBlocked.add(key(item.teacherId, item.day, item.slot));
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

        const chosen = candidates[0];
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

    for (const requirement of requirements) {
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

        const chosen = pickBestSlot(candidates, entries, requirement.classId, requirement.subject);
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
    notificationService.create({
      type: "schedule",
      title: "Расписание обновлено",
      message: `Сформировано новое расписание. Неразмещенных занятий: ${unscheduled.length}.`,
      targetRoles: ["student", "teacher", "parent", "admin"],
      meta: { unscheduled },
    });

    return {
      entries: saved,
      unscheduled,
      stats: { total: saved.length, classes: [...new Set(saved.map((item) => item.classId))].length },
    };
  },

  async applyTeacherAbsence(input: TeacherAbsenceInput) {
    const slots = [...new Set(input.slots)].filter((item) => item >= 1 && item <= 12);
    if (slots.length === 0) {
      return { replacements: [], cancelled: [] };
    }

    scheduleStoreService.addTeacherAbsences(
      slots.map((slot) => ({ teacherId: input.teacherId, day: input.day, slot, date: input.date, reason: input.reason })),
    );

    const allEntries = scheduleStoreService.listScheduleAll();
    const teachers = storageService.getUsers().filter((item) => item.role === "teacher");
    const replacements: Array<{ classId: string; slot: number; oldTeacherId: string; newTeacherId: string }> = [];
    const cancelled: Array<{ classId: string; slot: number; subject: string }> = [];

    const teacherBusy = new Set(allEntries.map((item) => key(item.teacherId, item.day, item.slot)));
    const teacherAbsenceSet = new Set(slots.map((slot) => key(input.teacherId, input.day, slot)));

    const updatedEntries = allEntries.map((entry) => {
      const isAffected =
        entry.teacherId === input.teacherId && entry.day === input.day && slots.includes(entry.slot);
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
        replacements.push({ classId: entry.classId, slot: entry.slot, oldTeacherId: entry.teacherId, newTeacherId: substitute.id });
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


