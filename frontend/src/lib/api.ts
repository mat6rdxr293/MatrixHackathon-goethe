import axios, { AxiosError } from "axios";
import { API_BASE_URL, STORAGE_KEYS } from "../config/constants";

const resolveTimeout = () => {
  const rawTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 20000);
  return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 20000;
};

const API_TIMEOUT_MS = resolveTimeout();

export const publicApi = axios.create({ baseURL: API_BASE_URL, timeout: API_TIMEOUT_MS });
export const privateApi = axios.create({ baseURL: API_BASE_URL, timeout: API_TIMEOUT_MS });

privateApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message;
    if (typeof message === "string") {
      return message;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

export const convertQuickLink = (href: string) => {
  if (href === "/admin/content") {
    return "/app/admin/content";
  }
  if (href === "/admin/users") {
    return "/app/admin/users";
  }
  if (href === "/admin/schedule") {
    return "/app/admin/schedule";
  }
  return href;
};

export const trendTone = (trend: number) => {
  if (trend > 0) {
    return "good";
  }
  if (trend < 0) {
    return "bad";
  }
  return "neutral";
};
