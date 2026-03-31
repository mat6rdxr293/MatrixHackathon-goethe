import axios from "axios";
import { z } from "zod";
import { StructuredSummaryPayload, StructuredSummaryResult } from "../../analytics/types";
import { localLlmService } from "./localLlmService";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

const summarySchema = z.object({
  summary: z.string().min(8),
  recommendations: z.array(z.string().min(4)).min(2).max(5),
});

const getOpenAiConfig = () => {
  const timeoutRaw = Number(process.env.OPENAI_TIMEOUT_MS ?? 15000);
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.2",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 15000,
  };
};

const parsePositiveTimeout = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const OPENAI_SUMMARY_STEP_TIMEOUT_MS = parsePositiveTimeout(process.env.OPENAI_SUMMARY_STEP_TIMEOUT_MS, 10000);
const LOCAL_BASE_TIMEOUT_MS = parsePositiveTimeout(process.env.LOCAL_LLM_TIMEOUT_MS, 20000);
const LOCAL_SUMMARY_STEP_TIMEOUT_MS = Math.max(
  parsePositiveTimeout(process.env.LOCAL_LLM_SUMMARY_TIMEOUT_MS, LOCAL_BASE_TIMEOUT_MS),
  12000,
);
const SUMMARY_TOTAL_TIMEOUT_MS = Math.max(
  parsePositiveTimeout(process.env.LLM_SUMMARY_MAX_WAIT_MS, 40000),
  OPENAI_SUMMARY_STEP_TIMEOUT_MS + LOCAL_SUMMARY_STEP_TIMEOUT_MS + 5000,
);

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

  for (const outputItem of output) {
    if (typeof outputItem !== "object" || outputItem === null || !("content" in outputItem)) {
      continue;
    }
    const content = (outputItem as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const contentBlock of content) {
      if (
        typeof contentBlock === "object" &&
        contentBlock !== null &&
        (contentBlock as { type?: unknown }).type === "output_text" &&
        typeof (contentBlock as { text?: unknown }).text === "string"
      ) {
        return (contentBlock as { text: string }).text;
      }
    }
  }
  return null;
};

const parseSummaryResponse = (rawText: string): StructuredSummaryResult | null => {
  try {
    const parsed = JSON.parse(rawText.trim());
    const validated = summarySchema.safeParse(parsed);
    if (!validated.success) {
      return null;
    }
    return {
      summary: validated.data.summary,
      recommendations: validated.data.recommendations,
      source: "openai",
    };
  } catch {
    return null;
  }
};

const parseLooseSummaryResponse = (rawText: string): StructuredSummaryResult | null => {
  const lines = rawText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const recommendationLines = lines
    .filter((line) => /^(\d+[\).]|[-*•])\s*/.test(line))
    .map((line) => line.replace(/^(\d+[\).]|[-*•])\s*/, "").trim())
    .filter(Boolean);

  const summaryLineRaw = lines.find((line) => !/^(\d+[\).]|[-*•])\s*/.test(line)) ?? lines[0];
  const summaryLine = summaryLineRaw.replace(/^(\d+[\).]|[-*•])\s*/, "").trim();
  const recommendations = recommendationLines.length > 0 ? recommendationLines.slice(0, 5) : lines.slice(1, 4);

  if (!summaryLine || recommendations.length < 2) {
    return null;
  }

  return {
    summary: summaryLine,
    recommendations,
    source: "local",
  };
};

const buildFallback = (payload: StructuredSummaryPayload): StructuredSummaryResult => ({
  summary: payload.fallbackSummary,
  recommendations: payload.fallbackRecommendations.slice(0, 4),
  source: "demo",
});

const compactStructuredData = (structuredData: unknown, maxLength = 1800) => {
  const raw = JSON.stringify(structuredData);
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength)}...`;
};

const tryLocalSummary = async (
  payload: StructuredSummaryPayload,
): Promise<StructuredSummaryResult | null> => {
  const compactData = compactStructuredData(payload.structuredData);
  const localResult = await localLlmService.generateText({
    systemPrompt:
      "You are a school analytics assistant. Use only provided data. Do not invent facts. " +
      "Respond in Russian. First line: short summary. Then 2-4 short recommendations, each prefixed with '-'.",
    prompt: [
      "Build a short summary from the data.",
      `Role: ${payload.role}`,
      `Summary kind: ${payload.kind}`,
      `Structured data: ${compactData}`,
    ].join("\n"),
    maxTokens: 80,
    temperature: 0.2,
    timeoutMs: LOCAL_SUMMARY_STEP_TIMEOUT_MS,
  });

  if (!localResult) {
    return null;
  }

  const strictParsed = parseSummaryResponse(localResult.text);
  if (strictParsed) {
    return {
      ...strictParsed,
      source: "local",
    };
  }

  const looseParsed = parseLooseSummaryResponse(localResult.text);
  if (looseParsed) {
    return looseParsed;
  }

  const fallbackRecommendations = payload.fallbackRecommendations.slice(0, 4);
  const firstLine = localResult.text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || fallbackRecommendations.length < 2) {
    return null;
  }

  return {
    summary: firstLine,
    recommendations: fallbackRecommendations,
    source: "local",
  };
};

export const generateLLMSummaryFromStructuredData = async (
  payload: StructuredSummaryPayload,
): Promise<StructuredSummaryResult> => {
  const summaryTask = async (): Promise<StructuredSummaryResult> => {
    const config = getOpenAiConfig();
    if (!config.apiKey) {
      const localSummary = await tryLocalSummary(payload);
      return localSummary ?? buildFallback(payload);
    }

    const prompt = [
      "You are an educational assistant for school analytics.",
      "Use only provided structured data. Do not invent numbers or facts.",
      "Return JSON only with keys summary and recommendations.",
      "Recommendations should be practical and short.",
      `Role: ${payload.role}`,
      `Summary kind: ${payload.kind}`,
      `Structured data: ${JSON.stringify(payload.structuredData)}`,
    ].join("\n");

    try {
      const response = await axios.post(
        RESPONSES_API_URL,
        {
          model: config.model,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: prompt }],
            },
          ],
          max_output_tokens: 700,
          text: {
            format: {
              type: "json_schema",
              name: "structured_summary",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["summary", "recommendations"],
                properties: {
                  summary: { type: "string" },
                  recommendations: {
                    type: "array",
                    minItems: 2,
                    maxItems: 5,
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: Math.min(config.timeoutMs, OPENAI_SUMMARY_STEP_TIMEOUT_MS),
        },
      );

      const textOutput = extractTextOutput(response.data);
      if (!textOutput) {
        const localSummary = await tryLocalSummary(payload);
        return localSummary ?? buildFallback(payload);
      }

      const parsed = parseSummaryResponse(textOutput);
      if (!parsed) {
        const localSummary = await tryLocalSummary(payload);
        return localSummary ?? buildFallback(payload);
      }

      return parsed;
    } catch {
      const localSummary = await tryLocalSummary(payload);
      return localSummary ?? buildFallback(payload);
    }
  };

  const timeoutTask = new Promise<StructuredSummaryResult>((resolve) => {
    setTimeout(() => resolve(buildFallback(payload)), SUMMARY_TOTAL_TIMEOUT_MS);
  });

  return Promise.race([summaryTask(), timeoutTask]);
};
