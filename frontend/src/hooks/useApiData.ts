import { useCallback, useEffect, useState } from "react";
import { privateApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../lib/api";
import type { ApiState } from "../types/portal";

export function useApiData<T>(path: string | null): ApiState<T> {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !path) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await privateApi.get<T>(path);
      setData(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    refresh: load,
  };
}

