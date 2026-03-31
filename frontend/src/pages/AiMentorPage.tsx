import { BrainCircuit, FileText, MessageCircle, Send, ShieldAlert, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AiChatMessage,
  AiChatResponse,
  AiMentorResponse,
  ClassReportResponse,
  PredictionsResponse,
} from "../types/portal";
import { TrendBarChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const initialAssistantMessage = (text: string): AiChatMessage => ({
  role: "assistant",
  content: text,
});

export function AiMentorPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const mentorState = useApiData<AiMentorResponse>("/api/ai-mentor");
  const predictionsState = useApiData<PredictionsResponse>("/api/predictions");

  const [planCreated, setPlanCreated] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<ClassReportResponse | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([initialAssistantMessage(t("k_227"))]);
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

  const strengths = mentorState.data?.strengths ?? mentorState.data?.strongSides ?? [];
  const weaknesses = mentorState.data?.weaknesses ?? mentorState.data?.weakSides ?? [];

  const quickPrompts = useMemo(
    () => [t("k_228"), t("k_229"), t("k_230")],
    [t],
  );

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
    setMessages((prev) => [...prev, nextUserMessage]);
    setChatLoading(true);

    try {
      const response = await privateApi.post<AiChatResponse>("/api/ai-chat", {
        message: messageText,
        history: historyForRequest,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.data.reply,
        },
      ]);
    } catch (error) {
      setChatError(getErrorMessage(error));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("k_231"),
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
        <DataState loading={mentorState.loading} error={mentorState.error} onRetry={mentorState.refresh} />

        {mentorState.data ? (
          <>
            <Section title={t("k_232")}>
              <div className="chat-shell">
                <div className="chat-toolbar">
                  <div className="mentor-brand-line">
                    <MessageCircle size={16} />
                    <span>{t("k_233")}</span>
                  </div>
                  <div className="chip-row">
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
                </div>

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
                      <span className="thinking-text">{t("k_240")}</span>
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
                    placeholder={t("k_234")}
                    disabled={chatLoading}
                  />
                  <button className="solid-button icon-button" type="submit" disabled={chatLoading || !chatInput.trim()}>
                    <Send size={16} />
                    {t("k_235")}
                  </button>
                </form>

                {chatError ? <p className="form-error">{chatError}</p> : null}
              </div>
            </Section>

            <Section
              title={t("k_117")}
              action={
                <button className="outline-button icon-button" type="button" onClick={() => setPlanCreated(true)}>
                  <WandSparkles size={16} />
                  {t("k_118")}
                </button>
              }
            >
              <p>{mentorState.data.summary}</p>
              {planCreated ? <p className="success-text">{t("k_163")}</p> : null}
            </Section>

            <div className="dual-grid">
              <Section title={t("k_119")}>
                <div className="chip-row">
                  {strengths.map((item) => (
                    <span key={item} className="chip good">
                      {item}
                    </span>
                  ))}
                </div>
              </Section>
              <Section title={t("k_120")}>
                <div className="chip-row">
                  {weaknesses.map((item) => (
                    <span key={item} className="chip warn">
                      {item}
                    </span>
                  ))}
                </div>
              </Section>
            </div>

            <Section title={t("k_121")}>
              <ul className="plain-list">
                {mentorState.data.recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>

            {mentorState.data.explainability ? (
              <Section title={t("k_313")}>
                <div className="stats-grid">
                  <article className="stat-card">
                    <p>{t("k_314")}</p>
                    <strong>{mentorState.data.explainability.confidence}%</strong>
                  </article>
                  <article className="stat-card">
                    <p>{t("k_316")}</p>
                    <strong>
                      {mentorState.data.explainability.source === "class-aggregates"
                        ? t("k_335")
                        : mentorState.data.explainability.source === "school-aggregates"
                          ? t("k_336")
                          : t("k_334")}
                    </strong>
                  </article>
                </div>
                <ul className="plain-list">
                  {mentorState.data.explainability.drivers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {mentorState.data.trends && mentorState.data.trends.length > 0 ? (
              <Section title={t("k_122")}>
                <TrendBarChart
                  data={mentorState.data.trends.map((item) => ({ label: item.subject, value: item.trend }))}
                  valueLabel={t("k_123")}
                />
              </Section>
            ) : null}

            <Section title={t("k_194")}>
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
                        {t("k_195")}: {predictionsState.data.prediction.overallRisk}%
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
                      <h4>{t("k_196")}</h4>
                      <ul className="plain-list">
                        {predictionsState.data.prediction.nextActions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>
                ) : (
                  <p>{t("k_197")}</p>
                )
              ) : null}

              {predictionsState.data?.role === "teacher" ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("k_126")}</th>
                      <th>{t("k_083")}</th>
                      <th>{t("k_198")}</th>
                      <th>{t("k_199")}</th>
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
                      <th>{t("k_083")}</th>
                      <th>{t("k_200")}</th>
                      <th>{t("k_139")}</th>
                      <th>{t("k_186")}</th>
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
                title={t("k_201")}
                action={
                  <div className="action-row">
                    <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                      <option value="">{t("k_202")}</option>
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
                      {reportLoading ? t("k_203") : t("k_204")}
                    </button>
                  </div>
                }
              >
                {reportError ? <p className="form-error">{reportError}</p> : null}
                {report ? (
                  <div className="list-grid">
                    <article className="mini-card">
                      <h4>
                        {t("k_083")} {report.classId}
                      </h4>
                      <p>
                        {t("k_186")}: {report.summary.students}
                      </p>
                      <p>
                        {t("k_071")}: {report.summary.averageScore.toFixed(2)}
                      </p>
                      <p>
                        {t("k_139")}: {report.summary.highRiskStudents}
                      </p>
                    </article>
                    <article className="mini-card">
                      <h4>{t("k_121")}</h4>
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

            <Section title={t("k_122")}>
              <div className="mentor-brand-line">
                <BrainCircuit size={16} />
                <ShieldAlert size={16} />
                <span>{t("k_059")}</span>
              </div>
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
