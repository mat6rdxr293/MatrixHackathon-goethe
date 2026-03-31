import { useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "../config/constants";
import { privateApi, publicApi } from "../lib/api";
import { AuthContext } from "./authStore";
import type { AuthContextValue, LoginResponse, ProfileResponse, SafeUser } from "../types/portal";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as SafeUser;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.token));
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setInitialized(true);
        return;
      }

      try {
        const response = await privateApi.get<ProfileResponse>("/api/auth/me");
        setUser(response.data.user);
      } catch {
        localStorage.removeItem(STORAGE_KEYS.token);
        localStorage.removeItem(STORAGE_KEYS.user);
        setToken(null);
        setUser(null);
      } finally {
        setInitialized(true);
      }
    };

    void init();
  }, [token]);

  const login = async (email: string, password: string, selectedRole: SafeUser["role"]) => {
    const response = await publicApi.post<LoginResponse>("/api/auth/login", { email, password, selectedRole });
    localStorage.setItem(STORAGE_KEYS.token, response.data.token);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(response.data.user));
    setToken(response.data.token);
    setUser(response.data.user);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, initialized, login, logout }),
    [initialized, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

