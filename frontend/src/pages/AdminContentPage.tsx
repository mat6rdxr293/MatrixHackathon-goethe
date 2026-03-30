import { type FormEvent, useState } from "react";
import { eventTypeLabelKey, roleLabelKey } from "../config/labels";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import { formatDate } from "../lib/format";
import type { AdminClassesResponse, EventItem, EventType, Role } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const todayIso = new Date().toISOString().slice(0, 10);

export function AdminContentPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<{ items: EventItem[] }>("/api/admin/content");
  const classesState = useApiData<AdminClassesResponse>("/api/admin/classes");

  const [type, setType] = useState<EventType>("news");
  const [date, setDate] = useState(todayIso);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetRoles, setTargetRoles] = useState<Role[]>([]);
  const [targetClassIdsRaw, setTargetClassIdsRaw] = useState("");
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setSubmitError(null);

    try {
      await privateApi.post("/api/admin/content", {
        type,
        title,
        description,
        date,
        targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
        targetClassIds: targetClassIdsRaw
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
      });
      setTitle("");
      setDescription("");
      setTargetClassIdsRaw("");
      setTargetRoles([]);
      await refresh();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const filtered = data?.items.filter((item) => (filter === "all" ? true : item.type === filter)) ?? [];

  return (
    <PageTransition>
      <div className="page-layout">
        <Section title={t("k_146")}>
          <form className="admin-form" onSubmit={submit}>
            <label>
              {t("k_147")}
              <select value={type} onChange={(event) => setType(event.target.value as EventType)}>
                <option value="news">{t("k_005")}</option>
                <option value="event">{t("k_006")}</option>
                <option value="announcement">{t("k_007")}</option>
              </select>
            </label>
            <label>
              {t("k_148")}
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              {t("k_149")}
              <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={4} required />
            </label>
            <label>
              {t("k_150")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              {t("k_224")}
              <div className="chip-row">
                {(["student", "teacher", "parent", "admin"] as Role[]).map((role) => {
                  const active = targetRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      className={active ? "chip-button active" : "chip-button"}
                      onClick={() =>
                        setTargetRoles((prev) =>
                          prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role],
                        )
                      }
                    >
                      {t(roleLabelKey(role))}
                    </button>
                  );
                })}
              </div>
            </label>
            <label>
              {t("k_225")}
              <input
                value={targetClassIdsRaw}
                onChange={(event) => setTargetClassIdsRaw(event.target.value)}
                placeholder={classesState.data?.items.map((item) => item.classId).join(", ") || ""}
              />
            </label>
            {submitError ? <p className="form-error">{submitError}</p> : null}
            <button className="solid-button" type="submit" disabled={sending}>
              {sending ? t("k_151") : t("k_152")}
            </button>
          </form>
        </Section>

        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <Section
            title={t("k_153")}
            action={
              <div className="chip-group">
                <button
                  className={filter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setFilter("all")}
                >
                  {t("k_109")}
                </button>
                {(["news", "event", "announcement"] as EventType[]).map((itemType) => (
                  <button
                    key={itemType}
                    className={filter === itemType ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setFilter(itemType)}
                  >
                    {t(eventTypeLabelKey(itemType))}
                  </button>
                ))}
              </div>
            }
          >
            <div className="list-grid">
              {filtered.map((item) => (
                <article key={item.id} className="mini-card">
                  <div className="mini-head">
                    <h4>{item.title}</h4>
                    <span className="chip">{t(eventTypeLabelKey(item.type))}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="mini-meta">
                    <span>{formatDate(item.date, lang)}</span>
                    {item.important ? <strong>{t("k_116")}</strong> : null}
                  </div>
                  <div className="chip-row">
                    {(item.targetRoles ?? []).map((role) => (
                      <span key={`${item.id}-${role}`} className="chip">
                        {t(roleLabelKey(role))}
                      </span>
                    ))}
                    {(item.targetClassIds ?? []).map((classId) => (
                      <span key={`${item.id}-${classId}`} className="chip warn">
                        {classId}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </PageTransition>
  );
}


