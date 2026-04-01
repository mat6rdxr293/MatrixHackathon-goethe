import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { roleLabelKey } from "../config/labels";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AdminClassesResponse,
  AdminUsersResponse,
  BilimSyncResponse,
  Role,
  SafeUser,
} from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { StatCard } from "../components/ui/StatCard";

type UserFormState = {
  role: Role;
  name: string;
  email: string;
  password: string;
  classId: string;
  linkedStudentId: string;
};

const initialUserForm: UserFormState = {
  role: "student",
  name: "",
  email: "",
  password: "",
  classId: "",
  linkedStudentId: "",
};

type UsersModalMode = "class" | "account" | "password" | null;

export function AdminUsersPage() {
  const { t } = useI18n();
  const usersState = useApiData<AdminUsersResponse>("/api/admin/users");
  const classesState = useApiData<AdminClassesResponse>("/api/admin/classes");
  const studentsState = useApiData<BilimSyncResponse>("/api/integrations/bilimclass/students");

  const [filterRole, setFilterRole] = useState<Role | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [classId, setClassId] = useState("");
  const [classTeacherId, setClassTeacherId] = useState("");
  const [classError, setClassError] = useState<string | null>(null);
  const [classSuccess, setClassSuccess] = useState<string | null>(null);
  const [classSaving, setClassSaving] = useState(false);
  const [modalMode, setModalMode] = useState<UsersModalMode>(null);

  const [userForm, setUserForm] = useState<UserFormState>(initialUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<SafeUser | null>(null);
  const [nextPassword, setNextPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userActionInProgress, setUserActionInProgress] = useState<string | null>(null);

  const users = useMemo(() => usersState.data?.users ?? [], [usersState.data]);
  const classes = useMemo(() => classesState.data?.items ?? [], [classesState.data]);
  const studentProfiles = useMemo(() => studentsState.data?.students ?? [], [studentsState.data]);

  const filtered = users.filter((item) => {
    if (filterRole !== "all" && item.role !== filterRole) {
      return false;
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [item.name, item.email, item.classId ?? "", item.linkedStudentId ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const teachers = useMemo(() => users.filter((item) => item.role === "teacher"), [users]);

  const countByRole = (role: Role) => users.filter((item) => item.role === role).length;

  const loading = usersState.loading || classesState.loading || studentsState.loading;
  const error = usersState.error ?? classesState.error ?? studentsState.error;

  const refreshAll = async () => {
    await Promise.all([usersState.refresh(), classesState.refresh(), studentsState.refresh()]);
  };

  const resetPasswordModal = useCallback(() => {
    setPasswordTargetUser(null);
    setNextPassword("");
    setPasswordError(null);
    setPasswordSaving(false);
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    resetPasswordModal();
  }, [resetPasswordModal]);

  const submitClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClassSaving(true);
    setClassError(null);
    setClassSuccess(null);
    setPageError(null);

    try {
      await privateApi.post("/api/admin/classes", {
        classId,
        teacherId: classTeacherId || null,
      });
      setClassId("");
      setClassTeacherId("");
      const successMessage = t("k_184");
      setClassSuccess(successMessage);
      setPageSuccess(successMessage);
      closeModal();
      await refreshAll().catch(() => undefined);
    } catch (err) {
      setClassError(getErrorMessage(err));
    } finally {
      setClassSaving(false);
    }
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserSaving(true);
    setUserError(null);
    setUserSuccess(null);
    setPageError(null);

    const payload = {
      role: userForm.role,
      name: userForm.name,
      email: userForm.email,
      password: userForm.password,
      classId: userForm.classId || undefined,
      linkedStudentId: userForm.linkedStudentId || undefined,
    };

    try {
      await privateApi.post("/api/admin/users", payload);
      setUserForm((prev) => ({
        ...initialUserForm,
        role: prev.role,
      }));
      const successMessage = t("k_191");
      setUserSuccess(successMessage);
      setPageSuccess(successMessage);
      closeModal();
      await refreshAll().catch(() => undefined);
    } catch (err) {
      setUserError(getErrorMessage(err));
    } finally {
      setUserSaving(false);
    }
  };

  const openPasswordModal = (targetUser: SafeUser) => {
    setPageError(null);
    setPasswordTargetUser(targetUser);
    setNextPassword("");
    setPasswordError(null);
    setModalMode("password");
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordTargetUser) {
      return;
    }

    const password = nextPassword.trim();
    if (password.length < 6) {
      setPasswordError(t("k_368"));
      return;
    }

    setPageError(null);
    setPasswordError(null);
    setPasswordSaving(true);
    setUserActionInProgress(passwordTargetUser.id);
    try {
      await privateApi.patch(`/api/admin/users/${encodeURIComponent(passwordTargetUser.id)}/password`, {
        password,
      });
      setPageSuccess(t("k_365"));
      closeModal();
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setPasswordSaving(false);
      setUserActionInProgress(null);
    }
  };

  const deleteUser = async (targetUser: SafeUser) => {
    const confirmDelete = window.confirm(`${t("k_366")}: ${targetUser.name}?`);
    if (!confirmDelete) {
      return;
    }

    setPageError(null);
    setUserActionInProgress(targetUser.id);
    try {
      await privateApi.delete(`/api/admin/users/${encodeURIComponent(targetUser.id)}`);
      setPageSuccess(t("k_371"));
      await refreshAll().catch(() => undefined);
    } catch (err) {
      setPageError(getErrorMessage(err));
    } finally {
      setUserActionInProgress(null);
    }
  };

  useEffect(() => {
    if (!modalMode) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal, modalMode]);

  useEffect(() => {
    if (!pageSuccess) {
      return;
    }
    const timerId = window.setTimeout(() => setPageSuccess(null), 3200);
    return () => window.clearTimeout(timerId);
  }, [pageSuccess]);

  const openModal = (mode: Exclude<UsersModalMode, null>) => {
    setPageError(null);
    if (mode === "class") {
      setClassError(null);
      setClassSuccess(null);
      resetPasswordModal();
    } else if (mode === "account") {
      setUserError(null);
      setUserSuccess(null);
      resetPasswordModal();
    }
    setModalMode(mode);
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refreshAll} />

        {!loading && !error ? (
          <>
            <section className="users-actions-card">
              <div className="users-actions-copy">
                <h3>{t("k_145")}</h3>
                <p>
                  {t("k_183")} / {t("k_190")}
                </p>
              </div>
              <div className="action-row">
                <button className="solid-button" type="button" onClick={() => openModal("account")}>
                  {t("k_190")}
                </button>
                <button className="outline-button" type="button" onClick={() => openModal("class")}>
                  {t("k_183")}
                </button>
              </div>
            </section>

            {pageSuccess ? <p className="users-success-banner">{pageSuccess}</p> : null}
            {pageError ? <p className="form-error">{pageError}</p> : null}

            <div className="stats-grid stats-grid-four">
              <StatCard title={t("k_140")} value={countByRole("student")} />
              <StatCard title={t("k_141")} value={countByRole("teacher")} />
              <StatCard title={t("k_142")} value={countByRole("parent")} />
              <StatCard title={t("k_143")} value={countByRole("admin")} />
              <StatCard title={t("k_018")} value={classes.length} />
            </div>

            <div className="filter-row">
              <div className="chip-group">
                <button
                  className={filterRole === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setFilterRole("all")}
                >
                  {t("k_144")}
                </button>
                {usersState.data?.roles.map((role) => (
                  <button
                    key={role}
                    className={filterRole === role ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setFilterRole(role)}
                  >
                    {t(roleLabelKey(role))}
                  </button>
                ))}
              </div>
              <div className="users-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("k_363")}
                />
              </div>
            </div>

            <Section title={t("k_145")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_126")}</th>
                    <th>{t("k_067")}</th>
                    <th>{t("k_127")}</th>
                    <th>{t("k_083")}</th>
                    <th>{t("k_189")}</th>
                    <th>{t("k_364")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t("k_340")}</td>
                    </tr>
                  ) : null}
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>{t(roleLabelKey(item.role))}</td>
                      <td>{item.classId ?? "-"}</td>
                      <td>{item.linkedStudentId ?? "-"}</td>
                      <td>
                        <div className="action-row users-table-actions">
                          <button
                            className="outline-button"
                            type="button"
                            disabled={userActionInProgress === item.id}
                            onClick={() => openPasswordModal(item)}
                          >
                            {t("k_367")}
                          </button>
                          <button
                            className="outline-button danger"
                            type="button"
                            disabled={userActionInProgress === item.id}
                            onClick={() => void deleteUser(item)}
                          >
                            {t("k_366")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title={t("k_185")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_083")}</th>
                    <th>{t("k_182")}</th>
                    <th>{t("k_186")}</th>
                    <th>{t("k_071")}</th>
                    <th>{t("k_139")}</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>
                        {item.teacherId
                          ? users.find((user) => user.id === item.teacherId)?.name ?? item.teacherId
                          : t("k_192")}
                      </td>
                      <td>{item.studentsCount}</td>
                      <td>{item.avgScore.toFixed(2)}</td>
                      <td>{item.riskStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <button
              className={modalMode ? "users-modal-backdrop show" : "users-modal-backdrop"}
              type="button"
              aria-hidden={modalMode ? "false" : "true"}
              tabIndex={-1}
              onClick={closeModal}
            />

            <aside className={modalMode ? "users-modal open" : "users-modal"} aria-hidden={!modalMode}>
              <header className="users-modal-head">
                <div>
                  <h3>
                    {modalMode === "class" ? t("k_180") : modalMode === "password" ? t("k_367") : t("k_187")}
                  </h3>
                </div>
                <button className="icon-btn users-modal-close" type="button" onClick={closeModal}>
                  <X size={18} />
                </button>
              </header>

              <div className="users-modal-tabs">
                <button
                  className={modalMode === "account" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setModalMode("account")}
                >
                  {t("k_190")}
                </button>
                <button
                  className={modalMode === "class" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setModalMode("class")}
                >
                  {t("k_183")}
                </button>
                {passwordTargetUser ? (
                  <button
                    className={modalMode === "password" ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setModalMode("password")}
                  >
                    {t("k_367")}
                  </button>
                ) : null}
              </div>

              {modalMode === "class" ? (
                <form className="admin-form" onSubmit={submitClass}>
                  <label>
                    {t("k_181")}
                    <input value={classId} onChange={(event) => setClassId(event.target.value.toUpperCase())} required />
                  </label>
                  <label>
                    {t("k_182")}
                    <select value={classTeacherId} onChange={(event) => setClassTeacherId(event.target.value)}>
                      <option value="">{t("k_193")}</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {classError ? <p className="form-error">{classError}</p> : null}
                  {classSuccess ? <p className="success-text">{classSuccess}</p> : null}
                  <button className="solid-button" type="submit" disabled={classSaving}>
                    {classSaving ? t("k_151") : t("k_183")}
                  </button>
                </form>
              ) : modalMode === "password" ? (
                <form className="admin-form" onSubmit={submitPasswordChange}>
                  <label>
                    {t("k_126")}
                    <input value={passwordTargetUser?.name ?? ""} disabled />
                  </label>
                  <label>
                    {t("k_067")}
                    <input value={passwordTargetUser?.email ?? ""} disabled />
                  </label>
                  <label>
                    {t("k_188")}
                    <input
                      type="password"
                      value={nextPassword}
                      onChange={(event) => setNextPassword(event.target.value)}
                      minLength={6}
                      required
                      autoFocus
                    />
                  </label>
                  <p className="muted-inline">{t("k_368")}</p>
                  {passwordError ? <p className="form-error">{passwordError}</p> : null}
                  <button
                    className="solid-button"
                    type="submit"
                    disabled={passwordSaving || !passwordTargetUser}
                  >
                    {passwordSaving ? t("k_151") : t("k_367")}
                  </button>
                </form>
              ) : (
                <form className="admin-form" onSubmit={submitUser}>
                  <label>
                    {t("k_127")}
                    <select
                      value={userForm.role}
                      onChange={(event) =>
                        setUserForm((prev) => ({
                          ...prev,
                          role: event.target.value as Role,
                          classId: "",
                          linkedStudentId: "",
                        }))
                      }
                    >
                      {(["student", "teacher", "parent", "admin"] as Role[]).map((role) => (
                        <option key={role} value={role}>
                          {t(roleLabelKey(role))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("k_126")}
                    <input
                      value={userForm.name}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    {t("k_067")}
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    {t("k_188")}
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                      minLength={6}
                      required
                    />
                  </label>
                  {userForm.role === "student" || userForm.role === "teacher" ? (
                    <label>
                      {t("k_083")}
                      <select
                        value={userForm.classId}
                        onChange={(event) => setUserForm((prev) => ({ ...prev, classId: event.target.value }))}
                        required={userForm.role === "student"}
                      >
                        <option value="">{t("k_193")}</option>
                        {classes.map((item) => (
                          <option key={item.classId} value={item.classId}>
                            {item.classId}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {userForm.role === "student" || userForm.role === "parent" ? (
                    <label>
                      {t("k_189")}
                      <select
                        value={userForm.linkedStudentId}
                        onChange={(event) => setUserForm((prev) => ({ ...prev, linkedStudentId: event.target.value }))}
                        required={userForm.role === "parent"}
                      >
                        <option value="">{t("k_193")}</option>
                        {studentProfiles.map((student) => (
                          <option key={student.studentId} value={student.studentId}>
                            {student.fullName} ({student.classId})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {userError ? <p className="form-error">{userError}</p> : null}
                  {userSuccess ? <p className="success-text">{userSuccess}</p> : null}
                  <button className="solid-button" type="submit" disabled={userSaving}>
                    {userSaving ? t("k_151") : t("k_190")}
                  </button>
                </form>
              )}
            </aside>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
