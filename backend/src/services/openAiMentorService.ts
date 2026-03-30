import axios from "axios";
import { z } from "zod";
import { Role, StudentProfile } from "../types";

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
  };
};

type OpenAiConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

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

const requestResponsesText = async (
  config: OpenAiConfig,
  payload: {
    instructions?: string;
    input: Array<{ role: string; content: { type: "input_text"; text: string }[] }>;
    max_output_tokens: number;
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
    const response = await axios.post(
      RESPONSES_API_URL,
      { model: config.model, ...payload },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: config.timeoutMs,
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

export const openAiMentorService = {
  isEnabled() {
    return Boolean(getConfig().apiKey);
  },

  async generateMentorResponse(input: MentorInput): Promise<MentorResponse> {
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
      console.error("OpenAI mentor failed, fallback used:", error);
      return fallbackMentorResponse(input);
    }
  },

  async generateClassReport(input: ClassReportInput): Promise<string> {
    const config = ensureConfigured();

    return requestResponsesText(config, {
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
    });
  },

  async generateChatReply(input: ChatInput): Promise<string> {
    const config = ensureConfigured();

    const history = (input.history ?? []).slice(-10);
    const historyText = history
      .map((item) => `${item.role === "assistant" ? "Ассистент" : "Пользователь"}: ${item.content}`)
      .join("\n");

    const prompt = [
      "Ты школьный ИИ-ассистент Aqbobek Lyceum.",
      "Отвечай коротко, понятно и по делу на русском языке.",
      "Если вопрос о рисках и оценках, опирайся на переданный контекст.",
      "Не придумывай факты, которых нет в контексте.",
      `Роль пользователя: ${input.role}`,
      `Имя пользователя: ${input.userName}`,
      input.context?.mentorSummary ? `Сводка: ${input.context.mentorSummary}` : "",
      input.context?.predictionsSummary ? `Прогнозы: ${input.context.predictionsSummary}` : "",
      input.context?.recommendationHints?.length
        ? `Подсказки: ${input.context.recommendationHints.join("; ")}`
        : "",
      historyText ? `История:\n${historyText}` : "",
      `Новый вопрос пользователя: ${input.message}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    return requestResponsesText(config, {
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      max_output_tokens: 600,
    });
  },
};
