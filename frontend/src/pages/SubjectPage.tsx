import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useAuth } from "../hooks/useAuth";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import { PageTransition } from "../components/ui/PageTransition";
import { DataState } from "../components/ui/DataState";
import { SUBJECTS, getSubjectLabName } from "./SubjectsPage";
import type {
  SubjectPracticeAnswerInput,
  SubjectPracticeMatchingQuestion,
  SubjectPracticeOption,
  SubjectPracticeQuestion,
  SubjectPracticeQuestionType,
  SubjectPracticeSubmissionResponse,
} from "../types/portal";

type SubjectQuestionsResponse = { items: SubjectPracticeQuestion[] };
type ModalStep = "select" | "edit";
type OrderingDrag = { questionId: string; itemId: string };

type SubjectPracticeQuestionPayload =
  | {
      type: "single_choice";
      prompt: string;
      explanation?: string;
      sortOrder?: number;
      options: SubjectPracticeOption[];
      correctOptionId: string;
    }
  | {
      type: "multiple_choice";
      prompt: string;
      explanation?: string;
      sortOrder?: number;
      options: SubjectPracticeOption[];
      correctOptionIds: string[];
    }
  | {
      type: "short_answer";
      prompt: string;
      explanation?: string;
      sortOrder?: number;
      acceptedAnswers: string[];
    }
  | {
      type: "matching";
      prompt: string;
      explanation?: string;
      sortOrder?: number;
      leftItems: SubjectPracticeOption[];
      rightItems: SubjectPracticeOption[];
      correctPairs: Array<{ leftId: string; rightId: string }>;
    }
  | {
      type: "ordering";
      prompt: string;
      explanation?: string;
      sortOrder?: number;
      items: SubjectPracticeOption[];
      correctOrder: string[];
    };

type QuestionEditorState = {
  id: string | null;
  type: SubjectPracticeQuestionType;
  prompt: string;
  explanation: string;
  sortOrder: string;
  optionsText: string;
  correctIndexesText: string;
  acceptedAnswersText: string;
  matchingText: string;
  orderingText: string;
};

const QUESTION_TYPE_LABELS: Record<SubjectPracticeQuestionType, string> = {
  single_choice: "Выбор одного ответа",
  multiple_choice: "Выбор нескольких ответов",
  short_answer: "Ввод ответа",
  matching: "Сопоставление",
  ordering: "Порядок",
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
const parseIndexes = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\s;]+/)
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((item) => Number.isFinite(item) && item > 0),
    ),
  );

const createEmptyEditor = (): QuestionEditorState => ({
  id: null,
  type: "single_choice",
  prompt: "",
  explanation: "",
  sortOrder: "",
  optionsText: "",
  correctIndexesText: "1",
  acceptedAnswersText: "",
  matchingText: "",
  orderingText: "",
});

const questionToEditor = (question: SubjectPracticeQuestion): QuestionEditorState => {
  if (question.type === "single_choice") {
    const correctIndex = Math.max(1, question.options.findIndex((o) => o.id === question.correctOptionId) + 1);
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation ?? "",
      sortOrder: String(question.sortOrder),
      optionsText: question.options.map((o) => o.text).join("\n"),
      correctIndexesText: String(correctIndex),
      acceptedAnswersText: "",
      matchingText: "",
      orderingText: "",
    };
  }

  if (question.type === "multiple_choice") {
    const indexes = question.options
      .map((o, index) => (question.correctOptionIds.includes(o.id) ? index + 1 : null))
      .filter((item): item is number => item !== null);
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation ?? "",
      sortOrder: String(question.sortOrder),
      optionsText: question.options.map((o) => o.text).join("\n"),
      correctIndexesText: indexes.join(", "),
      acceptedAnswersText: "",
      matchingText: "",
      orderingText: "",
    };
  }

  if (question.type === "short_answer") {
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation ?? "",
      sortOrder: String(question.sortOrder),
      optionsText: "",
      correctIndexesText: "1",
      acceptedAnswersText: question.acceptedAnswers.join("\n"),
      matchingText: "",
      orderingText: "",
    };
  }

  if (question.type === "matching") {
    const rightMap = new Map(question.rightItems.map((item) => [item.id, item.text]));
    const leftMap = new Map(question.leftItems.map((item) => [item.id, item.text]));
    const lines = question.correctPairs
      .map((pair) => `${leftMap.get(pair.leftId) ?? ""} = ${rightMap.get(pair.rightId) ?? ""}`)
      .filter((line) => normalizeText(line).length > 2);
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation ?? "",
      sortOrder: String(question.sortOrder),
      optionsText: "",
      correctIndexesText: "1",
      acceptedAnswersText: "",
      matchingText: lines.join("\n"),
      orderingText: "",
    };
  }

  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    explanation: question.explanation ?? "",
    sortOrder: String(question.sortOrder),
    optionsText: "",
    correctIndexesText: "1",
    acceptedAnswersText: "",
    matchingText: "",
    orderingText: question.items.map((item) => item.text).join("\n"),
  };
};

