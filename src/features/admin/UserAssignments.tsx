import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusScope } from '@react-aria/focus';
import { useDialog } from '@react-aria/dialog';
import { DismissButton, useOverlay } from '@react-aria/overlays';
import { useAppUsers, type AppUser } from '@hooks/useAppUsers';
import { useLifelineAssignments } from '@hooks/useLifelineAssignments';
import { LIFELINE_IDS } from '@utils/defaultLifelines';
import type { LifelineId } from '@types';
import styles from './UserAssignments.module.css';

// ─── Assignment modal ─────────────────────────────────────────────────────────

interface AssignmentDialogProps {
  user: AppUser;
  initial: LifelineId[];
  onSave: (lifelines: LifelineId[]) => Promise<void>;
  onClose: () => void;
}

function AssignmentDialog({ user, initial, onSave, onClose }: AssignmentDialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { overlayProps } = useOverlay({ isOpen: true, onClose, isDismissable: true }, ref);
  const { dialogProps, titleProps } = useDialog({}, ref);

  const [selected, setSelected] = useState<Set<LifelineId>>(new Set(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  const toggle = (id: LifelineId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setErr(false);
    try {
      await onSave([...selected]);
      onClose();
    } catch {
      setErr(true);
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <FocusScope contain autoFocus restoreFocus>
        <div {...overlayProps} {...dialogProps} ref={ref} className={styles.dialog}>
          <DismissButton onDismiss={onClose} />
          <h3 {...titleProps} className={styles.dialogTitle}>
            {t('admin.assign.dialogTitle', { name: user.email || user.username })}
          </h3>
          <div className={styles.checkList}>
            {LIFELINE_IDS.map((id) => (
              <label key={id} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                  disabled={saving}
                />
                <span>{t(`lifeline.${id}.label`)}</span>
              </label>
            ))}
          </div>
          {err && <p className={styles.err}>{t('admin.assign.error')}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="button" className={styles.saveBtn} onClick={() => void save()} disabled={saving}>
              {saving ? t('admin.assign.saving') : t('common.save')}
            </button>
          </div>
          <DismissButton onDismiss={onClose} />
        </div>
      </FocusScope>
    </div>
  );
}

// ─── User list ────────────────────────────────────────────────────────────────

export default function UserAssignments() {
  const { t } = useTranslation();
  const { users, loading, error } = useAppUsers();
  const { byUser, setAssignment } = useLifelineAssignments();
  const [editing, setEditing] = useState<AppUser | null>(null);

  return (
    <section className={styles.section} aria-labelledby="assign-heading">
      <h2 id="assign-heading" className={styles.heading}>
        {t('admin.assign.heading')}
      </h2>
      <p className={styles.subheading}>{t('admin.assign.subheading')}</p>

      {loading ? (
        <p className={styles.hint}>{t('admin.assign.loading')}</p>
      ) : error ? (
        <p className={styles.hint}>{t('admin.assign.loadError')}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('admin.assign.colUser')}</th>
              <th>{t('admin.assign.colLifelines')}</th>
              <th aria-label={t('common.edit')} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const lifelines = (byUser.get(u.sub)?.lifelines ?? []).filter(
                Boolean,
              ) as LifelineId[];
              return (
                <tr key={u.sub || u.username}>
                  <td className={styles.userCell}>{u.email || u.username}</td>
                  <td>
                    {lifelines.length === 0 ? (
                      <em className={styles.none}>{t('admin.assign.none')}</em>
                    ) : (
                      <span className={styles.chips}>
                        {lifelines.map((id) => (
                          <span key={id} className={styles.chip}>
                            {t(`lifeline.${id}.shortLabel`)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className={styles.actionCell}>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => setEditing(u)}
                      disabled={u.sub === ''}
                    >
                      {t('common.edit')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <AssignmentDialog
          user={editing}
          initial={(byUser.get(editing.sub)?.lifelines ?? []).filter(Boolean) as LifelineId[]}
          onSave={(lifelines) => setAssignment(editing.sub, editing.email, lifelines)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
