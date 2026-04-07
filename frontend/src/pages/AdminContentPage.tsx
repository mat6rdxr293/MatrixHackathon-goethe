import { X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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
  const [isComposerOpen, setComposerOpen] = useState(false);

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
      setComposerOpen(false);
      await refresh();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const filtered = data?.items.filter((item) => (filter === "all" ? true : item.type === filter)) ?? [];

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setComposerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isComposerOpen]);

  return (
    <PageTransition>
      <div className="page-layout">
        <section className="users-actions-card content-compose-actions">
          <div className="users-actions-copy">
            <h3>{t("new_content")}</h3>
            <p>{t("feed_content")}</p>
          </div>
          <button className="solid-button content-compose-open" type="button" onClick={() => setComposerOpen(true)}>
            {t("new_content")}
          </button>
        </section>

        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <Section
            title={t("feed_content")}
            action={
              <div className="chip-group">
                <button
                  className={filter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setFilter("all")}
                >
                  {t("all")}
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
                    {item.important ? <strong>{t("important")}</strong> : null}
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

        <button
          className={isComposerOpen ? "users-modal-backdrop show" : "users-modal-backdrop"}
          type="button"
          aria-hidden={isComposerOpen ? "false" : "true"}
          tabIndex={-1}
          onClick={() => setComposerOpen(false)}
        />

        <aside className={isComposerOpen ? "users-modal content-compose-modal open" : "users-modal content-compose-modal"}>
          <header className="users-modal-head">
            <h3>{t("new_content")}</h3>
            <button className="icon-btn users-modal-close" type="button" onClick={() => setComposerOpen(false)}>
              <X size={18} />
            </button>
          </header>

          <form className="admin-form content-compose-form" onSubmit={submit}>
            <label>
              {t("title")}
              <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={4} required />
            </label>
            <label>
              {t("type")}
              <select value={type} onChange={(event) => setType(event.target.value as EventType)}>
                <option value="news">{t("news")}</option>
                <option value="event">{t("event")}</option>
                <option value="announcement">{t("announcement")}</option>
              </select>
            </label>
            <label>
              {t("date")}
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              {t("for_which_classes")}
              <input
                value={targetClassIdsRaw}
                onChange={(event) => setTargetClassIdsRaw(event.target.value)}
                placeholder={classesState.data?.items.map((item) => item.classId).join(", ") || ""}
              />
            </label>
            <label>
              {t("description")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              {t("audience_show")}
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
            {submitError ? <p className="form-error">{submitError}</p> : null}
            <button className="solid-button content-publish-button" type="submit" disabled={sending}>
              {sending ? t("publishing") : t("publish")}
            </button>
          </form>
        </aside>
      </div>
    </PageTransition>
  );
}
