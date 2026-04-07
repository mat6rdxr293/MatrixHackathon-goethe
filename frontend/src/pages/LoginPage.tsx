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
      { value: "student", label: t("student"), icon: GraduationCap },
      { value: "teacher", label: t("teacher"), icon: UserRound },
      { value: "parent", label: t("parent"), icon: UsersRound },
      { value: "admin", label: t("administration"), icon: ShieldCheck },
    ],
    [t],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!selectedRole) {
      setError(t("select_role_or_enter_data_manually"));
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
                <h1 className="login-title">Matrix Education</h1>
                <p className="login-subtitle">{t("single_school_portal")}</p>
              </div>
            </div>
            <LanguageSwitch />
          </div>

          <p className="login-description">{t("select_role_or_enter_data_manually")}</p>

          <div className="role-preview-grid" role="radiogroup" aria-label={t("roles_in_system")}>
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
                {t("email_label")}
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                {t("password_label")}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="solid-button" type="submit" disabled={loading}>
                {loading ? t("login_loading") : t("login_button")}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </PageTransition>
  );
}
