"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAiMentorService = void 0;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const mentorResponseSchema = zod_1.z.object({
    summary: zod_1.z.string().min(10),
    strengths: zod_1.z.array(zod_1.z.string().min(2)).min(1).max(6),
    weaknesses: zod_1.z.array(zod_1.z.string().min(2)).min(1).max(6),
    recommendations: zod_1.z.array(zod_1.z.string().min(4)).min(2).max(6),
    trends: zod_1.z.array(zod_1.z.object({
        subject: zod_1.z.string().min(2),
        trend: zod_1.z.number(),
    })),
});
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
};
const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const getConfig = () => {
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
const extractTextOutput = (data) => {
    if (typeof data === "object" &&
        data !== null &&
        "output_text" in data &&
        typeof data.output_text === "string") {
        return data.output_text;
    }
    if (typeof data !== "object" || data === null || !("output" in data)) {
        return null;
    }
    const output = data.output;
    if (!Array.isArray(output)) {
        return null;
    }
    for (const item of output) {
        if (typeof item !== "object" || item === null || !("content" in item)) {
            continue;
        }
        const content = item.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const block of content) {
            if (typeof block === "object" &&
                block !== null &&
                "type" in block &&
                "text" in block &&
                block.type === "output_text" &&
                typeof block.text === "string") {
                return block.text;
            }
        }
    }
    return null;
};
const extractJson = (source) => {
    const trimmed = source.trim();
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const firstBrace = trimmed.indexOf("{");
        const lastBrace = trimmed.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
        }
        throw new Error("Model response does not contain JSON");
    }
};
const parseMentorResponse = (source) => {
    try {
        const parsed = extractJson(source);
        const validated = mentorResponseSchema.safeParse(parsed);
        return validated.success ? validated.data : null;
    }
    catch {
        return null;
    }
};
const topSubjects = (profile, count, order) => [...profile.progress]
    .sort((a, b) => (order === "desc" ? b.current - a.current : a.current - b.current))
    .slice(0, count)
    .map((item) => item.subject);
