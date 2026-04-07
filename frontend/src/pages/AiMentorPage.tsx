import { FileText, MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AiChatRequest,
  AiChatMessage,
  AiChatResponse,
  AiMentorResponse,
  ClassReportResponse,
  PredictionsResponse,
  StudentJournalResponse,
} from "../types/portal";
import { TrendBarChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const initialAssistantMessage = (text: string): AiChatMessage => ({
  role: "assistant",
  content: text,
});

type MentorScope = {
  eduYear: number;
  periodType: string;
  period: number;
};

const normalizePeriodType = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized.includes("quarter") || normalized.includes("четвер")) {
    return "quarter";
  }
  if (normalized.includes("halfyear") || normalized.includes("semester") || normalized.includes("полугод")) {
    return "halfyear";
  }
  if (normalized.includes("year") || normalized.includes("год")) {
    return "year";
  }
  return normalized || "quarter";
};

const buildPeriodOptions = (periodType: string, fallback: number[]) => {
  if (periodType === "quarter") {
    return [1, 2, 3, 4];
  }
  if (periodType === "halfyear") {
    return [1, 2];
  }
  if (periodType === "year") {
    return [1];
  }
  return fallback.length > 0 ? fallback : [1, 2, 3, 4];
};

export function AiMentorPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isScopedRole = user?.role === "student" || user?.role === "parent";

  const journalPath = useMemo(() => {
    if (!isScopedRole) {
      return null;
    }
    const params = new URLSearchParams({ lang });
    return `/api/journal?${params.toString()}`;
  }, [isScopedRole, lang]);
  const journalState = useApiData<StudentJournalResponse>(journalPath);
  const [selectedScope, setSelectedScope] = useState<MentorScope | null>(null);

  useEffect(() => {
    const journal = journalState.data;
    if (!journal) {
      return;
    }
    setSelectedScope((prev) => {
      if (
        prev &&
        prev.eduYear === journal.selected.eduYear &&
        prev.period === journal.selected.period &&
        normalizePeriodType(prev.periodType) === normalizePeriodType(journal.selected.periodType)
      ) {
        return prev;
      }
      return {
        eduYear: journal.selected.eduYear,
        period: journal.selected.period,
        periodType: normalizePeriodType(journal.selected.periodType),
      };
    });
  }, [journalState.data]);

  const mentorPath = useMemo(() => {
    if (!isScopedRole || !selectedScope) {
      return `/api/ai-mentor?lang=${lang}`;
    }
    const params = new URLSearchParams({
      eduYear: String(selectedScope.eduYear),
      periodType: selectedScope.periodType,
      period: String(selectedScope.period),
      lang,
    });
    return `/api/ai-mentor?${params.toString()}`;
  }, [isScopedRole, lang, selectedScope]);

  const mentorState = useApiData<AiMentorResponse>(mentorPath);
  const predictionsState = useApiData<PredictionsResponse>("/api/predictions");

  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<ClassReportResponse | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"openai" | "local" | "demo" | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<"analysis" | "chat">("analysis");
  const [showAdvancedAnalysis, setShowAdvancedAnalysis] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [selectedTrendSubjects, setSelectedTrendSubjects] = useState<string[]>([]);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([initialAssistantMessage(t("hello_i_ai_assistant_lyceum_ask_question_by_performance"))]);
    }
  }, [messages.length, t]);

  useEffect(() => {
    if (!chatViewportRef.current) {
      return;
    }
    chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
  }, [messages, chatLoading]);

  const classOptions = useMemo(() => {
    if (!predictionsState.data) {
      return [] as string[];
    }
    if (predictionsState.data.role === "teacher") {
      return predictionsState.data.classes;
    }
    if (predictionsState.data.role === "admin") {
      return predictionsState.data.classRadar.map((item) => item.classId);
    }
    return [];
  }, [predictionsState.data]);

  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const mentorData = mentorState.data;
  const strengths = mentorData?.strengths ?? mentorData?.strongSides ?? [];
  const weaknesses = mentorData?.weaknesses ?? mentorData?.weakSides ?? [];

  const quickPrompts = useMemo(
    () => [t("where_at_me_highest_high_risk"), t("build_plan_for_7_days"), t("what_discuss_with_teacher_parent")],
    [t],
  );

  const availableYears = useMemo(() => {
    if (!journalState.data?.filters.years?.length) {
      return selectedScope ? [selectedScope.eduYear] : [];
    }
    return journalState.data.filters.years;
  }, [journalState.data, selectedScope]);

  const availablePeriodTypes = useMemo(() => {
    const values = journalState.data?.filters.periodTypes ?? [];
    const normalized = values.map((value) => normalizePeriodType(value)).filter(Boolean);
    return normalized.length > 0 ? [...new Set(normalized)] : ["quarter", "halfyear"];
  }, [journalState.data]);

  const availablePeriods = useMemo(() => {
    const fallback = journalState.data?.filters.periods ?? [];
    return buildPeriodOptions(selectedScope?.periodType ?? "quarter", fallback);
  }, [journalState.data, selectedScope?.periodType]);

  const currentMode = (activeTab === "chat" ? chatMode : null) ?? mentorData?.mode ?? null;
  const modeLabel =
    currentMode === "openai"
      ? t("cloud_ai_mode")
      : currentMode === "local"
        ? t("local_ai_mode")
        : currentMode === "demo"
          ? t("demo_mode")
          : null;

  const trendOptions = mentorData?.trends ?? [];

  useEffect(() => {
    if (trendOptions.length === 0) {
      setSelectedTrendSubjects((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    setSelectedTrendSubjects((prev) => {
      const allowed = prev.filter((subject) => trendOptions.some((item) => item.subject === subject)).slice(0, 5);
      if (allowed.length > 0) {
        if (allowed.length === prev.length && allowed.every((item, index) => item === prev[index])) {
          return prev;
        }
        return allowed;
      }
      const next = trendOptions
        .slice()
        .sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
        .slice(0, 5)
        .map((item) => item.subject);
      if (next.length === prev.length && next.every((item, index) => item === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [trendOptions]);

  const visibleTrends = useMemo(() => {
    if (trendOptions.length === 0) {
      return [];
    }
    const selected = trendOptions.filter((item) => selectedTrendSubjects.includes(item.subject));
    if (selected.length > 0) {
      return selected;
    }
    return trendOptions.slice(0, 5);
  }, [selectedTrendSubjects, trendOptions]);

  const toggleTrendSubject = (subject: string) => {
    setSelectedTrendSubjects((prev) => {
      if (prev.includes(subject)) {
        return prev.filter((item) => item !== subject);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, subject];
    });
  };

  const sendMessage = async (rawText?: string) => {
    const messageText = (rawText ?? chatInput).trim();
    if (!messageText || chatLoading) {
      return;
    }

    setChatInput("");
    setChatError(null);

    const nextUserMessage: AiChatMessage = {
      role: "user",
      content: messageText,
    };

    const historyForRequest = [...messages, nextUserMessage].slice(-10);
    const predictionsSummary = (() => {
      const data = predictionsState.data;
      if (!data) {
        return undefined;
      }
      if (data.role === "student" || data.role === "parent") {
        return data.prediction?.topRiskMessage;
      }
      if (data.role === "teacher") {
        const top = data.students.slice(0, 3);
        return top.map((item) => `${item.fullName}: ${item.weakSubject} (${item.probability}%)`).join("; ");
      }
      if (data.role === "admin") {
        const topClasses = data.classRadar.slice(0, 3);
        return topClasses.map((item) => `${item.classId}: ${item.averageRisk}%`).join("; ");
      }
      return undefined;
    })();

    const analyticsContext: AiChatRequest["context"] = {
      mentorSummary: mentorData?.summary,
      predictionsSummary,
      recommendationHints: mentorData?.recommendations?.slice(0, 3) ?? [],
      analytics: {
        strengths: strengths.slice(0, 6),
        weaknesses: weaknesses.slice(0, 6),
        recommendations: mentorData?.recommendations?.slice(0, 6) ?? [],
        trends: mentorData?.trends?.slice(0, 8) ?? [],
      },
    };

    if (predictionsState.data?.role === "student" || predictionsState.data?.role === "parent") {
      if (predictionsState.data.prediction) {
        analyticsContext.analytics = {
          ...analyticsContext.analytics,
          prediction: {
            overallRisk: predictionsState.data.prediction.overallRisk,
            topRiskMessage: predictionsState.data.prediction.topRiskMessage,
            flags: predictionsState.data.prediction.flags,
            nextActions: predictionsState.data.prediction.nextActions,
          },
        };
      }
    } else if (predictionsState.data?.role === "teacher") {
      analyticsContext.analytics = {
        ...analyticsContext.analytics,
        teacherTopRisks: predictionsState.data.students
          .slice(0, 5)
          .map((item) => `${item.fullName} (${item.classId}) — ${item.probability}%`),
      };
    } else if (predictionsState.data?.role === "admin") {
      analyticsContext.analytics = {
        ...analyticsContext.analytics,
        adminTopRiskClasses: predictionsState.data.classRadar
          .slice(0, 5)
          .map((item) => `${item.classId}: ${item.averageRisk}% (${item.highRiskStudents}/${item.totalStudents})`),
      };
    }

    setMessages((prev) => [...prev, nextUserMessage]);
    setChatLoading(true);

    try {
      const payload: AiChatRequest = {
        message: messageText,
        history: historyForRequest,
        context: analyticsContext,
      };
      const response = await privateApi.post<AiChatResponse>("/api/ai-chat", payload, {
        timeout: 45000,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.data.reply,
        },
      ]);
      setChatMode(response.data.mode ?? response.data.source);
    } catch (error) {
      setChatError(getErrorMessage(error));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("not_failed_get_response_from_service_try_again_once"),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const generateClassReport = async () => {
    const classId = selectedClassId || classOptions[0];
    if (!classId) {
      return;
    }

    setReportLoading(true);
    setReportError(null);

    try {
      const response = await privateApi.get<ClassReportResponse>(
        `/api/teacher/class-report?classId=${encodeURIComponent(classId)}`,
      );
      setReport(response.data);
    } catch (error) {
      setReportError(getErrorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <>
          <div className="mentor-tabs chip-row" role="tablist" aria-label={t("analysis_tab")}>
              <button
                className={`chip-button ${activeTab === "analysis" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "analysis"}
                onClick={() => setActiveTab("analysis")}
              >
                {t("analysis_tab")}
              </button>
              <button
                className={`chip-button ${activeTab === "chat" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                onClick={() => setActiveTab("chat")}
              >
                {t("ai_assistant_chat_tab")}
              </button>
              {modeLabel ? (
                <span className={`chip ${currentMode === "demo" ? "warn" : currentMode === "openai" ? "good" : ""}`}>
                  {t("mode")}: {modeLabel}
                </span>
              ) : null}
          </div>

          {activeTab === "analysis" && isScopedRole && selectedScope ? (
            <Section title={t("analysis_period_title")}>
              <DataState
                loading={journalState.loading}
                error={journalState.error}
                onRetry={journalState.refresh}
              />
              {!journalState.loading && !journalState.error ? (
                <div className="action-row mentor-scope-row">
                  <label className="mentor-scope-field">
                    <span>{t("study_year")}</span>
                    <select
                      value={selectedScope.eduYear}
                      onChange={(event) =>
                        setSelectedScope((prev) =>
                          prev
                            ? {
                                ...prev,
                                eduYear: Number(event.target.value),
                              }
                            : prev,
                        )
                      }
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mentor-scope-field">
                    <span>{t("type_period_type")}</span>
                    <select
                      value={selectedScope.periodType}
                      onChange={(event) => {
                        const nextType = normalizePeriodType(event.target.value);
                        setSelectedScope((prev) => {
                          if (!prev) {
                            return prev;
                          }
                          const nextPeriods = buildPeriodOptions(nextType, journalState.data?.filters.periods ?? []);
                          const nextPeriod = nextPeriods.includes(prev.period) ? prev.period : nextPeriods[0] ?? 1;
                          return {
                            ...prev,
                            periodType: nextType,
                            period: nextPeriod,
                          };
                        });
                      }}
                    >
                      {availablePeriodTypes.map((type) => (
                        <option key={type} value={type}>
                          {type === "quarter"
                            ? t("period_type_quarter")
                            : type === "halfyear"
                              ? t("period_type_halfyear")
                              : t("period_type_year")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mentor-scope-field">
                    <span>{t("period")}</span>
                    <select
                      value={selectedScope.period}
                      onChange={(event) =>
                        setSelectedScope((prev) =>
                          prev
                            ? {
                                ...prev,
                                period: Number(event.target.value),
                              }
                            : prev,
                        )
                      }
                    >
                      {availablePeriods.map((period) => (
                        <option key={period} value={period}>
                          {selectedScope.periodType === "quarter"
                            ? `${period} ${t("quarter_short")}`
                            : selectedScope.periodType === "halfyear"
                              ? `${period} ${t("halfyear_short")}`
                              : t("year_period_single")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </Section>
          ) : null}

            {activeTab === "chat" ? (
              <Section title={t("ai_assistant_chat_title")}>
                <div className="chat-shell">
                  <div className="chat-toolbar">
                    <div className="mentor-brand-line">
                      <MessageCircle size={16} />
                      <span>{t("online_assistant")}</span>
                    </div>
                    <div className="mentor-chat-actions">
                      <button
                        className="chip-button"
                        type="button"
                        onClick={() => setShowQuickPrompts((prev) => !prev)}
                      >
                        {showQuickPrompts
                          ? "\u0421\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438"
                          : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438"}
                      </button>
                    </div>
                  </div>

                  {showQuickPrompts ? (
                    <div className="chip-row mentor-quick-prompts">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          className="chip-button"
                          type="button"
                          onClick={() => void sendMessage(prompt)}
                          disabled={chatLoading}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="chat-viewport" ref={chatViewportRef}>
                    {messages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"}
                      >
                        {message.content}
                      </div>
                    ))}
                    {chatLoading ? (
                      <div className="chat-bubble assistant">
                        <span className="thinking-text">{t("thinking_text")}</span>
                      </div>
                    ) : null}
                  </div>

                  <form
                    className="chat-input-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder={t("question_input_placeholder")}
                      disabled={chatLoading}
                    />
                    <button className="solid-button icon-button" type="submit" disabled={chatLoading || !chatInput.trim()}>
                      <Send size={16} />
                      {t("send_button")}
                    </button>
                  </form>

                  {chatError ? <p className="form-error">{chatError}</p> : null}
                </div>
              </Section>
            ) : null}

            {activeTab === "analysis" ? (
              mentorData ? (
                <>
                <Section title={t("short_final")}>
                  <p>{mentorData.summary}</p>
                </Section>

                <div className="dual-grid">
                  <Section title={t("strong_areas")}>
                    <div className="chip-row">
                      {strengths.map((item) => (
                        <span key={item} className="chip good">
                          {item}
                        </span>
                      ))}
                    </div>
                  </Section>
                  <Section title={t("weak_areas")}>
                    <div className="chip-row">
                      {weaknesses.map((item) => (
                        <span key={item} className="chip warn">
                          {item}
                        </span>
                      ))}
                    </div>
                  </Section>
                </div>

                <Section title={t("recommendations")}>
                  <ul className="plain-list">
                    {mentorData.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Section>

                <div className="mentor-analysis-actions">
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => setShowAdvancedAnalysis((prev) => !prev)}
                  >
                    {showAdvancedAnalysis
                      ? "\u0421\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u0430\u043d\u0430\u043b\u0438\u0437"
                      : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u0430\u043d\u0430\u043b\u0438\u0437"}
                  </button>
                </div>

                {showAdvancedAnalysis ? (
                <>
                {mentorData.explainability ? (
                  <Section title={t("why_ai_this_thinks")}>
                    <div className="stats-grid">
                      <article className="stat-card">
                        <p>{t("confidence_model")}</p>
                        <strong>{mentorData.explainability.confidence}%</strong>
                      </article>
                      <article className="stat-card">
                        <p>{t("source_2")}</p>
                        <strong>
                          {mentorData.explainability.source === "class-aggregates"
                            ? t("aggregation_by_classes")
                            : mentorData.explainability.source === "school-aggregates"
                              ? t("aggregation_by_school")
                              : t("profile_student_2")}
                        </strong>
                      </article>
                    </div>
                    <ul className="plain-list">
                      {mentorData.explainability.drivers.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </Section>
                ) : null}

                {mentorData.trends && mentorData.trends.length > 0 ? (
                  <Section title={t("trends_by_subjects")}>
                    <div className="chip-row history-subject-picker" role="group" aria-label={t("subject")}>
                      {trendOptions.map((item) => {
                        const isActive = selectedTrendSubjects.includes(item.subject);
                        const maxReached = selectedTrendSubjects.length >= 5;
                        return (
                          <button
                            key={item.subject}
                            className={isActive ? "chip-button active" : "chip-button"}
                            type="button"
                            onClick={() => toggleTrendSubject(item.subject)}
                            disabled={!isActive && maxReached}
                            title={item.subject}
                          >
                            {item.subject}
                          </button>
                        );
                      })}

                      <span className="chip">{selectedTrendSubjects.length}/5</span>
                    </div>

                    <TrendBarChart
                      data={visibleTrends.map((item) => ({ label: item.subject, value: item.trend }))}
                      valueLabel={t("change")}
                    />
                  </Section>
                ) : null}

                <Section title={t("predictive_analysis")}>
                  <DataState
                    loading={predictionsState.loading}
                    error={predictionsState.error}
                    onRetry={predictionsState.refresh}
                  />

                  {predictionsState.data?.role === "student" || predictionsState.data?.role === "parent" ? (
                    predictionsState.data.prediction ? (
                      <div className="list-grid">
                        <article className="mini-card">
                          <h4>{predictionsState.data.prediction.topRiskMessage}</h4>
                          <p>
                            {t("overall_risk")}: {predictionsState.data.prediction.overallRisk}%
                          </p>
                          <div className="chip-row">
                            {predictionsState.data.prediction.flags.map((item) => (
                              <span key={item} className="chip warn">
                                {item}
                              </span>
                            ))}
                          </div>
                        </article>
                        <article className="mini-card">
                          <h4>{t("what_do_next")}</h4>
                          <ul className="plain-list">
                            {predictionsState.data.prediction.nextActions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </article>
                      </div>
                    ) : (
                      <p>{t("for_prediction_yet_not_enough_data")}</p>
                    )
                  ) : null}

                  {predictionsState.data?.role === "teacher" ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t("name")}</th>
                          <th>{t("class")}</th>
                          <th>{t("risk")}</th>
                          <th>{t("probability")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictionsState.data.students.slice(0, 12).map((item) => (
                          <tr key={item.studentId}>
                            <td>{item.fullName}</td>
                            <td>{item.classId}</td>
                            <td>{item.weakSubject}</td>
                            <td>
                              <span className={item.probability >= 75 ? "chip warn" : "chip"}>
                                {item.probability}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  {predictionsState.data?.role === "admin" ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t("class")}</th>
                          <th>{t("average_risk")}</th>
                          <th>{t("at_risk_students")}</th>
                          <th>{t("students_2")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictionsState.data.classRadar.map((item) => (
                          <tr key={item.classId}>
                            <td>{item.classId}</td>
                            <td>{item.averageRisk}%</td>
                            <td>{item.highRiskStudents}</td>
                            <td>{item.totalStudents}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </Section>

                {user?.role === "teacher" || user?.role === "admin" ? (
                  <Section
                    title={t("report_class_in_1_click")}
                    action={
                      <div className="action-row">
                        <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                          <option value="">{t("select_class")}</option>
                          {classOptions.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <button
                          className="outline-button icon-button"
                          type="button"
                          onClick={() => void generateClassReport()}
                          disabled={reportLoading || classOptions.length === 0}
                        >
                          <FileText size={16} />
                          {reportLoading ? t("generating") : t("generate_report")}
                        </button>
                      </div>
                    }
                  >
                    {reportError ? <p className="form-error">{reportError}</p> : null}
                    {report ? (
                      <div className="list-grid">
                        <article className="mini-card">
                          <h4>
                            {t("class")} {report.classId}
                          </h4>
                          <p>
                            {t("students_2")}: {report.summary.students}
                          </p>
                          <p>
                            {t("average_score")}: {report.summary.averageScore.toFixed(2)}
                          </p>
                          <p>
                            {t("at_risk_students")}: {report.summary.highRiskStudents}
                          </p>
                        </article>
                        <article className="mini-card">
                          <h4>{t("recommendations")}</h4>
                          <ul className="plain-list">
                            {report.recommendations.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </article>
                      </div>
                    ) : null}
                    {report ? <p className="report-text">{report.reportText}</p> : null}
                  </Section>
                ) : null}
                </>
                ) : null}
                </>
              ) : (
                <Section title={t("analysis_tab")}>
                  <DataState loading={mentorState.loading} error={mentorState.error} onRetry={mentorState.refresh} />
                </Section>
              )
            ) : null}
        </>
      </div>
    </PageTransition>
  );
}

