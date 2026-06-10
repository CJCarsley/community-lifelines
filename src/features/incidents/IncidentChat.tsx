import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIncidentChat, type ChatMessage } from '@hooks/useIncidentChat';
import styles from './IncidentChat.module.css';

interface IncidentChatProps {
  incidentId: string;
  // null = Live; a timestamp filters to messages posted at/before it.
  asOfMs: number | null;
  currentUserEmail: string | null;
  // Renders full-viewport for the popped-out window (no dock/minimize/pop-out).
  fullWindow?: boolean;
}

function fmtTime(iso?: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
}

function toCsv(messages: ChatMessage[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [['timestamp', 'author', 'message'].join(',')];
  for (const m of messages) {
    rows.push([esc(m.createdAt ?? ''), esc(m.author ?? ''), esc(m.body ?? '')].join(','));
  }
  return rows.join('\n');
}

export default function IncidentChat({
  incidentId,
  asOfMs,
  currentUserEmail,
  fullWindow = false,
}: IncidentChatProps) {
  const { t } = useTranslation();
  const { messages, post, edit, remove } = useIncidentChat(incidentId);

  const [minimized, setMinimized] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const live = asOfMs === null;
  const visible = useMemo(
    () =>
      live
        ? messages
        : messages.filter((m) => m.createdAt != null && Date.parse(m.createdAt) <= asOfMs),
    [messages, asOfMs, live],
  );

  // Keep the latest message in view (only when Live, so scrubbing doesn't jump).
  useEffect(() => {
    if (live && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible.length, live]);

  const send = () => {
    const body = draft;
    setDraft('');
    void post(body);
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(visible)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-${incidentId}-chat.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const popOut = () => {
    window.open(
      `${window.location.pathname}?chat=${encodeURIComponent(incidentId)}`,
      `incidentchat_${incidentId}`,
      'popup,width=420,height=640',
    );
  };

  if (!fullWindow && minimized) {
    return (
      <button type="button" className={styles.launcher} onClick={() => setMinimized(false)}>
        💬 {t('chat.title')}
        {visible.length > 0 ? ` (${visible.length})` : ''}
      </button>
    );
  }

  return (
    <div className={fullWindow ? styles.panelFull : styles.panel} role="region" aria-label={t('chat.title')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('chat.title')}</span>
        <div className={styles.headerBtns}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={exportCsv}
            aria-label={t('chat.export')}
            title={t('chat.export')}
          >
            ⤓
          </button>
          {!fullWindow && (
            <>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={popOut}
                aria-label={t('chat.popOut')}
                title={t('chat.popOut')}
              >
                ⧉
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setMinimized(true)}
                aria-label={t('chat.minimize')}
                title={t('chat.minimize')}
              >
                —
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.body} ref={listRef}>
        {visible.length === 0 ? (
          <p className={styles.empty}>{t('chat.empty')}</p>
        ) : (
          visible.map((m) => {
            const own = currentUserEmail != null && m.author === currentUserEmail;
            const isEditing = editingId === m.id;
            const edited = m.updatedAt != null && m.updatedAt !== m.createdAt;
            return (
              <div key={m.id} className={styles.msg}>
                <div className={styles.msgMeta}>
                  <span className={styles.author}>{m.author ?? '—'}</span>
                  <span className={styles.time}>
                    {fmtTime(m.createdAt)}
                    {edited ? ` · ${t('chat.edited')}` : ''}
                  </span>
                </div>
                {isEditing ? (
                  <div className={styles.editRow}>
                    <textarea
                      className={styles.editArea}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                    />
                    <div className={styles.msgActions}>
                      <button
                        type="button"
                        onClick={() => {
                          void edit(m.id, editDraft);
                          setEditingId(null);
                        }}
                      >
                        {t('chat.save')}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        {t('chat.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.bodyText}>{m.body}</p>
                )}
                {own && !isEditing && live && (
                  <div className={styles.msgActions}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditDraft(m.body ?? '');
                      }}
                    >
                      {t('chat.edit')}
                    </button>
                    <button type="button" onClick={() => void remove(m.id)}>
                      {t('chat.delete')}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!live && <div className={styles.historyNote}>{t('chat.historyNote')}</div>}

      <div className={styles.footer}>
        <textarea
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat.placeholder')}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={send}
          disabled={draft.trim() === ''}
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
