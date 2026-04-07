import { AlertCircle, LoaderCircle } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

export function DataState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="state-box">
        <LoaderCircle className="spin" size={16} />
        <p>{t("loading_data")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-box error">
        <AlertCircle size={16} />
        <p>{error}</p>
        <button className="outline-button" type="button" onClick={() => void onRetry()}>
          {t("retry_button")}
        </button>
      </div>
    );
  }

  return null;
}

