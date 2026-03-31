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
import type { Role } from "../types/portal";

type RolePreview = {
  value: Role;
  label: string;
  icon: LucideIcon;
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rolePreview = useMemo<RolePreview[]>(
    () => [
      { value: "student", label: t("k_001"), icon: GraduationCap },
      { value: "teacher", label: t("k_002"), icon: UserRound },
      { value: "parent", label: t("k_003"), icon: UsersRound },
      { value: "admin", label: t("k_004"), icon: ShieldCheck },
    ],
    [t],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!selectedRole) {
      setError(t("k_066"));
      return;
    }
    setLoading(true);

    try {
      await login(email, password, selectedRole);
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

          <div className="role-preview-grid" role="radiogroup" aria-label={t("k_046")}>
            {rolePreview.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={selectedRole === item.value ? "role-preview-card selected" : "role-preview-card"}
                  onClick={() => {
                    setSelectedRole(item.value);
                    setError(null);
                  }}
                  role="radio"
                  aria-checked={selectedRole === item.value}
                >
                  <span className="role-preview-icon">
                    <Icon size={16} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {selectedRole ? (
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
          ) : null}
        </div>
      </div>
    </PageTransition>
  );
}
