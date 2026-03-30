import { type FormEvent, useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AdminClassesResponse,
  AdminScheduleResponse,
  AdminUsersResponse,
  ScheduleEntry,
} from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const dayOptions = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
];

const sortSchedule = (items: ScheduleEntry[]) =>
  [...items].sort((a, b) => a.day - b.day || a.slot - b.slot || a.classId.localeCompare(b.classId));

const todayIso = new Date().toISOString().slice(0, 10);

export function AdminSchedulePage() {
  const { t } = useI18n();

  const scheduleState = useApiData<AdminScheduleResponse>("/api/admin/schedule");
  const usersState = useApiData<AdminUsersResponse>("/api/admin/users");
  const classesState = useApiData<AdminClassesResponse>("/api/admin/classes");

  const [subjectsRaw, setSubjectsRaw] = useState("");
  const [weeklyHours, setWeeklyHours] = useState(2);
  const [slotsPerDay, setSlotsPerDay] = useState(8);
  const [includeStream, setIncludeStream] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [unscheduled, setUnscheduled] = useState<string[]>([]);

  const [absenceTeacherId, setAbsenceTeacherId] = useState("");
  const [absenceDay, setAbsenceDay] = useState(1);
  const [absenceDate, setAbsenceDate] = useState(todayIso);
  const [absenceSlotsRaw, setAbsenceSlotsRaw] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceError, setAbsenceError] = useState<string | null>(null);

  const loading = scheduleState.loading || usersState.loading || classesState.loading;
  const error = scheduleState.error ?? usersState.error ?? classesState.error;

  const teachers = useMemo(
    () => (usersState.data?.users ?? []).filter((item) => item.role === "teacher"),
    [usersState.data],
  );

  const classes = useMemo(() => classesState.data?.items ?? [], [classesState.data]);

  const buildGeneratePayload = () => {
    const subjects = subjectsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const lessonRequirements = classes.flatMap((schoolClass, classIndex) =>
      subjects.map((subject, subjectIndex) => {
        const teacher = teachers[(classIndex + subjectIndex) % Math.max(teachers.length, 1)];
        return {
          classId: schoolClass.classId,
          subject,
          weeklyHours,
          teacherId: teacher?.id ?? "teacher-1",
          room: `Каб-${101 + subjectIndex}`,
        };
      }),
    );

    const streams =
      includeStream && classes.length >= 2 && teachers.length >= 2
        ? [
            {
              streamId: "stream-10",
              name: "Профильная лента",
              groups: [
                {
                  groupName: "Тех",
                  classIds: [classes[0].classId],
                  subject: "Информатика",
                  teacherId: teachers[0].id,
                  room: "Каб-Л1",
                  weeklyHours: 1,
                },
                {
                  groupName: "Гум",
                  classIds: [classes[1].classId],
                  subject: "Литература",
                  teacherId: teachers[1].id,
                  room: "Каб-Л2",
                  weeklyHours: 1,
                },
              ],
            },
          ]
        : [];

    return {
      days: [1, 2, 3, 4, 5],
      slotsPerDay,
      lessonRequirements,
      streams,
    };
  };

  const generateSchedule = async () => {
    setGenerating(true);
    setGenerateError(null);
    setUnscheduled([]);

    try {
      const payload = buildGeneratePayload();
      const response = await privateApi.post<{
        entries: ScheduleEntry[];
        unscheduled: string[];
      }>("/api/admin/schedule/generate", payload);
      setUnscheduled(response.data.unscheduled);
      await scheduleState.refresh();
    } catch (error) {
      setGenerateError(getErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const submitAbsence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAbsenceSaving(true);
    setAbsenceError(null);

    try {
      await privateApi.post("/api/admin/schedule/teacher-absence", {
        teacherId: absenceTeacherId,
        day: absenceDay,
        date: absenceDate,
        slots: absenceSlotsRaw
          .split(",")
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item)),
        reason: absenceReason,
      });
      await scheduleState.refresh();
    } catch (error) {
      setAbsenceError(getErrorMessage(error));
    } finally {
      setAbsenceSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={scheduleState.refresh} />

        {!loading && !error ? (
          <>
            <div className="dual-grid">
              <Section title={t("k_213")}>
                <form className="admin-form" onSubmit={(event) => event.preventDefault()}>
                  <label>
                    {t("k_214")}
                    <input
                      value={subjectsRaw}
                      onChange={(event) => setSubjectsRaw(event.target.value)}
                      placeholder="Алгебра,Физика,История"
                    />
                  </label>
                  <label>
                    {t("k_215")}
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={weeklyHours}
                      onChange={(event) => setWeeklyHours(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    {t("k_216")}
                    <input
                      type="number"
                      min={4}
                      max={10}
                      value={slotsPerDay}
                      onChange={(event) => setSlotsPerDay(Number(event.target.value))}
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={includeStream}
                      onChange={(event) => setIncludeStream(event.target.checked)}
                    />
                    <span>{t("k_217")}</span>
                  </label>
                  {generateError ? <p className="form-error">{generateError}</p> : null}
                  <button className="solid-button" type="button" onClick={() => void generateSchedule()}>
                    {generating ? t("k_203") : t("k_218")}
                  </button>
                </form>
                {unscheduled.length > 0 ? (
                  <div className="warn-box">
                    <strong>{t("k_219")}</strong>
                    <ul className="plain-list">
                      {unscheduled.slice(0, 8).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Section>

              <Section title={t("k_220")}>
                <form className="admin-form" onSubmit={submitAbsence}>
                  <label>
                    {t("k_182")}
                    <select
                      value={absenceTeacherId}
                      onChange={(event) => setAbsenceTeacherId(event.target.value)}
                      required
                    >
                      <option value="">{t("k_193")}</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("k_148")}
                    <input
                      type="date"
                      value={absenceDate}
                      onChange={(event) => setAbsenceDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("k_221")}
                    <select
                      value={absenceDay}
                      onChange={(event) => setAbsenceDay(Number(event.target.value))}
                    >
                      {dayOptions.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("k_222")}
                    <input
                      value={absenceSlotsRaw}
                      onChange={(event) => setAbsenceSlotsRaw(event.target.value)}
                      placeholder="1,2,3"
                    />
                  </label>
                  <label>
                    {t("k_150")}
                    <input value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} />
                  </label>
                  {absenceError ? <p className="form-error">{absenceError}</p> : null}
                  <button className="solid-button" type="submit" disabled={absenceSaving}>
                    {absenceSaving ? t("k_151") : t("k_223")}
                  </button>
                </form>
              </Section>
            </div>

            <Section title={t("k_205")}> 
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_148")}</th>
                    <th>{t("k_208")}</th>
                    <th>{t("k_083")}</th>
                    <th>{t("k_090")}</th>
                    <th>{t("k_182")}</th>
                    <th>{t("k_209")}</th>
                    <th>{t("k_103")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortSchedule(scheduleState.data?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.day}</td>
                      <td>{item.slot}</td>
                      <td>{item.classId}</td>
                      <td>{item.subject}</td>
                      <td>{item.teacherId}</td>
                      <td>{item.room}</td>
                      <td>
                        {item.status === "planned" ? <span className="chip good">{t("k_237")}</span> : null}
                        {item.status === "changed" ? <span className="chip warn">{t("k_206")}</span> : null}
                        {item.status === "cancelled" ? <span className="chip bad">{t("k_207")}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}