const buildPayload = (state: QuestionEditorState): SubjectPracticeQuestionPayload => {
  const prompt = normalizeText(state.prompt);
  if (prompt.length < 5) {
    throw new Error("Вопрос должен содержать минимум 5 символов");
  }

  const explanation = normalizeText(state.explanation);
  const sortOrder = Number.parseInt(state.sortOrder, 10);
  const nextSortOrder = Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : undefined;

  if (state.type === "single_choice" || state.type === "multiple_choice") {
    const optionLines = splitLines(state.optionsText);
    if (optionLines.length < 2) {
      throw new Error("Нужно минимум 2 варианта ответа");
    }
    const options = optionLines.map((text, index) => ({ id: `opt-${index + 1}`, text }));
    const indexes = parseIndexes(state.correctIndexesText);
    if (indexes.length < 1 || indexes.some((index) => index > options.length)) {
      throw new Error("Укажите корректные номера правильных вариантов");
    }

    if (state.type === "single_choice") {
      if (indexes.length !== 1) {
        throw new Error("Для одиночного выбора нужен ровно один правильный вариант");
      }
      return {
        type: "single_choice",
        prompt,
        explanation: explanation || undefined,
        sortOrder: nextSortOrder,
        options,
        correctOptionId: options[indexes[0] - 1].id,
      };
    }

    return {
      type: "multiple_choice",
      prompt,
      explanation: explanation || undefined,
      sortOrder: nextSortOrder,
      options,
      correctOptionIds: indexes.map((index) => options[index - 1].id),
    };
  }

  if (state.type === "short_answer") {
    const acceptedAnswers = splitLines(state.acceptedAnswersText);
    if (acceptedAnswers.length < 1) {
      throw new Error("Добавьте хотя бы один правильный ответ");
    }
    return {
      type: "short_answer",
      prompt,
      explanation: explanation || undefined,
      sortOrder: nextSortOrder,
      acceptedAnswers,
    };
  }

  if (state.type === "matching") {
    const pairs = splitLines(state.matchingText)
      .map((line) => line.split("=").map((part) => normalizeText(part)))
      .filter((parts) => parts.length === 2 && parts[0] && parts[1])
      .map((parts) => ({ left: parts[0], right: parts[1] }));

    if (pairs.length < 2) {
      throw new Error("Для сопоставления укажите минимум 2 пары в формате Левая = Правая");
    }

    const leftItems = pairs.map((pair, index) => ({ id: `left-${index + 1}`, text: pair.left }));
    const rightItems = pairs.map((pair, index) => ({ id: `right-${index + 1}`, text: pair.right }));
    const correctPairs = pairs.map((_pair, index) => ({ leftId: leftItems[index].id, rightId: rightItems[index].id }));

    return {
      type: "matching",
      prompt,
      explanation: explanation || undefined,
      sortOrder: nextSortOrder,
      leftItems,
      rightItems,
      correctPairs,
    };
  }

  const orderLines = splitLines(state.orderingText);
  if (orderLines.length < 2) {
    throw new Error("Для задания на порядок нужно минимум 2 шага");
  }
  const items = orderLines.map((text, index) => ({ id: `step-${index + 1}`, text }));
  return {
    type: "ordering",
    prompt,
    explanation: explanation || undefined,
    sortOrder: nextSortOrder,
    items,
    correctOrder: items.map((item) => item.id),
  };
};

const isAnswered = (question: SubjectPracticeQuestion, answer: SubjectPracticeAnswerInput | undefined) => {
  if (!answer) return false;
  if (question.type === "single_choice" && answer.type === "single_choice") return Boolean(normalizeText(answer.optionId));
  if (question.type === "multiple_choice" && answer.type === "multiple_choice") return answer.optionIds.length > 0;
  if (question.type === "short_answer" && answer.type === "short_answer") return Boolean(normalizeText(answer.text));
  if (question.type === "matching" && answer.type === "matching") return answer.pairs.length > 0;
  if (question.type === "ordering" && answer.type === "ordering") return answer.order.length > 0;
  return false;
};

