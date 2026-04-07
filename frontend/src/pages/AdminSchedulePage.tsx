import { type FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AdminClassesResponse,
  AdminScheduleResponse,
  AdminUsersResponse,
  Lang,
  ScheduleEntry,
} from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import {
  getPlannerPresetWeights,
  isPlannerPresetId,
  plannerPresetOptions,
  plannerPresetStorageKey,
  type PlannerPresetId,
  type PlannerWeights,
} from "../config/adminScheduleAiPresets";

type PanelMode = "generate" | "absence" | null;

type ScheduleAiReview = {
  model: string;
  weights?: PlannerWeights;
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
};

const dayOptions = [1, 2, 3, 4, 5, 6];

const sortSchedule = (items: ScheduleEntry[]) =>
  [...items].sort((a, b) => a.day - b.day || a.slot - b.slot || a.classId.localeCompare(b.classId));

const getLocaleTag = (lang: Lang) => (lang === "kk" ? "kk-KZ" : "ru-RU");

const getDayLabel = (day: number, lang: Lang) => {
  if (day < 1 || day > 7) {
    return String(day);
  }
  const date = new Date(Date.UTC(2024, 0, day));
  const raw = new Intl.DateTimeFormat(getLocaleTag(lang), { weekday: "short" }).format(date).replace(".", "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const todayIso = new Date().toISOString().slice(0, 10);

export function AdminSchedulePage() {
  const { lang, t } = useI18n();

  const scheduleState = useApiData<AdminScheduleResponse>("/api/admin/schedule");
  const usersState = useApiData<AdminUsersResponse>("/api/admin/users");
  const classesState = useApiData<AdminClassesResponse>("/api/admin/classes");

  const [panelMode, setPanelMode] = useState<PanelMode>(null);

  const [subjectsRaw, setSubjectsRaw] = useState("");
  const [weeklyHours, setWeeklyHours] = useState(2);
  const [slotsPerDay, setSlotsPerDay] = useState(8);
  const [includeStream, setIncludeStream] = useState(false);
  const [analysisPreset, setAnalysisPreset] = useState<PlannerPresetId>(() => {
    if (typeof window === "undefined") {
      return "balanced";
    }
    const saved = window.localStorage.getItem(plannerPresetStorageKey);
    return saved && isPlannerPresetId(saved) ? saved : "balanced";
  });
  const plannerWeights = useMemo(() => getPlannerPresetWeights(analysisPreset), [analysisPreset]);
  const [generating, setGenerating] = useState(false);
  const [importingSubjects, setImportingSubjects] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [unscheduled, setUnscheduled] = useState<string[]>([]);
  const [aiReview, setAiReview] = useState<ScheduleAiReview | null>(null);

  const [absenceTeacherId, setAbsenceTeacherId] = useState("");
  const [absenceDay, setAbsenceDay] = useState(1);
  const [absenceDate, setAbsenceDate] = useState(todayIso);
  const [absenceSlotsRaw, setAbsenceSlotsRaw] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceError, setAbsenceError] = useState<string | null>(null);

  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ScheduleEntry["status"] | "all">("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState<number | "all">("all");

  const loading = scheduleState.loading || usersState.loading || classesState.loading;
  const error = scheduleState.error ?? usersState.error ?? classesState.error;

  const teachers = useMemo(
    () => (usersState.data?.users ?? []).filter((item) => item.role === "teacher"),
    [usersState.data],
  );

  const classes = useMemo(() => classesState.data?.items ?? [], [classesState.data]);

  const scheduleItems = useMemo(() => sortSchedule(scheduleState.data?.items ?? []), [scheduleState.data]);

  const classOptions = useMemo(() => {
    const fromClasses = classes.map((item) => item.classId);
    const fromSchedule = scheduleItems.map((item) => item.classId);
    return [...new Set([...fromClasses, ...fromSchedule])].sort((a, b) => a.localeCompare(b));
  }, [classes, scheduleItems]);

  const teacherOptions = useMemo(
    () => [...new Set(scheduleItems.map((item) => item.teacherId))].sort((a, b) => a.localeCompare(b)),
    [scheduleItems],
  );

  const filteredSchedule = useMemo(
    () =>
      scheduleItems.filter((item) => {
        if (classFilter !== "all" && item.classId !== classFilter) {
          return false;
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        if (teacherFilter !== "all" && item.teacherId !== teacherFilter) {
          return false;
        }
        if (dayFilter !== "all" && item.day !== dayFilter) {
          return false;
        }
        return true;
      }),
    [classFilter, dayFilter, scheduleItems, statusFilter, teacherFilter],
  );

  const summary = useMemo(
    () =>
      scheduleItems.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "planned") acc.planned += 1;
          if (item.status === "changed") acc.changed += 1;
          if (item.status === "cancelled") acc.cancelled += 1;
          return acc;
        },
        { total: 0, planned: 0, changed: 0, cancelled: 0 },
      ),
    [scheduleItems],
  );

  useEffect(() => {
    if (!panelMode) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelMode(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(plannerPresetStorageKey, analysisPreset);
  }, [analysisPreset]);

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
          room: `${t("room_2")}-${101 + subjectIndex}`,
        };
      }),
    );

    const streams =
      includeStream && classes.length >= 2 && teachers.length >= 2
        ? [
            {
              streamId: "stream-10",
              name: t("profiled_stream"),
              groups: [
                {
                  groupName: t("tech"),
                  classIds: [classes[0].classId],
                  subject: t("informatics"),
                  teacherId: teachers[0].id,
                  room: `${t("room_2")}-L1`,
                  weeklyHours: 1,
                },
                {
                  groupName: t("humanities"),
                  classIds: [classes[1].classId],
                  subject: t("literature"),
                  teacherId: teachers[1].id,
                  room: `${t("room_2")}-L2`,
                  weeklyHours: 1,
                },
              ],
            },
          ]
        : [];

    const mappedAnalysisPreset = analysisPreset === "development" ? "comfort" : analysisPreset;

    return {
      days: [1, 2, 3, 4, 5],
      slotsPerDay,
      lessonRequirements,
      streams,
      analysisPreset: mappedAnalysisPreset,
      weights: plannerWeights,
    };
  };

  const generateSchedule = async () => {
    setGenerating(true);
    setGenerateError(null);
    setUnscheduled([]);
    setAiReview(null);

    try {
      const payload = buildGeneratePayload();
      const response = await privateApi.post<{
        entries: ScheduleEntry[];
        unscheduled: string[];
        aiReview?: ScheduleAiReview;
      }>("/api/admin/schedule/generate", payload);
      setUnscheduled(response.data.unscheduled);
      setAiReview(response.data.aiReview ?? null);
      await scheduleState.refresh();
    } catch (requestError) {
      setGenerateError(getErrorMessage(requestError));
    } finally {
      setGenerating(false);
    }
  };

  const importSubjectsFromBilimClass = async () => {
    setImportingSubjects(true);
    setGenerateError(null);

    try {
      const response = await privateApi.get<{ source: "bilimclass" | "database"; subjects: string[] }>(
        "/api/admin/schedule/import-subjects",
      );

      const importedSubjects = response.data.subjects
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (importedSubjects.length === 0) {
        setGenerateError(t("in_bilimclass_not_found_subjects_for_selected_class"));
        return;
      }

      setSubjectsRaw(importedSubjects.join(","));
    } catch (requestError) {
      setGenerateError(getErrorMessage(requestError));
    } finally {
      setImportingSubjects(false);
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
    } catch (requestError) {
      setAbsenceError(getErrorMessage(requestError));
    } finally {
      setAbsenceSaving(false);
    }
  };

  const exportCsv = () => {
    if (filteredSchedule.length === 0) {
      return;
    }
    const getStatusLabel = (status: ScheduleEntry["status"]) =>
      status === "planned" ? t("by_plan") : status === "changed" ? t("replacement") : t("cancelled");

    const reportTitle = `${t("smart_schedule")} - ${t("schedule")}`;
    const generatedLabel = t("date");
    const filtersLabel = t("settings");

    const header = [t("day_week"), t("lesson"), t("class"), t("subject"), t("curator"), t("room"), t("status")];
    const rows = filteredSchedule.map((item) => [
      getDayLabel(item.day, lang),
      String(item.slot),
      item.classId,
      item.subject,
      item.teacherId,
      item.room,
      getStatusLabel(item.status),
    ]);

    const allLabel = t("all");
    const filtersText = [
      `${t("class")}: ${classFilter === "all" ? allLabel : classFilter}`,
      `${t("status")}: ${statusFilter === "all" ? allLabel : getStatusLabel(statusFilter)}`,
      `${t("curator")}: ${teacherFilter === "all" ? allLabel : teacherFilter}`,
      `${t("day_week")}: ${dayFilter === "all" ? allLabel : getDayLabel(dayFilter, lang)}`,
    ].join(" | ");

    const generatedAt = new Intl.DateTimeFormat(getLocaleTag(lang), {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date());

    const csv = [
      [reportTitle],
      [`${generatedLabel}: ${generatedAt}`],
      [`${filtersLabel}: ${filtersText}`],
      [],
      header,
      ...rows,
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setClassFilter("all");
    setStatusFilter("all");
    setTeacherFilter("all");
    setDayFilter("all");
  };

  const openPanel = (mode: Exclude<PanelMode, null>) => {
    if (mode === "generate") {
      setGenerateError(null);
    } else {
      setAbsenceError(null);
    }
    setPanelMode(mode);
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={scheduleState.refresh} />

        {!loading && !error ? (
          <>
            <section className="schedule-actions-card">
              <div className="schedule-actions-copy">
                <h3>{t("smart_schedule")}</h3>
                <p>
                  {t("generate_schedule")} / {t("rebuild_schedule")}
                </p>
              </div>
              <div className="action-row">
                <button className="solid-button" type="button" onClick={() => openPanel("generate")}>
                  {t("generate_schedule")}
                </button>
                <button className="outline-button" type="button" onClick={() => openPanel("absence")}>
                  {t("absence_teachers")}
                </button>
                <button className="ghost-button" type="button" onClick={exportCsv} disabled={filteredSchedule.length < 1}>
                  CSV
                </button>
              </div>
            </section>

            <div className="schedule-summary-grid">
              <article className="stat-card">
                <p>{t("schedule")}</p>
                <strong>{summary.total}</strong>
                <span>{t("lesson")}</span>
              </article>
              <article className="stat-card good">
                <p>{t("by_plan")}</p>
                <strong>{summary.planned}</strong>
                <span>{t("schedule")}</span>
              </article>
              <article className="stat-card warn">
                <p>{t("replacement")}</p>
                <strong>{summary.changed}</strong>
                <span>{t("schedule")}</span>
              </article>
              <article className="stat-card">
                <p>{t("cancelled")}</p>
                <strong>{summary.cancelled}</strong>
                <span>{t("schedule")}</span>
              </article>
            </div>

            {aiReview ? (
              <section className="schedule-ai-review">
                <header>
                  <h3>{t("comment_ai_2")}</h3>
                  <div className="schedule-ai-scores">
                    <span>{`${t("students_3")}: ${aiReview.scores.students}/100`}</span>
                    <span>{`${t("teachers_2")}: ${aiReview.scores.teachers}/100`}</span>
                    <span>{`${t("overall")}: ${aiReview.scores.overall}/100`}</span>
                  </div>
                </header>
                <p>{aiReview.commentary.summary}</p>
                <p>{aiReview.commentary.students}</p>
                <p>{aiReview.commentary.teachers}</p>
                <ul className="plain-list">
                  {aiReview.commentary.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Section title={t("schedule")} action={<span className="muted-inline">{filteredSchedule.length}</span>}>
              <div className="schedule-filter-bar">
                <label className="schedule-filter-item">
                  <span>{t("class")}</span>
                  <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="all">{t("all")}</option>
                    {classOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("status")}</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ScheduleEntry["status"] | "all")}
                  >
                    <option value="all">{t("all")}</option>
                    <option value="planned">{t("by_plan")}</option>
                    <option value="changed">{t("replacement")}</option>
                    <option value="cancelled">{t("cancelled")}</option>
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("curator")}</span>
                  <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
                    <option value="all">{t("all")}</option>
                    {teacherOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("day_week")}</span>
                  <select
                    value={String(dayFilter)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDayFilter(value === "all" ? "all" : Number(value));
                    }}
                  >
                    <option value="all">{t("all")}</option>
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>
                        {getDayLabel(day, lang)}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="ghost-button schedule-reset-button" type="button" onClick={resetFilters}>
                  {t("retry_button")}
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("day_week")}</th>
                    <th>{t("lesson")}</th>
                    <th>{t("class")}</th>
                    <th>{t("subject")}</th>
                    <th>{t("curator")}</th>
                    <th>{t("room")}</th>
                    <th>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t("schedule_yet_not_filled")}</td>
                    </tr>
                  ) : (
                    filteredSchedule.map((item) => (
                      <tr key={item.id}>
                        <td>{getDayLabel(item.day, lang)}</td>
                        <td>{item.slot}</td>
                        <td>{item.classId}</td>
                        <td>{item.subject}</td>
                        <td>{item.teacherId}</td>
                        <td>{item.room}</td>
                        <td>
                          <span
                            className={
                              item.status === "planned"
                                ? "chip good"
                                : item.status === "changed"
                                  ? "chip warn"
                                  : "chip bad"
                            }
                          >
                            {item.status === "planned"
                              ? t("by_plan")
                              : item.status === "changed"
                                ? t("replacement")
                                : t("cancelled")}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Section>

            <button
              className={panelMode ? "schedule-drawer-backdrop show" : "schedule-drawer-backdrop"}
              type="button"
              aria-hidden={panelMode ? "false" : "true"}
              tabIndex={-1}
              onClick={() => setPanelMode(null)}
            />

            <aside className={panelMode ? "schedule-drawer open" : "schedule-drawer"} aria-hidden={!panelMode}>
              <header className="schedule-drawer-head">
                <div>
                  <h3>{panelMode === "absence" ? t("absence_teachers") : t("smart_schedule")}</h3>
                  <p>{panelMode === "absence" ? t("rebuild_schedule") : t("generate_schedule")}</p>
                </div>
                <button className="icon-btn schedule-drawer-close" type="button" onClick={() => setPanelMode(null)}>
                  <X size={18} />
                </button>
              </header>

              <div className="schedule-drawer-tabs">
                <button
                  className={panelMode === "generate" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setPanelMode("generate")}
                >
                  {t("generate_schedule")}
                </button>
                <button
                  className={panelMode === "absence" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setPanelMode("absence")}
                >
                  {t("absence_teachers")}
                </button>
              </div>

              {panelMode === "absence" ? (
                <form className="admin-form" onSubmit={submitAbsence}>
                  <label>
                    {t("curator")}
                    <select
                      value={absenceTeacherId}
                      onChange={(event) => setAbsenceTeacherId(event.target.value)}
                      required
                    >
                      <option value="">{t("select_later")}</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("date")}
                    <input
                      type="date"
                      value={absenceDate}
                      onChange={(event) => setAbsenceDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("day_week")}
                    <select value={absenceDay} onChange={(event) => setAbsenceDay(Number(event.target.value))}>
                      {dayOptions.map((day) => (
                        <option key={day} value={day}>
                          {getDayLabel(day, lang)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("numbers_lessons_by_comma")}
                    <input
                      value={absenceSlotsRaw}
                      onChange={(event) => setAbsenceSlotsRaw(event.target.value)}
                      placeholder="1,2,3"
                    />
                  </label>
                  <label>
                    {t("description")}
                    <input value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} />
                  </label>
                  {absenceError ? <p className="form-error">{absenceError}</p> : null}
                  <button className="solid-button" type="submit" disabled={absenceSaving}>
                    {absenceSaving ? t("publishing") : t("rebuild_schedule")}
                  </button>
                </form>
              ) : (
                <>
                  <form
                    className="admin-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void generateSchedule();
                    }}
                  >
                    <label>
                      {t("subjects_by_comma")}
                      <input
                        value={subjectsRaw}
                        onChange={(event) => setSubjectsRaw(event.target.value)}
                        placeholder={t("algebra_physics_history")}
                      />
                      <div className="admin-inline-actions">
                        <button
                          className="outline-button"
                          type="button"
                          onClick={() => void importSubjectsFromBilimClass()}
                          disabled={importingSubjects}
                          title={t("import_subjects_from_bilimclass")}
                        >
                          {importingSubjects ? t("sync") : t("import_subjects")}
                        </button>
                      </div>
                    </label>
                    <label>
                      {t("hours_in_week")}
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={weeklyHours}
                        onChange={(event) => setWeeklyHours(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      {t("lessons_in_day")}
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
                      <span>{t("add_profiled_stream")}</span>
                    </label>
                    <div className="analysis-preset-panel">
                      <div className="analysis-preset-head">
                        <strong>{t("schedule_analysis_mode_title")}</strong>
                      </div>
                      <div className="analysis-preset-grid">
                        {plannerPresetOptions.map((preset) => {
                          const isActive = analysisPreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              className={isActive ? "analysis-preset-card active" : "analysis-preset-card"}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() => setAnalysisPreset(preset.id)}
                              title={t(preset.descriptionKey)}
                            >
                              <span className="analysis-preset-card-title">{t(preset.titleKey)}</span>
                              <span className="analysis-preset-card-desc">{t(preset.descriptionKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {generateError ? <p className="form-error">{generateError}</p> : null}
                    <button className="solid-button" type="submit" disabled={generating}>
                      {generating ? t("generating") : t("generate_schedule")}
                    </button>
                  </form>
                  {unscheduled.length > 0 ? (
                    <div className="warn-box">
                      <strong>{t("not_failed_place")}</strong>
                      <ul className="plain-list">
                        {unscheduled.slice(0, 8).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </aside>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}

