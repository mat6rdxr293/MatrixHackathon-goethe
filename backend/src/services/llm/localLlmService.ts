import axios from "axios";

export type LocalLlmRequest = {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type LocalLlmResult = {
  text: string;
  mode: "local";
  model?: string;
};

const toBool = (value: string | undefined, defaultValue: boolean) => {
  if (!value) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
};

const getConfig = () => {
  const timeoutRaw = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? 20000);
  return {
    enabled: toBool(process.env.LOCAL_LLM_ENABLED, true),
    url: (process.env.LOCAL_LLM_URL ?? "http://127.0.0.1:8009").trim().replace(/\/+$/, ""),
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 20000,
  };
};

export const localLlmService = {
  isEnabled() {
    return getConfig().enabled;
  },

  async generateText(request: LocalLlmRequest): Promise<LocalLlmResult | null> {
    const config = getConfig();
    if (!config.enabled) {
      return null;
    }

    try {
      const response = await axios.post(
        `${config.url}/v1/generate`,
        {
          prompt: request.prompt,
          system_prompt: request.systemPrompt ?? "",
          max_tokens: request.maxTokens ?? 500,
          temperature: request.temperature ?? 0.2,
        },
        {
          timeout: request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : config.timeoutMs,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const text = typeof response.data?.text === "string" ? response.data.text.trim() : "";
      if (!text) {
        return null;
      }

      return {
        text,
        mode: "local",
        model: typeof response.data?.model === "string" ? response.data.model : undefined,
      };
    } catch {
      return null;
    }
  },
};