const toSubmission = (question: SubjectPracticeQuestion, answer: SubjectPracticeAnswerInput | undefined): SubjectPracticeAnswerInput => {
  if (answer && answer.type === question.type) return answer;
  if (question.type === "single_choice") return { type: "single_choice", optionId: "" };
  if (question.type === "multiple_choice") return { type: "multiple_choice", optionIds: [] };
  if (question.type === "short_answer") return { type: "short_answer", text: "" };
  if (question.type === "matching") return { type: "matching", pairs: [] };
  return { type: "ordering", order: [] };
};

const getMatchingSelection = (answer: SubjectPracticeAnswerInput | undefined, question: SubjectPracticeMatchingQuestion) => {
  if (!answer || answer.type !== "matching") return new Map<string, string>();
  const leftIds = new Set(question.leftItems.map((item) => item.id));
  const rightIds = new Set(question.rightItems.map((item) => item.id));
  const result = new Map<string, string>();
  for (const pair of answer.pairs) {
    if (leftIds.has(pair.leftId) && rightIds.has(pair.rightId)) result.set(pair.leftId, pair.rightId);
  }
  return result;
};

export function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const meta = SUBJECTS.find((subject) => subject.id === subjectId);
  const canEdit = user?.role === "teacher" || user?.role === "admin";
  const labName = meta ? getSubjectLabName(meta.id) : "Subject Lab";
  const openLabLabel = lang === "kk" ? `${labName} ашу` : `Открыть ${labName}`;

  const questionsState = useApiData<SubjectQuestionsResponse>(
    subjectId ? `/api/subject-practice/questions/${encodeURIComponent(subjectId)}` : null,
  );

  const questions = useMemo(() => questionsState.data?.items ?? [], [questionsState.data]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SubjectPracticeAnswerInput>>({});
  const answersRef = useRef<Record<string, SubjectPracticeAnswerInput>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubjectPracticeSubmissionResponse | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("select");
  const [editor, setEditor] = useState<QuestionEditorState | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const [orderingDrag, setOrderingDrag] = useState<OrderingDrag | null>(null);
  const lastHoverRef = useRef<string | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    setQuestionIdx(0);
    setAnswers({});
    setSubmitError(null);
    setSubmission(null);
    setEditor(null);
    setEditorError(null);
    setModalOpen(false);
    setModalStep("select");
    setActiveLeftId(null);
    setOrderingDrag(null);
  }, [subjectId]);

  useEffect(() => {
    if (questionIdx <= questions.length - 1) return;
    setQuestionIdx(Math.max(0, questions.length - 1));
  }, [questionIdx, questions.length]);

  if (!meta) {
    return (
      <PageTransition>
        <div className="page-layout">
          <button className="back-btn" onClick={() => navigate("/app/subjects")}>
            <ArrowLeft size={16} /> {t("back_to_subjects")}
          </button>
          <p>{t("subject_not_found")}</p>
        </div>
      </PageTransition>
    );
  }

  const subjectName = lang === "kk" ? meta.nameKk : meta.nameRu;
  const currentQuestion = questions[questionIdx];
  const resultById = new Map((submission?.items ?? []).map((item) => [item.questionId, item]));
  const answeredCount = questions.filter((question) => isAnswered(question, answers[question.id])).length;
  const doneCount = submission ? submission.correct : answeredCount;
  const progressPct = questions.length > 0 ? Math.round((doneCount / questions.length) * 100) : 0;

  const setAnswer = (questionId: string, answer: SubjectPracticeAnswerInput) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setSubmitError(null);
    setSubmission(null);
  };

  const getOrder = (question: SubjectPracticeQuestion, sourceAnswers: Record<string, SubjectPracticeAnswerInput> = answersRef.current) => {
    if (question.type !== "ordering") return [];
    const answer = sourceAnswers[question.id];
    if (!answer || answer.type !== "ordering") return question.items.map((item) => item.id);

    const validIds = new Set(question.items.map((item) => item.id));
    const picked: string[] = [];
    for (const id of answer.order) {
      if (validIds.has(id) && !picked.includes(id)) picked.push(id);
    }
    const missing = question.items.map((item) => item.id).filter((id) => !picked.includes(id));
    return [...picked, ...missing];
  };

  const moveOrderById = (question: SubjectPracticeQuestion, itemId: string, overId: string) => {
    if (question.type !== "ordering" || itemId === overId) return;
    const current = getOrder(question);
    const from = current.indexOf(itemId);
    const to = current.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setAnswer(question.id, { type: "ordering", order: next });
  };

  useEffect(() => {
    if (!orderingDrag || !currentQuestion || currentQuestion.type !== "ordering" || orderingDrag.questionId !== currentQuestion.id) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest<HTMLElement>("[data-order-item-id]");
      const overId = row?.dataset.orderItemId;
      if (!overId || overId === orderingDrag.itemId || overId === lastHoverRef.current) return;
      lastHoverRef.current = overId;
      moveOrderById(currentQuestion, orderingDrag.itemId, overId);
    };

    const stop = () => {
      setOrderingDrag(null);
      lastHoverRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [orderingDrag, currentQuestion]);

  const updateMatchingPairs = (question: SubjectPracticeMatchingQuestion, map: Map<string, string>) => {
    const pairs = Array.from(map.entries()).map(([leftId, rightId]) => ({ leftId, rightId }));
    setAnswer(question.id, { type: "matching", pairs });
  };

  const assignPair = (question: SubjectPracticeMatchingQuestion, leftId: string, rightId: string) => {
    const map = getMatchingSelection(answers[question.id], question);
    for (const [existingLeftId, existingRightId] of map.entries()) {
      if (existingRightId === rightId && existingLeftId !== leftId) {
        map.delete(existingLeftId);
      }
    }
    map.set(leftId, rightId);
    updateMatchingPairs(question, map);
  };

  const clearPair = (question: SubjectPracticeMatchingQuestion, leftId: string) => {
    const map = getMatchingSelection(answers[question.id], question);
    map.delete(leftId);
    updateMatchingPairs(question, map);
  };

  const submitTest = async () => {
    if (!subjectId || questions.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await privateApi.post<SubjectPracticeSubmissionResponse>("/api/subject-practice/questions/submit", {
        subject: subjectId,
        answers: questions.map((question) => ({
          questionId: question.id,
          answer: toSubmission(question, answers[question.id]),
        })),
      });
      setSubmission(response.data);

      await privateApi.post("/api/subject-practice/session", {
        subject: subjectId,
        taskId: Math.max(1, questions.length),
        score: response.data.score,
        timeSpentSeconds: 0,
      }).catch(() => {});
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const saveQuestion = async () => {
    if (!editor || !subjectId) return;
    setEditorSaving(true);
    setEditorError(null);

    try {
      const payload = buildPayload(editor);
      if (editor.id) {
        await privateApi.put(`/api/subject-practice/questions/${encodeURIComponent(subjectId)}/${encodeURIComponent(editor.id)}`, payload);
      } else {
        await privateApi.post(`/api/subject-practice/questions/${encodeURIComponent(subjectId)}`, payload);
      }
      await questionsState.refresh();
      setEditor(null);
      setModalStep("select");
    } catch (error) {
      setEditorError(getErrorMessage(error));
    } finally {
      setEditorSaving(false);
    }
  };

  const removeQuestion = async (question: SubjectPracticeQuestion) => {
    if (!subjectId || !window.confirm("Удалить этот вопрос?")) return;

    try {
      await privateApi.delete(`/api/subject-practice/questions/${encodeURIComponent(subjectId)}/${encodeURIComponent(question.id)}`);
      await questionsState.refresh();
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      setSubmission((prev) => {
        if (!prev) return prev;
        const filteredItems = prev.items.filter((item) => item.questionId !== question.id);
        const total = Math.max(0, prev.total - 1);
        const correct = filteredItems.filter((item) => item.correct).length;
        return { ...prev, items: filteredItems, total, correct, score: total > 0 ? Math.round((correct / total) * 100) : 0 };
      });
    } catch (error) {
      setEditorError(getErrorMessage(error));
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalStep("select");
    setEditor(null);
    setEditorError(null);
  };

  const openCreateEditor = () => {
    setEditor(createEmptyEditor());
    setModalStep("edit");
    setEditorError(null);
  };

  const openEditEditor = (question: SubjectPracticeQuestion) => {
    setEditor(questionToEditor(question));
    setModalStep("edit");
    setEditorError(null);
  };

  return (
    <PageTransition>
      <div className="page-layout subject-page">
        <div className="subject-page-nav">
          <button className="back-btn" onClick={() => navigate("/app/subjects")}>
            <ArrowLeft size={15} /> {t("subjects_hub_title")}
          </button>
          <button
            className="practice-open-btn"
            onClick={async () => {
              const pmBase = import.meta.env.VITE_PM_URL || `http://${window.location.hostname}:8001`;
              const subjectParam = `subject=${encodeURIComponent(meta.id)}&lang=${lang}`;
              try {
                const response = await privateApi.get<{ token: string }>("/api/practice-token");
                const token = response.data?.token;
                if (!token) {
                  throw new Error("Сервер не вернул токен лаборатории");
                }
                window.open(`${pmBase}/?${subjectParam}&token=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
              } catch (error) {
                window.alert(getErrorMessage(error));
              }
            }}
          >
            <Zap size={14} /> {openLabLabel} <ExternalLink size={12} />
          </button>
        </div>

        <div
          className="subject-header"
          style={{ "--subject-color": meta.color, "--subject-accent": meta.accent } as React.CSSProperties}
        >
          <div className="subject-header-icon" style={{ background: meta.accent, color: meta.color }}>
            {meta.icon}
          </div>
          <div className="subject-header-info">
            <h1>{subjectName}</h1>
            <p>В уроке используются только тестовые задания: выбор, ввод, сопоставление, порядок.</p>
          </div>
          <div className="subject-header-progress">
            <div className="subject-progress-ring">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke={meta.color}
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - progressPct / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 28 28)"
                />
              </svg>
              <span style={{ color: meta.color }}>{progressPct}%</span>
            </div>
            <div className="subject-progress-label">
              <strong>{doneCount}/{questions.length}</strong>
              <span>{submission ? "верно" : "отвечено"}</span>
            </div>
          </div>
        </div>

        <DataState loading={questionsState.loading} error={questionsState.error} onRetry={questionsState.refresh} />

        <div className="subject-practice-grid">
          <div className="subject-task-list section-card">
            <div className="section-card-title">Тесты</div>
            <div className="subject-task-items">
              {questions.map((question, index) => {
                const result = resultById.get(question.id);
                return (
                  <button
                    key={question.id}
                    className={`subject-task-item ${index === questionIdx ? "active" : ""} ${result?.correct ? "done" : ""}`}
                    style={{ "--subject-color": meta.color } as React.CSSProperties}
                    onClick={() => setQuestionIdx(index)}
                  >
                    <span className="subject-task-num">
                      {result?.correct ? <CheckCircle2 size={13} style={{ color: "#16A34A" }} /> : index + 1}
                    </span>
                    <span className="subject-task-title">{QUESTION_TYPE_LABELS[question.type]}</span>
                    {index === questionIdx && <ChevronRight size={13} style={{ color: meta.color }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="subject-practice-main">
            {currentQuestion ? (
              <>
                <div className="section-card subject-task-card">
                  <div className="subject-task-header">
                    <div>
                      <div className="subject-task-id" style={{ color: meta.color }}>Вопрос #{questionIdx + 1}</div>
                      <h2 className="subject-task-title-h2">{QUESTION_TYPE_LABELS[currentQuestion.type]}</h2>
                    </div>
                    <div className="subject-task-tags">
                      <span className="subject-tag" style={{ background: meta.accent, color: meta.color }}>
                        {QUESTION_TYPE_LABELS[currentQuestion.type]}
                      </span>
                    </div>
                  </div>

                  <p className="subject-task-problem">{currentQuestion.prompt}</p>

                  <div className="subject-test-answer-area">
                    {currentQuestion.type === "single_choice" && (
                      <div className="subject-choice-list">
                        {currentQuestion.options.map((option) => {
                          const answer = answers[currentQuestion.id];
                          const selected = answer?.type === "single_choice" && answer.optionId === option.id;
                          return (
                            <label key={option.id} className={selected ? "subject-choice-item selected" : "subject-choice-item"}>
                              <input
                                type="radio"
                                name={`single-${currentQuestion.id}`}
                                checked={selected}
                                onChange={() => setAnswer(currentQuestion.id, { type: "single_choice", optionId: option.id })}
                              />
                              <span>{option.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {currentQuestion.type === "multiple_choice" && (
                      <div className="subject-choice-list">
                        {currentQuestion.options.map((option) => {
                          const answer = answers[currentQuestion.id];
                          const selected = answer?.type === "multiple_choice" && answer.optionIds.includes(option.id);
                          return (
                            <label key={option.id} className={selected ? "subject-choice-item selected" : "subject-choice-item"}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  const set = answer?.type === "multiple_choice" ? new Set(answer.optionIds) : new Set<string>();
                                  if (set.has(option.id)) set.delete(option.id);
                                  else set.add(option.id);
                                  setAnswer(currentQuestion.id, { type: "multiple_choice", optionIds: Array.from(set) });
                                }}
                              />
                              <span>{option.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {currentQuestion.type === "short_answer" &&
                      (() => {
                        const answer = answers[currentQuestion.id];
                        const value = answer?.type === "short_answer" ? answer.text : "";
                        return (
                          <textarea
                            className="subject-attempt-input"
                            value={value}
                            onChange={(event) => setAnswer(currentQuestion.id, { type: "short_answer", text: event.target.value })}
                            rows={3}
                            placeholder="Введите ответ"
                          />
                        );
                      })()}

                    {currentQuestion.type === "matching" && (() => {
                      const selectedMap = getMatchingSelection(answers[currentQuestion.id], currentQuestion);
                      const rightToLeft = new Map<string, string>();
                      selectedMap.forEach((rightId, leftId) => rightToLeft.set(rightId, leftId));
                      return (
                        <div className="subject-matching-two-list">
                          <div className="subject-matching-column">
                            <h4>Список A</h4>
                            {currentQuestion.leftItems.map((leftItem) => {
                              const linkedRightId = selectedMap.get(leftItem.id);
                              const linkedText = linkedRightId
                                ? currentQuestion.rightItems.find((i) => i.id === linkedRightId)?.text ?? ""
                                : "";
                              return (
                                <button
                                  key={leftItem.id}
                                  className={`subject-match-card ${activeLeftId === leftItem.id ? "active" : ""}`}
                                  type="button"
                                  onClick={() => setActiveLeftId((prev) => (prev === leftItem.id ? null : leftItem.id))}
                                >
                                  <span className="subject-match-card-title">{leftItem.text}</span>
                                  <span className="subject-match-card-meta">{linkedText ? `Связано: ${linkedText}` : "Не связано"}</span>
                                  {linkedRightId && (
                                    <span
                                      className="subject-match-clear"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        clearPair(currentQuestion, leftItem.id);
                                      }}
                                    >
                                      Очистить
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div className="subject-matching-column">
                            <h4>Список B</h4>
                            {currentQuestion.rightItems.map((rightItem) => {
                              const linkedLeftId = rightToLeft.get(rightItem.id);
                              const linkedLeftText = linkedLeftId
                                ? currentQuestion.leftItems.find((i) => i.id === linkedLeftId)?.text ?? ""
                                : "";
                              const selected = activeLeftId !== null && selectedMap.get(activeLeftId) === rightItem.id;
                              return (
                                <button
                                  key={rightItem.id}
                                  className={`subject-match-card right ${selected ? "selected" : ""}`}
                                  type="button"
                                  onClick={() => {
                                    if (!activeLeftId) return;
                                    assignPair(currentQuestion, activeLeftId, rightItem.id);
                                  }}
                                >
                                  <span className="subject-match-card-title">{rightItem.text}</span>
                                  <span className="subject-match-card-meta">{linkedLeftText ? `Привязан к: ${linkedLeftText}` : "Свободно"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {currentQuestion.type === "ordering" && (
                      <div className="subject-ordering-list">
                        {getOrder(currentQuestion, answers).map((itemId, index) => {
                          const item = currentQuestion.items.find((entry) => entry.id === itemId);
                          if (!item) return null;
                          const dragging = orderingDrag?.questionId === currentQuestion.id && orderingDrag.itemId === item.id;
                          return (
                            <div key={item.id} className={`subject-order-row ${dragging ? "dragging" : ""}`} data-order-item-id={item.id}>
                              <button
                                className="subject-order-drag-handle"
                                type="button"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  try {
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                  } catch {}
                                  setOrderingDrag({ questionId: currentQuestion.id, itemId: item.id });
                                }}
                              >
                                <GripVertical size={14} />
                              </button>
                              <span className="subject-order-index">{index + 1}</span>
                              <span className="subject-order-text">{item.text}</span>
                            </div>
                          );
                        })}
                        <p className="subject-order-hint">Перетащите строки мышкой или пальцем, чтобы выставить порядок.</p>
                      </div>
                    )}
                  </div>

                  {submission && resultById.get(currentQuestion.id) && (
                    <div className={resultById.get(currentQuestion.id)?.correct ? "subject-check-score good" : "subject-check-score warn"}>
                      {resultById.get(currentQuestion.id)?.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {resultById.get(currentQuestion.id)?.feedback}
                    </div>
                  )}
                </div>

                <div className="subject-task-nav">
                  <button className="subject-nav-btn" disabled={questionIdx === 0} onClick={() => setQuestionIdx((prev) => prev - 1)}>
                    <ChevronLeft size={15} /> {t("prev_task")}
                  </button>
                  <span className="subject-task-counter">{questionIdx + 1} / {questions.length}</span>
                  <button className="subject-nav-btn" disabled={questionIdx === questions.length - 1} onClick={() => setQuestionIdx((prev) => prev + 1)}>
                    {t("next_task")} <ChevronRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <div className="section-card">
                <p style={{ color: "var(--text3)" }}>В этом предмете пока нет тестовых вопросов.</p>
              </div>
            )}

            <div className="section-card subject-submit-card">
              <div className="subject-submit-head">
                <strong>Проверка теста</strong>
                <span>Отвечено: {answeredCount} из {questions.length}</span>
              </div>
              {submitError ? <p className="form-error">{submitError}</p> : null}
              {submission ? (
                <p className="subject-submit-result">
                  Результат: <strong>{submission.score}%</strong> ({submission.correct}/{submission.total})
                </p>
              ) : null}
              <button
                className="subject-btn subject-btn-primary"
                style={{ background: meta.color }}
                onClick={submitTest}
                disabled={submitting || questions.length === 0}
              >
                {submitting ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {submitting ? "Проверяем..." : "Проверить все вопросы"}
              </button>
            </div>

            {canEdit && (
              <div className="section-card subject-teacher-panel">
                <div className="subject-teacher-head">
                  <div>
                    <strong>Панель учителя</strong>
                    <p>Редактирование тестов основного сайта для предмета {subjectName}.</p>
                  </div>
                  <button className="solid-button" type="button" onClick={() => { setModalOpen(true); setModalStep("select"); setEditorError(null); }}>
                    <Pencil size={14} /> Управление заданиями
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <>
          <button className={`users-modal-backdrop ${modalOpen ? "show" : ""}`} type="button" onClick={closeModal} aria-hidden={!modalOpen} />
          <div className={`users-modal subject-editor-modal ${modalOpen ? "open" : ""}`} role="dialog" aria-modal="true">
            <div className="users-modal-head">
              <h3>Управление заданиями: {subjectName}</h3>
              <button className="outline-button users-modal-close" type="button" onClick={closeModal}>
                <X size={14} /> Закрыть
              </button>
            </div>

            <div className="subject-modal-activity">
              <button className={`subject-modal-activity-btn ${modalStep === "select" ? "active" : ""}`} type="button" onClick={() => setModalStep("select")}>1. Выбор задания</button>
              <button className={`subject-modal-activity-btn ${modalStep === "edit" ? "active" : ""}`} type="button" onClick={() => setModalStep("edit")}>2. Редактирование</button>
            </div>

            {editorError ? <p className="form-error">{editorError}</p> : null}

            {modalStep === "select" ? (
              <div className="subject-teacher-list subject-teacher-list-modal">
                <div className="subject-teacher-actions">
                  <button className="solid-button" type="button" onClick={openCreateEditor}>
                    <Plus size={14} /> Новое задание
                  </button>
                </div>
                {questions.map((question) => (
                  <div key={question.id} className="subject-teacher-item">
                    <div className="subject-teacher-item-main">
                      <strong>{QUESTION_TYPE_LABELS[question.type]}</strong>
                      <span>{question.prompt}</span>
                    </div>
                    <div className="subject-teacher-item-actions">
                      <button className="outline-button" type="button" onClick={() => openEditEditor(question)}>
                        <Pencil size={14} /> Изменить
                      </button>
                      <button className="outline-button danger" type="button" onClick={() => void removeQuestion(question)}>
                        <Trash2 size={14} /> Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {questions.length === 0 ? <p className="subject-modal-empty">В этом предмете пока нет тестовых заданий.</p> : null}
              </div>
            ) : (
              <div className="subject-editor-card subject-editor-card-modal">
                {editor ? (
                  <>
                    <h4>{editor.id ? "Изменение вопроса" : "Новый вопрос"}</h4>
                    <div className="subject-editor-grid">
                      <label>
                        Тип вопроса
                        <select
                          value={editor.type}
                          onChange={(event) => setEditor((prev) => (prev ? { ...prev, type: event.target.value as SubjectPracticeQuestionType } : prev))}
                        >
                          <option value="single_choice">Выбор одного ответа</option>
                          <option value="multiple_choice">Выбор нескольких ответов</option>
                          <option value="short_answer">Ввод ответа</option>
                          <option value="matching">Сопоставление</option>
                          <option value="ordering">Порядок</option>
                        </select>
                      </label>

                      <label>
                        Порядок (необязательно)
                        <input
                          value={editor.sortOrder}
                          onChange={(event) => setEditor((prev) => (prev ? { ...prev, sortOrder: event.target.value } : prev))}
                          placeholder="Например: 1"
                        />
                      </label>

                      <label className="subject-editor-full">
                        Вопрос
                        <textarea
                          value={editor.prompt}
                          onChange={(event) => setEditor((prev) => (prev ? { ...prev, prompt: event.target.value } : prev))}
                          rows={3}
                        />
                      </label>

                      <label className="subject-editor-full">
                        Пояснение (необязательно)
                        <textarea
                          value={editor.explanation}
                          onChange={(event) => setEditor((prev) => (prev ? { ...prev, explanation: event.target.value } : prev))}
                          rows={2}
                        />
                      </label>

                      {(editor.type === "single_choice" || editor.type === "multiple_choice") && (
                        <>
                          <label className="subject-editor-full">
                            Варианты (по одному в строке)
                            <textarea
                              value={editor.optionsText}
                              onChange={(event) => setEditor((prev) => (prev ? { ...prev, optionsText: event.target.value } : prev))}
                              rows={5}
                              placeholder={"Вариант 1\nВариант 2\nВариант 3"}
                            />
                          </label>
                          <label className="subject-editor-full">
                            {editor.type === "single_choice" ? "Номер правильного варианта" : "Номера правильных вариантов (через запятую)"}
                            <input
                              value={editor.correctIndexesText}
                              onChange={(event) => setEditor((prev) => (prev ? { ...prev, correctIndexesText: event.target.value } : prev))}
                              placeholder={editor.type === "single_choice" ? "1" : "1, 3"}
                            />
                          </label>
                        </>
                      )}

                      {editor.type === "short_answer" && (
                        <label className="subject-editor-full">
                          Правильные ответы (по одному в строке)
                          <textarea
                            value={editor.acceptedAnswersText}
                            onChange={(event) => setEditor((prev) => (prev ? { ...prev, acceptedAnswersText: event.target.value } : prev))}
                            rows={4}
                            placeholder={"ответ 1\nответ 2"}
                          />
                        </label>
                      )}

                      {editor.type === "matching" && (
                        <label className="subject-editor-full">
                          Пары сопоставления (формат: Левая часть = Правая часть)
                          <textarea
                            value={editor.matchingText}
                            onChange={(event) => setEditor((prev) => (prev ? { ...prev, matchingText: event.target.value } : prev))}
                            rows={6}
                            placeholder={"Термин 1 = Определение 1\nТермин 2 = Определение 2"}
                          />
                        </label>
                      )}

                      {editor.type === "ordering" && (
                        <label className="subject-editor-full">
                          Шаги в правильном порядке (по одному в строке)
                          <textarea
                            value={editor.orderingText}
                            onChange={(event) => setEditor((prev) => (prev ? { ...prev, orderingText: event.target.value } : prev))}
                            rows={5}
                            placeholder={"Шаг 1\nШаг 2\nШаг 3"}
                          />
                        </label>
                      )}
                    </div>

                    <div className="subject-editor-actions">
                      <button className="outline-button" type="button" onClick={() => setModalStep("select")}>Отмена</button>
                      <button className="solid-button" type="button" onClick={saveQuestion} disabled={editorSaving}>
                        {editorSaving ? "Сохранение..." : "Сохранить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="subject-modal-empty-wrap">
                    <p className="subject-modal-empty">Сначала выберите задание в активности 1 или создайте новое.</p>
                    <button className="outline-button" type="button" onClick={() => setModalStep("select")}>К выбору задания</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </PageTransition>
  );
}
