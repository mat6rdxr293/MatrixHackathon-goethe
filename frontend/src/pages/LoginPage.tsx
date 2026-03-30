import { type FormEvent, useMemo, useState } from "react";
import {
  GraduationCap,
  School,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { getErrorMessage } from "../lib/api";
import { LanguageSwitch } from "../components/ui/LanguageSwitch";
import { PageTransition } from "../components/ui/PageTransition";

type RolePreview = {
  label: string;
  icon: LucideIcon;
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rolePreview = useMemo<RolePreview[]>(
    () => [
      { label: t("k_001"), icon: GraduationCap },
      { label: t("k_002"), icon: UserRound },
      { label: t("k_003"), icon: UsersRound },
      { label: t("k_004"), icon: ShieldCheck },
    ],
    [t],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate("/app/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="login-page">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />

        <div className="login-card">
          <div className="login-top-row">
            <div className="login-logo">
              <div className="login-logo-mark">
                <School size={22} />
              </div>
              <div>
                <h1 className="login-title">Aqbobek Portal</h1>
                <p className="login-subtitle">{t("k_039")}</p>
              </div>
            </div>
            <LanguageSwitch />
          </div>

          <p className="login-description">{t("k_066")}</p>

          <div className="role-preview-grid" aria-hidden="true">
            {rolePreview.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="role-preview-card">
                  <span className="role-preview-icon">
                    <Icon size={16} />
                  </span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          <form className="login-form" onSubmit={submit}>
            <label>
              {t("k_067")}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              {t("k_068")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="solid-button" type="submit" disabled={loading}>
              {loading ? t("k_069") : t("k_070")}
            </button>
          </form>
        </div>
      </div>
    </PageTransition>
  );
}
