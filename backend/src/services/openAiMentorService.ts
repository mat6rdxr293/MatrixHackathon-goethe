import axios from "axios";
import { z } from "zod";
import { Role, StudentProfile } from "../types";
import { localLlmService } from "./llm/localLlmService";

const mentorResponseSchema = z.object({
  summary: z.string().min(10),
  strengths: z.array(z.string().min(2)).min(1).max(6),
  weaknesses: z.array(z.string().min(2)).min(1).max(6),
  recommendations: z.array(z.string().min(4)).min(2).max(6),
  trends: z.array(
    z.object({
      subject: z.string().min(2),
      trend: z.number(),
    }),
  ),
});

export type MentorResponse = z.infer<typeof mentorResponseSchema>;

const mentorResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "weaknesses", "recommendations", "trends"],
  properties: {
    summary: { type: "string" },
    strengths: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    weaknesses: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    recommendations: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
    trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "trend"],
        properties: {
          subject: { type: "string" },
          trend: { type: "number" },
        },
      },
    },
  },
} as const;

type MentorInput = {
  role: Role;
  userName: string;
  studentProfile?: StudentProfile | null;
  classStats?: {
    classId: string;
    averageScore: number;
    riskStudents: number;
  }[];
  schoolStats?: {
    schoolAverage: number;
    classCount: number;
    riskStudents: number;
  };
};

type ClassReportInput = {
  teacherName: string;
  classId: string;
  summary: {
    students: number;
    averageScore: number;
    highRisk: number;
  };
  topRisks: {
    student: string;
    subject: string;
    probability: number;
  }[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatInput = {
  role: Role;
  userName: string;
  message: string;
  history?: ChatMessage[];
  context?: {
    mentorSummary?: string;
    predictionsSummary?: string;
    recommendationHints?: string[];
    analytics?: {
      strengths?: string[];
      weaknesses?: string[];
      recommendations?: string[];
      trends?: { subject: string; trend: number }[];
      prediction?: {
        overallRisk?: number;
        topRiskMessage?: string;
        flags?: string[];
        nextActions?: string[];
      };
      teacherTopRisks?: string[];
      adminTopRiskClasses?: string[];
    };
  };
};

type OpenAiConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type LlmMode = "openai" | "local" | "demo";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

const getConfig = (): OpenAiConfig => {
  const parsedTimeout = Number(process.env.OPENAI_TIMEOUT_MS ?? 15000);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000;
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.2",
    timeoutMs,
  };
};

const ensureConfigured = () => {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return config;
};

const extractTextOutput = (data: unknown): string | null => {
  if (
    typeof data === "object" &&
    data !== null &&
    "output_text" in data &&
    typeof (data as { output_text?: unknown }).output_text === "string"
  ) {
    return (data as { output_text: string }).output_text;
  }

  if (typeof data !== "object" || data === null || !("output" in data)) {
    return null;
  }

  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (typeof item !== "object" || item === null || !("content" in item)) {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        "text" in block &&
        (block as { type?: unknown }).type === "output_text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        return (block as { text: string }).text;
      }
    }
  }

  return null;
};

const extractJson = (source: string) => {
  const trimmed = source.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Model response does not contain JSON");
  }
};