const fallbackMentorResponse = (input) => {
    if (input.studentProfile) {
        const profile = input.studentProfile;
        const strengths = profile.progress.filter((item) => item.current >= 4.4).map((item) => item.subject);
        const weaknesses = profile.weakSubjects.length > 0 ? profile.weakSubjects : topSubjects(profile, 2, "asc");
        const safeStrengths = strengths.length > 0 ? strengths.slice(0, 4) : topSubjects(profile, 2, "desc");
        const mainWeak = weaknesses[0] ?? "учебный план";
        return {
            summary: `${profile.fullName}: средний балл ${profile.averageScore.toFixed(1)}. Нужен фокус на слабых темах без перегруза.`,
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
            summary: `По ${input.classStats.length} классам средний балл ${avg.toFixed(2)}. Есть классы, где нужна точечная поддержка.`,
            strengths: strongClasses.map((item) => `${item.classId}: ${item.averageScore.toFixed(2)}`),
            weaknesses: riskyClasses.length > 0
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
            summary: `По школе средний балл ${input.schoolStats.schoolAverage.toFixed(2)}. В зоне внимания ${input.schoolStats.riskStudents} учеников.`,
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
const fallbackClassReport = (input) => {
    const highRiskShare = input.summary.students > 0 ? (input.summary.highRisk / input.summary.students) * 100 : 0;
    const riskLevel = highRiskShare >= 45 ? "высокий" : highRiskShare >= 25 ? "повышенный" : highRiskShare >= 10 ? "умеренный" : "низкий";
    const topRisksText = input.topRisks.length > 0
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
const fallbackChatReply = (input) => {
    const question = input.message.toLowerCase();
    const questionFlat = question.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const mentorSummary = input.context?.mentorSummary?.trim();
    const predictionsSummary = input.context?.predictionsSummary?.trim();
    const tips = input.context?.recommendationHints?.filter(Boolean) ?? [];
    const isGreeting = questionFlat.includes("привет") ||
        questionFlat.includes("здрав") ||
        questionFlat.includes("салам") ||
        questionFlat === "hello" ||
        questionFlat === "hi";
    const isIdentityQuestion = questionFlat.includes("ты ии") ||
        questionFlat.includes("кто ты") ||
        questionFlat.includes("ты кто");
    const isRiskQuestion = questionFlat.includes("риск") ||
        questionFlat.includes("проблем") ||
        questionFlat.includes("сложност");
    const isPlanQuestion = questionFlat.includes("план") ||
        questionFlat.includes("7 дней") ||
        questionFlat.includes("недел");
    const isDiscussQuestion = questionFlat.includes("обсуд") ||
        questionFlat.includes("учител") ||
        questionFlat.includes("родител");
    if (isGreeting) {
        return "Привет. Я ИИ-помощник портала: могу подсказать риски, дать план на 7 дней и подготовить темы для разговора с учителем или родителем.";
    }
    if (isIdentityQuestion) {
        return "Да, я ИИ-помощник. Работаю в гибридном режиме: локальные алгоритмы риска + AI-формулировки рекомендаций.";
    }
    if (isDiscussQuestion) {
        const discussionBase = predictionsSummary
            ? `Ключевая тема: ${predictionsSummary}.`
            : "Ключевая тема: текущие предметы с просадкой и динамика за неделю.";
        const extra = tips.length > 0 ? `Что попросить: ${tips[0]}.` : "Что попросить: короткий план коррекции на ближайшие 7 дней.";
        return `${discussionBase} ${extra}`;
    }
    if (isRiskQuestion) {
        return [
            predictionsSummary ? `По расчетам риска: ${predictionsSummary}.` : "По текущим расчетам есть зоны, которые требуют внимания.",
            tips.length > 0 ? `Первый шаг: ${tips[0]}.` : "Первый шаг: зафиксируйте 1-2 приоритетные темы и проверьте прогресс через неделю.",
        ].join(" ");
    }
    if (isPlanQuestion || questionFlat.includes("что делать")) {
        const plan = tips.length > 0
            ? tips
                .slice(0, 3)
                .map((item, index) => `${index + 1}) ${item}`)
                .join(" ")
            : "1) 20-30 минут на приоритетный предмет в день. 2) Мини-проверка в середине недели. 3) Повторный замер в конце недели.";
        return `План на 7 дней: ${plan}`;
    }
    if (mentorSummary) {
        return `${mentorSummary} Если хочешь, разложу это в конкретный план на 7 дней.`;
    }
    return "Могу помочь по трём сценариям: 1) где самый высокий риск, 2) план на 7 дней, 3) что обсудить с учителем/родителем.";
};
const requestResponsesText = async (config, payload) => {
    let responseData;
    try {
        const response = await axios_1.default.post(RESPONSES_API_URL, { model: config.model, ...payload }, {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
            },
            timeout: config.timeoutMs,
        });
        responseData = response.data;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const apiErrorMessage = error.response?.data?.error?.message;
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
exports.openAiMentorService = {
    isEnabled() {
        return Boolean(getConfig().apiKey);
    },
    async generateMentorResponse(input) {
        try {
            const config = ensureConfigured();
            const requestPayload = {
                instructions: "Ты школьный ИИ-аналитик. Сформируй ответ только в JSON по схеме и на простом русском языке.",
                input: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: `Подготовь персональный анализ по данным: ${JSON.stringify(input)}`,
                            },
                        ],
                    },
                ],
                max_output_tokens: 900,
                text: {
                    format: {
                        type: "json_schema",
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
                instructions: "Исправь JSON строго по схеме mentor_response. Верни только валидный JSON без комментариев.",
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
        }
        catch (error) {
            console.error("OpenAI mentor failed, fallback used:", error);
            return fallbackMentorResponse(input);
        }
    },
    async generateClassReport(input) {
        try {
            const config = ensureConfigured();
            return await requestResponsesText(config, {
                instructions: "Write a concise and practical class performance report in simple Russian. Output plain text only.",
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
        }
        catch (error) {
            console.error("OpenAI class report failed, fallback used:", error);
            return fallbackClassReport(input);
        }
    },
    async generateChatReply(input) {
        try {
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
            return await requestResponsesText(config, {
                input: [
                    {
                        role: "user",
                        content: [{ type: "input_text", text: prompt }],
                    },
                ],
                max_output_tokens: 600,
            });
        }
        catch (error) {
            console.error("OpenAI chat failed, fallback used:", error);
            return fallbackChatReply(input);
        }
    },
};
