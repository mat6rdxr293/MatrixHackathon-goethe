const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const isLocalhostApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(configuredApiBaseUrl);

export const API_BASE_URL = import.meta.env.PROD && isLocalhostApiUrl ? "" : configuredApiBaseUrl;

export const STORAGE_KEYS = {
  token: "aqbobek_token",
  user: "aqbobek_user",
  lang: "aqbobek_lang",
} as const;