const parseMentorResponse = (source: string): MentorResponse | null => {
  try {
    const parsed = extractJson(source);
    const validated = mentorResponseSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
};

const topSubjects = (profile: StudentProfile, count: number, order: "asc" | "desc") =>
  [...profile.progress]
    .sort((a, b) => (order === "desc" ? b.current - a.current : a.current - b.current))
    .slice(0, count)
    .map((item) => item.subject);

const fallbackMentorResponse = (input: MentorInput): MentorResponse => {
  if (input.studentProfile) {
    const profile = input.studentProfile;
    const strengths = profile.progress.filter((item) => item.current >= 4.4).map((item) => item.subject);
    const weaknesses = profile.weakSubjects.length > 0 ? profile.weakSubjects : topSubjects(profile, 2, "asc");
    const safeStrengths = strengths.length > 0 ? strengths.slice(0, 4) : topSubjects(profile, 2, "desc");
    const mainWeak = weaknesses[0] ?? "учебный план";

    return {
      summary: `${profile.fullName}: средний балл ${profile.averageScore.toFixed(
        1,
      )}. Нужен фокус на слабых темах без перегруза.`,
      strengths: safeStrengths,
      weaknesses: weaknesses.slice(0, 4),
      recommendations: [
        `Сделай 3 коротких занятия по предмету "${mainWeak}" на этой неделе.`,
        "После каждого урока фиксируй 1-2 темы, которые были сложными.",
        "В конце недели сравни динамику и скорректируй план занятий.",
      ],
      trends: profile.progress.map((item) => ({
        subject: item.subject,
        trend: Number(item.trend.toFixed(2)),
      })),
    };
  }

  if (input.classStats && input.classStats.length > 0) {
    const avg = input.classStats.reduce((sum, item) => sum + item.averageScore, 0) / input.classStats.length;
    const riskyClasses = input.classStats.filter((item) => item.riskStudents > 0);
    const strongClasses = [...input.classStats].sort((a, b) => b.averageScore - a.averageScore).slice(0, 3);

    return {
      summary: `По ${input.classStats.length} классам средний балл ${avg.toFixed(
        2,
      )}. Есть классы, где нужна точечная поддержка.`,
      strengths: strongClasses.map((item) => `${item.classId}: ${item.averageScore.toFixed(2)}`),
      weaknesses:
        riskyClasses.length > 0
          ? riskyClasses.slice(0, 4).map((item) => `${item.classId}: риск ${item.riskStudents}`)
          : ["Критичных отклонений не выявлено"],
      recommendations: [
        "Собери мини-группы для учеников с устойчивым снижением результатов.",
        "Раз в неделю сверяй риск по каждому классу и фиксируй план действий.",
        "По сильным классам дай углублённые задания для удержания темпа.",
      ],
      trends: input.classStats.map((item) => ({
        subject: item.classId,
        trend: Number((item.averageScore - 4).toFixed(2)),
      })),
    };
  }

  if (input.schoolStats) {
    return {
      summary: `По школе средний балл ${input.schoolStats.schoolAverage.toFixed(2)}. В зоне внимания ${
        input.schoolStats.riskStudents
      } учеников.`,
      strengths: [
        `Охват аналитики: ${input.schoolStats.classCount} классов`,
        `Базовый уровень школы: ${input.schoolStats.schoolAverage.toFixed(2)}`,
      ],
      weaknesses: [`Ученики с риском: ${input.schoolStats.riskStudents}`],
      recommendations: [
        "Сконцентрировать ресурсы на параллелях с самым высоким риском.",
        "Еженедельно обновлять карту рисков и назначать ответственных.",
        "Публиковать адресные рекомендации для учителей и родителей.",
      ],
      trends: [],
    };
  }

  return {
    summary: "Данных пока недостаточно, но можно запустить базовый план наблюдения за прогрессом.",
    strengths: ["Система готова к сбору данных"],
    weaknesses: ["Недостаточно входных данных для точного анализа"],
    recommendations: [
      "Заполните профиль успеваемости и посещаемости.",
      "После обновления данных запустите повторный анализ.",
    ],
    trends: [],
  };
};

const parsePositiveTimeout = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const OPENAI_MENTOR_STEP_TIMEOUT_MS = parsePositiveTimeout(process.env.OPENAI_MENTOR_STEP_TIMEOUT_MS, 10000);
const LOCAL_MENTOR_BASE_TIMEOUT_MS = parsePositiveTimeout(process.env.LOCAL_LLM_TIMEOUT_MS, 20000);
const LOCAL_MENTOR_STEP_TIMEOUT_MS = Math.max(
  parsePositiveTimeout(process.env.LOCAL_LLM_MENTOR_TIMEOUT_MS, LOCAL_MENTOR_BASE_TIMEOUT_MS),
  12000,
);

const fallbackClassReport = (input: ClassReportInput) => {
  const highRiskShare =
    input.summary.students > 0 ? (input.summary.highRisk / input.summary.students) * 100 : 0;
  const riskLevel =
    highRiskShare >= 45 ? "высокий" : highRiskShare >= 25 ? "повышенный" : highRiskShare >= 10 ? "умеренный" : "низкий";

  const topRisksText =
    input.topRisks.length > 0
      ? input.topRisks
          .slice(0, 4)
          .map((item, index) => `${index + 1}) ${item.student} — ${item.subject} (${item.probability}%)`)
          .join("\n")
      : "Критичные риски по предметам не выявлены.";

  return [
    `Алгоритмический отчет по классу ${input.classId}`,
    `Классный руководитель: ${input.teacherName}`,
    `Учеников: ${input.summary.students}`,
    `Средний балл: ${input.summary.averageScore.toFixed(2)}`,
    `Ученики с высоким риском: ${input.summary.highRisk} (${highRiskShare.toFixed(1)}%), уровень риска: ${riskLevel}.`,
    "",
    "Ключевые зоны внимания:",
    topRisksText,
    "",
    "Рекомендации:",
    "1) Разделить учеников риска на мини-группы по слабым предметам.",
    "2) Дать короткие проверочные задания через 3-4 дня после коррекции.",
    "3) Еженедельно пересчитывать риск и обновлять план поддержки.",
  ].join("\n");
};

const formatList = (values: string[], limit = 3) =>
  values
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");

const fallbackChatReply = (input: ChatInput) => {
  const question = input.message.toLowerCase();
  const questionFlat = question.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const mentorSummary = input.context?.mentorSummary?.trim();
  const predictionsSummary = input.context?.predictionsSummary?.trim();
  const tips = input.context?.recommendationHints?.filter(Boolean) ?? [];
  const analytics = input.context?.analytics;
  const strengths = analytics?.strengths?.filter(Boolean) ?? [];
  const weaknesses = analytics?.weaknesses?.filter(Boolean) ?? [];
  const recommendationPool = [...tips, ...(analytics?.recommendations ?? []), ...(analytics?.prediction?.nextActions ?? [])]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
  const riskFlags = analytics?.prediction?.flags?.filter(Boolean) ?? [];
  const riskPercent = analytics?.prediction?.overallRisk;
  const topRiskMessage = analytics?.prediction?.topRiskMessage?.trim();
  const negativeTrendSubjects = (analytics?.trends ?? [])
    .filter((item) => item.trend < 0)
    .sort((a, b) => a.trend - b.trend)
    .slice(0, 3)
    .map((item) => item.subject);

  const isGreeting =
    questionFlat.includes("привет") ||
    questionFlat.includes("здрав") ||
    questionFlat.includes("салам") ||
    questionFlat === "hello" ||
    questionFlat === "hi";
  const isIdentityQuestion =
    questionFlat.includes("ты ии") ||
    questionFlat.includes("кто ты") ||
    questionFlat.includes("ты кто");
  const isRiskQuestion =
    questionFlat.includes("риск") ||
    questionFlat.includes("проблем") ||
    questionFlat.includes("сложност");
  const isPlanQuestion =
    questionFlat.includes("план") ||
    questionFlat.includes("7 дней") ||
    questionFlat.includes("недел");
  const isDiscussQuestion =
    questionFlat.includes("обсуд") ||
    questionFlat.includes("учител") ||
    questionFlat.includes("родител");

  if (isGreeting) {
    const topWeak = weaknesses[0];
    const topStrong = strengths[0];
    const riskText = typeof riskPercent === "number" ? `Текущий расчетный риск: ${riskPercent}%. ` : "";
    return `Привет. Я ИИ-помощник портала. ${riskText}${
      topWeak ? `Сейчас в фокусе предмет "${topWeak}". ` : ""
    }${topStrong ? `Опора: "${topStrong}". ` : ""}Могу дать план на 7 дней и подготовить темы для разговора с учителем/родителем.`;
  }

  if (isIdentityQuestion) {
    return "Да, я ИИ-помощник. Работаю в гибридном режиме: локальные алгоритмы риска + AI-формулировки рекомендаций.";
  }

  if (isDiscussQuestion) {
    const topics = [topRiskMessage, ...riskFlags, ...weaknesses, ...negativeTrendSubjects].filter(
      (value): value is string => Boolean(value),
    );
    const discussionBase =
      topics.length > 0
        ? `Ключевые темы для обсуждения: ${formatList(topics, 3)}.`
        : predictionsSummary
          ? `Ключевая тема: ${predictionsSummary}.`
          : "Ключевая тема: текущие предметы с просадкой и динамика за неделю.";
    const extra =
      recommendationPool.length > 0
        ? `Что попросить: ${recommendationPool[0]}.`
        : "Что попросить: короткий план коррекции на ближайшие 7 дней.";
    return `${discussionBase} ${extra}`;
  }

  if (isRiskQuestion) {
    if (input.role === "teacher" && (analytics?.teacherTopRisks?.length ?? 0) > 0) {
      return `По классу самый высокий риск у: ${formatList(analytics?.teacherTopRisks ?? [], 3)}. Первый шаг: ${
        recommendationPool[0] ??
        "выделить 2-3 учеников с максимальным риском и согласовать с ними недельный план."
      }`;
    }
    if (input.role === "admin" && (analytics?.adminTopRiskClasses?.length ?? 0) > 0) {
      return `По школе зоны внимания: ${formatList(analytics?.adminTopRiskClasses ?? [], 3)}. Первый шаг: ${
        recommendationPool[0] ??
        "дать приоритет классам с максимальным риском и зафиксировать еженедельный контроль."
      }`;
    }

    const riskPrefix = typeof riskPercent === "number" ? `Расчетный риск: ${riskPercent}%.` : "";
    const mainSignal =
      topRiskMessage ||
      riskFlags[0] ||
      predictionsSummary ||
      "По текущим расчетам есть зоны, которые требуют внимания.";
    return [
      riskPrefix,
      `Главный сигнал: ${mainSignal}.`,
      recommendationPool.length > 0
        ? `Первый шаг: ${recommendationPool[0]}.`
        : "Первый шаг: зафиксируйте 1-2 приоритетные темы и проверьте прогресс через неделю.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (isPlanQuestion || questionFlat.includes("что делать")) {
    const plan =
      recommendationPool.length > 0
        ? recommendationPool
            .slice(0, 3)
            .map((item, index) => `${index + 1}) ${item}`)
            .join(" ")
        : "1) 20-30 минут на приоритетный предмет в день. 2) Мини-проверка в середине недели. 3) Повторный замер в конце недели.";
    return `План на 7 дней: ${plan}`;
  }

  if (weaknesses.length > 0 || strengths.length > 0) {
    const weakText = weaknesses.length > 0 ? `Зона внимания: ${formatList(weaknesses, 2)}.` : "";
    const strongText = strengths.length > 0 ? `Сильные стороны: ${formatList(strengths, 2)}.` : "";
    const actionText =
      recommendationPool.length > 0 ? `Следующий шаг: ${recommendationPool[0]}.` : "";
    return [mentorSummary, weakText, strongText, actionText].filter(Boolean).join(" ");
  }

  if (mentorSummary) {
    return `${mentorSummary} Если хочешь, разложу это в конкретный план на 7 дней.`;
  }

  return "Могу помочь по трём сценариям: 1) где самый высокий риск, 2) план на 7 дней, 3) что обсудить с учителем/родителем.";
};

const requestResponsesText = async (
  config: OpenAiConfig,
  payload: {
    instructions?: string;
    input: Array<{ role: string; content: { type: "input_text"; text: string }[] }>;
    max_output_tokens: number;
    timeoutMs?: number;
    text?: {
      format?: {
        type: "json_schema";
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    };
  },
) => {
  let responseData: unknown;
  try {
    const { timeoutMs, ...requestPayload } = payload;
    const response = await axios.post(
      RESPONSES_API_URL,
      { model: config.model, ...requestPayload },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs && timeoutMs > 0 ? timeoutMs : config.timeoutMs,
      },
    );
    responseData = response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const apiErrorMessage =
        (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
      throw new Error(apiErrorMessage || error.message);
    }
    throw error;
  }

  const textOutput = extractTextOutput(responseData);
  if (!textOutput || !textOutput.trim()) {
    throw new Error("OpenAI returned empty output");
  }

  return textOutput.trim();
};

const buildChatPrompt = (input: ChatInput) => {
  const history = (input.history ?? []).slice(-10);
  const historyText = history
    .map((item) => `${item.role === "assistant" ? "Ассистент" : "Пользователь"}: ${item.content}`)
    .join("\n");

  return [
    "Ты школьный ИИ-ассистент Aqbobek Lyceum.",
    "Отвечай коротко, понятно и по делу на русском языке.",
    "Если вопрос о рисках и оценках, опирайся на переданный контекст.",
    "Не придумывай факты, которых нет в контексте.",
    `Роль пользователя: ${input.role}`,
    `Имя пользователя: ${input.userName}`,
    input.context?.mentorSummary ? `Сводка: ${input.context.mentorSummary}` : "",
    input.context?.predictionsSummary ? `Прогнозы: ${input.context.predictionsSummary}` : "",
    input.context?.recommendationHints?.length ? `Подсказки: ${input.context.recommendationHints.join("; ")}` : "",
    input.context?.analytics ? `Аналитика: ${JSON.stringify(input.context.analytics)}` : "",
    historyText ? `История:\n${historyText}` : "",
    `Новый вопрос пользователя: ${input.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
};

const tryLocalMentorResponse = async (input: MentorInput): Promise<MentorResponse | null> => {
  const localText = await localLlmService.generateText({
    systemPrompt:
      "You are a school AI analyst. Use only input data and do not invent facts. " +
      "Respond with strict JSON by schema mentor_response. Keep text fields concise.",
    prompt: `Build personal analytics from data: ${JSON.stringify(input)}`,
    maxTokens: 320,
    temperature: 0.2,
    timeoutMs: LOCAL_MENTOR_STEP_TIMEOUT_MS,
  });

  if (!localText) {
    return null;
  }

  return parseMentorResponse(localText.text);
};

const tryLocalClassReport = async (input: ClassReportInput): Promise<string | null> => {
  const localText = await localLlmService.generateText({
    systemPrompt:
      "You are a school assistant. Write a short practical class report in Russian. Plain text, no JSON.",
    prompt: `Create report using this input: ${JSON.stringify(input)}`,
    maxTokens: 260,
    temperature: 0.2,
    timeoutMs: LOCAL_MENTOR_STEP_TIMEOUT_MS,
  });

  return localText?.text?.trim() || null;
};

const tryLocalChatReply = async (input: ChatInput): Promise<string | null> => {
  const localText = await localLlmService.generateText({
    systemPrompt:
      "You are a school AI assistant. Reply briefly in Russian using only provided context. Do not invent facts.",
    prompt: buildChatPrompt(input),
    maxTokens: 220,
    temperature: 0.25,
    timeoutMs: LOCAL_MENTOR_STEP_TIMEOUT_MS,
  });

  return localText?.text?.trim() || null;
};

export const openAiMentorService = {
  isEnabled() {
    return Boolean(getConfig().apiKey);
  },

  async generateMentorResponse(input: MentorInput): Promise<MentorResponse> {
    if (!this.isEnabled()) {
      const local = await tryLocalMentorResponse(input);
      return local ?? fallbackMentorResponse(input);
    }
    try {
      const config = ensureConfigured();
      const requestPayload = {
        instructions:
          "Ты школьный ИИ-аналитик. Сформируй ответ только в JSON по схеме и на простом русском языке.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text" as const,
                text: `Подготовь персональный анализ по данным: ${JSON.stringify(input)}`,
              },
            ],
          },
        ],
        max_output_tokens: 900,
        timeoutMs: Math.min(config.timeoutMs, OPENAI_MENTOR_STEP_TIMEOUT_MS),
        text: {
          format: {
            type: "json_schema" as const,
            name: "mentor_response",
            schema: mentorResponseJsonSchema,
            strict: true,
          },
        },
      };

      const textOutput = await requestResponsesText(config, requestPayload);
      const validated = parseMentorResponse(textOutput);
      if (validated) {
        return validated;
      }

      const fixedTextOutput = await requestResponsesText(config, {
        instructions:
          "Исправь JSON строго по схеме mentor_response. Верни только валидный JSON без комментариев.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Исходный ответ, который нужно исправить: ${textOutput}`,
              },
            ],
          },
        ],
        max_output_tokens: 700,
        timeoutMs: Math.min(config.timeoutMs, OPENAI_MENTOR_STEP_TIMEOUT_MS),
        text: {
          format: {
            type: "json_schema",
            name: "mentor_response",
            schema: mentorResponseJsonSchema,
            strict: true,
          },
        },
      });

      const fixedValidated = parseMentorResponse(fixedTextOutput);
      if (fixedValidated) {
        return fixedValidated;
      }
      throw new Error("OpenAI mentor response has invalid JSON shape");
    } catch (error) {
      console.error("OpenAI mentor request failed, trying local LLM:", error);
      const local = await tryLocalMentorResponse(input);
      if (local) {
        return local;
      }
      return fallbackMentorResponse(input);
    }
  },

  async generateClassReport(input: ClassReportInput): Promise<string> {
    if (!this.isEnabled()) {
      const local = await tryLocalClassReport(input);
      return local ?? fallbackClassReport(input);
    }
    try {
      const config = ensureConfigured();

      return await requestResponsesText(config, {
        instructions:
          "Write a concise and practical class performance report in simple Russian. Output plain text only.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Create report using this input: ${JSON.stringify(input)}`,
              },
            ],
          },
        ],
        max_output_tokens: 700,
        timeoutMs: Math.min(config.timeoutMs, OPENAI_MENTOR_STEP_TIMEOUT_MS),
      });
    } catch (error) {
      console.error("OpenAI class report request failed, trying local LLM:", error);
      const local = await tryLocalClassReport(input);
      if (local) {
        return local;
      }
      return fallbackClassReport(input);
    }
  },

  async generateChatReply(input: ChatInput): Promise<{ reply: string; mode: LlmMode }> {
    if (!this.isEnabled()) {
      const local = await tryLocalChatReply(input);
      if (local) {
        return {
          reply: local,
          mode: "local",
        };
      }
      return {
        reply: fallbackChatReply(input),
        mode: "demo",
      };
    }
    try {
      const config = ensureConfigured();
      const prompt = buildChatPrompt(input);

      const openAiReply = await requestResponsesText(config, {
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        max_output_tokens: 600,
        timeoutMs: Math.min(config.timeoutMs, OPENAI_MENTOR_STEP_TIMEOUT_MS),
      });

      return {
        reply: openAiReply,
        mode: "openai",
      };
    } catch (error) {
      console.error("OpenAI chat request failed, trying local LLM:", error);
      const local = await tryLocalChatReply(input);
      if (local) {
        return {
          reply: local,
          mode: "local",
        };
      }
      return {
        reply: fallbackChatReply(input),
        mode: "demo",
      };
    }
  },
};

