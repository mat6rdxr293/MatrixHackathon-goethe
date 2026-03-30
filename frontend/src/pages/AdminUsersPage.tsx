import { type FormEvent, useMemo, useState } from "react";
import { roleLabelKey } from "../config/labels";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import type {
  AdminClassesResponse,
  AdminUsersResponse,
  BilimSyncResponse,
  Role,
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

export function AdminUsersPage() {
  const { t } = useI18n();
  const usersState = useApiData<AdminUsersResponse>("/api/admin/users");
  const classesState = useApiData<AdminClassesResponse>("/api/admin/classes");
  const studentsState = useApiData<BilimSyncResponse>("/api/integrations/bilimclass/students");

  const [filterRole, setFilterRole] = useState<Role | "all">("all");
  const [classId, setClassId] = useState("");
  const [classTeacherId, setClassTeacherId] = useState("");
  const [classError, setClassError] = useState<string | null>(null);
  const [classSuccess, setClassSuccess] = useState<string | null>(null);
  const [classSaving, setClassSaving] = useState(false);

  const [userForm, setUserForm] = useState<UserFormState>(initialUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  const users = useMemo(() => usersState.data?.users ?? [], [usersState.data]);
  const classes = useMemo(() => classesState.data?.items ?? [], [classesState.data]);
  const studentProfiles = useMemo(() => studentsState.data?.students ?? [], [studentsState.data]);

  const filtered = users.filter((item) => (filterRole === "all" ? true : item.role === filterRole));
  const teachers = useMemo(() => users.filter((item) => item.role === "teacher"), [users]);

  const countByRole = (role: Role) => users.filter((item) => item.role === role).length;

  const loading = usersState.loading || classesState.loading || studentsState.loading;
  const error = usersState.error ?? classesState.error ?? studentsState.error;

  const refreshAll = async () => {
    await Promise.all([usersState.refresh(), classesState.refresh(), studentsState.refresh()]);
  };

  const submitClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClassSaving(true);
    setClassError(null);
    setClassSuccess(null);

    try {
      await privateApi.post("/api/admin/classes", {
        classId,
        teacherId: classTeacherId || null,
      });
      setClassId("");
      setClassTeacherId("");
      setClassSuccess(t("k_184"));
      await refreshAll();
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
      setUserSuccess(t("k_191"));
      await refreshAll();
    } catch (err) {
      setUserError(getErrorMessage(err));
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refreshAll} />

        {!loading && !error ? (
          <>
            <div className="dual-grid">
              <Section title={t("k_180")}>
                <form className="admin-form" onSubmit={submitClass}>
                  <label>
                    {t("k_181")}
                    <input
                      value={classId}
                      onChange={(event) => setClassId(event.target.value.toUpperCase())}
                      required
                    />
                  </label>
                  <label>
                    {t("k_182")}
                    <select
                      value={classTeacherId}
                      onChange={(event) => setClassTeacherId(event.target.value)}
                    >
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
              </Section>

              <Section title={t("k_187")}>
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
                      onChange={(event) =>
                        setUserForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    {t("k_067")}
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) =>
                        setUserForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    {t("k_188")}
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) =>
                        setUserForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      minLength={6}
                      required
                    />
                  </label>
                  {userForm.role === "student" || userForm.role === "teacher" ? (
                    <label>
                      {t("k_083")}
                      <select
                        value={userForm.classId}
                        onChange={(event) =>
                          setUserForm((prev) => ({ ...prev, classId: event.target.value }))
                        }
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
                        onChange={(event) =>
                          setUserForm((prev) => ({
                            ...prev,
                            linkedStudentId: event.target.value,
                          }))
                        }
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
              </Section>
            </div>

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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>{t(roleLabelKey(item.role))}</td>
                      <td>{item.classId ?? "-"}</td>
                      <td>{item.linkedStudentId ?? "-"}</td>
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
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
