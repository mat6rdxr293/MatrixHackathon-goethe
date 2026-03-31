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
          room: `${t("k_264")}-${101 + subjectIndex}`,
        };
      }),
    );

    const streams =
      includeStream && classes.length >= 2 && teachers.length >= 2
        ? [
            {
              streamId: "stream-10",
              name: t("k_265"),
              groups: [
                {
                  groupName: t("k_266"),
                  classIds: [classes[0].classId],
                  subject: t("k_267"),
                  teacherId: teachers[0].id,
                  room: `${t("k_264")}-L1`,
                  weeklyHours: 1,
                },
                {
                  groupName: t("k_268"),
                  classIds: [classes[1].classId],
                  subject: t("k_269"),
                  teacherId: teachers[1].id,
                  room: `${t("k_264")}-L2`,
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
      status === "planned" ? t("k_237") : status === "changed" ? t("k_206") : t("k_207");

    const reportTitle = `${t("k_213")} - ${t("k_205")}`;
    const generatedLabel = t("k_148");
    const filtersLabel = t("k_028");

    const header = [t("k_221"), t("k_208"), t("k_083"), t("k_090"), t("k_182"), t("k_209"), t("k_103")];
    const rows = filteredSchedule.map((item) => [
      getDayLabel(item.day, lang),
      String(item.slot),
      item.classId,
      item.subject,
      item.teacherId,
      item.room,
      getStatusLabel(item.status),
    ]);

    const allLabel = t("k_109");
    const filtersText = [
      `${t("k_083")}: ${classFilter === "all" ? allLabel : classFilter}`,
      `${t("k_103")}: ${statusFilter === "all" ? allLabel : getStatusLabel(statusFilter)}`,
      `${t("k_182")}: ${teacherFilter === "all" ? allLabel : teacherFilter}`,
      `${t("k_221")}: ${dayFilter === "all" ? allLabel : getDayLabel(dayFilter, lang)}`,
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
                <h3>{t("k_213")}</h3>
                <p>
                  {t("k_218")} / {t("k_223")}
                </p>
              </div>
              <div className="action-row">
                <button className="solid-button" type="button" onClick={() => openPanel("generate")}>
                  {t("k_218")}
                </button>
                <button className="outline-button" type="button" onClick={() => openPanel("absence")}>
                  {t("k_220")}
                </button>
                <button className="ghost-button" type="button" onClick={exportCsv} disabled={filteredSchedule.length < 1}>
                  CSV
                </button>
              </div>
            </section>

            <div className="schedule-summary-grid">
              <article className="stat-card">
                <p>{t("k_205")}</p>
                <strong>{summary.total}</strong>
                <span>{t("k_208")}</span>
              </article>
              <article className="stat-card good">
                <p>{t("k_237")}</p>
                <strong>{summary.planned}</strong>
                <span>{t("k_205")}</span>
              </article>
              <article className="stat-card warn">
                <p>{t("k_206")}</p>
                <strong>{summary.changed}</strong>
                <span>{t("k_205")}</span>
              </article>
              <article className="stat-card">
                <p>{t("k_207")}</p>
                <strong>{summary.cancelled}</strong>
                <span>{t("k_205")}</span>
              </article>
            </div>

            {aiReview ? (
              <section className="schedule-ai-review">
                <header>
                  <h3>{t("k_247")}</h3>
                  <div className="schedule-ai-scores">
                    <span>{`${t("k_248")}: ${aiReview.scores.students}/100`}</span>
                    <span>{`${t("k_249")}: ${aiReview.scores.teachers}/100`}</span>
                    <span>{`${t("k_250")}: ${aiReview.scores.overall}/100`}</span>
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

            <Section title={t("k_205")} action={<span className="muted-inline">{filteredSchedule.length}</span>}>
              <div className="schedule-filter-bar">
                <label className="schedule-filter-item">
                  <span>{t("k_083")}</span>
                  <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="all">{t("k_109")}</option>
                    {classOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("k_103")}</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ScheduleEntry["status"] | "all")}
                  >
                    <option value="all">{t("k_109")}</option>
                    <option value="planned">{t("k_237")}</option>
                    <option value="changed">{t("k_206")}</option>
                    <option value="cancelled">{t("k_207")}</option>
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("k_182")}</span>
                  <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
                    <option value="all">{t("k_109")}</option>
                    {teacherOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-filter-item">
                  <span>{t("k_221")}</span>
                  <select
                    value={String(dayFilter)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDayFilter(value === "all" ? "all" : Number(value));
                    }}
                  >
                    <option value="all">{t("k_109")}</option>
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>
                        {getDayLabel(day, lang)}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="ghost-button schedule-reset-button" type="button" onClick={resetFilters}>
                  {t("k_038")}
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_221")}</th>
                    <th>{t("k_208")}</th>
                    <th>{t("k_083")}</th>
                    <th>{t("k_090")}</th>
                    <th>{t("k_182")}</th>
                    <th>{t("k_209")}</th>
                    <th>{t("k_103")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t("k_210")}</td>
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
                              ? t("k_237")
                              : item.status === "changed"
                                ? t("k_206")
                                : t("k_207")}
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
                  <h3>{panelMode === "absence" ? t("k_220") : t("k_213")}</h3>
                  <p>{panelMode === "absence" ? t("k_223") : t("k_218")}</p>
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
                  {t("k_218")}
                </button>
                <button
                  className={panelMode === "absence" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setPanelMode("absence")}
                >
                  {t("k_220")}
                </button>
              </div>

              {panelMode === "absence" ? (
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
                    <select value={absenceDay} onChange={(event) => setAbsenceDay(Number(event.target.value))}>
                      {dayOptions.map((day) => (
                        <option key={day} value={day}>
                          {getDayLabel(day, lang)}
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
                      {t("k_214")}
                      <input
                        value={subjectsRaw}
                        onChange={(event) => setSubjectsRaw(event.target.value)}
                        placeholder={t("k_253")}
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
                    <div className="analysis-preset-panel">
                      <div className="analysis-preset-head">
                        <strong>{t("k_341")}</strong>
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
                </>
              )}
            </aside>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}

