import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { useMapConfig, type ResolvedLayerIds } from '@contexts/MapConfigContext';
import { useAuth } from '@hooks/useAuth';
import styles from './AdminPage.module.css';

const PORTAL_URL_INPUT_ID = 'admin-portal-url';
const WEB_MAP_ID_INPUT_ID = 'admin-webmap-id';

const SUBMISSIONS_LAYER_TITLE = 'lifeline_submissions';
const STATUS_TABLE_TITLE = 'lifeline_status';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'success'; portalUrl: string; webMapId: string; resolved: ResolvedLayerIds }
  | { kind: 'error'; messageKey: string };

interface ActionButtonProps {
  onPress: () => void;
  isDisabled: boolean;
  label: string;
  variant: 'primary' | 'secondary';
}

function ActionButton({ onPress, isDisabled, label, variant }: ActionButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, isDisabled }, ref);
  const base = variant === 'primary' ? styles.saveBtn : styles.verifyBtn;
  const disabledClass = variant === 'primary' ? styles.saveBtnDisabled : styles.verifyBtnDisabled;
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={`${base}${isDisabled ? ` ${disabledClass}` : ''}`}
    >
      {label}
    </button>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { portalUrl, webMapId, setMapConfig } = useMapConfig();

  const isAdmin = user !== null && user.roles.includes('Admin');

  const [draftPortalUrl, setDraftPortalUrl] = useState(portalUrl);
  const [draftWebMapId, setDraftWebMapId] = useState(webMapId);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });

  const trimmedPortal = draftPortalUrl.trim();
  const trimmedId = draftWebMapId.trim();

  const validation = useMemo(() => {
    const portalNonEmpty = trimmedPortal.length > 0;
    const portalIsHttps = trimmedPortal.startsWith('https://');
    const portalValid = portalNonEmpty && portalIsHttps;
    const idValid = trimmedId.length > 0;
    const changed = trimmedPortal !== portalUrl || trimmedId !== webMapId;
    return {
      portalNonEmpty,
      portalIsHttps,
      portalValid,
      idValid,
      changed,
      canVerify: portalValid && idValid,
      canSave: portalValid && idValid && changed,
    };
  }, [trimmedPortal, trimmedId, portalUrl, webMapId]);

  const verifiedMatchesDraft =
    verify.kind === 'success' &&
    verify.portalUrl === trimmedPortal &&
    verify.webMapId === trimmedId;

  const handleVerify = async () => {
    if (!validation.canVerify) return;
    setVerify({ kind: 'verifying' });
    try {
      const [{ default: WebMap }, { default: Portal }] = await Promise.all([
        import('@arcgis/core/WebMap'),
        import('@arcgis/core/portal/Portal'),
      ]);
      const portal = new Portal({ url: trimmedPortal });
      const map = new WebMap({ portalItem: { id: trimmedId, portal } });
      await map.load();
      const subLayer = map.allLayers.find((l) => l.title === SUBMISSIONS_LAYER_TITLE);
      if (!subLayer) {
        setVerify({ kind: 'error', messageKey: 'admin.verifyLayerMissing' });
        return;
      }
      const statusTable = map.tables.find((tbl) => tbl.title === STATUS_TABLE_TITLE);
      if (!statusTable) {
        setVerify({ kind: 'error', messageKey: 'admin.verifyTableMissing' });
        return;
      }
      setVerify({
        kind: 'success',
        portalUrl: trimmedPortal,
        webMapId: trimmedId,
        resolved: { submissionsLayerId: subLayer.id, statusTableId: statusTable.id },
      });
    } catch {
      setVerify({ kind: 'error', messageKey: 'admin.verifyMapError' });
    }
  };

  const handleSave = () => {
    if (!validation.canSave) return;
    const resolved = verifiedMatchesDraft ? verify.resolved : null;
    setMapConfig(trimmedPortal, trimmedId, resolved);
    setSavedAt(Date.now());
  };

  if (!isAdmin) return null;

  const portalError =
    draftPortalUrl.length > 0 && !validation.portalValid
      ? validation.portalNonEmpty && !validation.portalIsHttps
        ? t('admin.portalUrlHttpsError')
        : t('admin.portalUrlError')
      : null;
  const idError =
    draftWebMapId.length > 0 && !validation.idValid ? t('admin.webMapIdError') : null;

  return (
    <section className={styles.page} aria-labelledby="admin-heading">
      <header className={styles.header}>
        <h1 id="admin-heading" className={styles.heading}>
          {t('admin.heading')}
        </h1>
        <p className={styles.subheading}>{t('admin.subheading')}</p>
      </header>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor={PORTAL_URL_INPUT_ID} className={styles.label}>
            {t('admin.portalUrlLabel')}
          </label>
          <input
            id={PORTAL_URL_INPUT_ID}
            type="url"
            inputMode="url"
            className={styles.input}
            value={draftPortalUrl}
            onChange={(e) => {
              setDraftPortalUrl(e.target.value);
              setSavedAt(null);
              setVerify({ kind: 'idle' });
            }}
            placeholder={t('admin.portalUrlPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={portalError !== null}
            aria-describedby={portalError ? `${PORTAL_URL_INPUT_ID}-error` : undefined}
          />
          {portalError && (
            <p id={`${PORTAL_URL_INPUT_ID}-error`} className={styles.error}>
              {portalError}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor={WEB_MAP_ID_INPUT_ID} className={styles.label}>
            {t('admin.webMapIdLabel')}
          </label>
          <input
            id={WEB_MAP_ID_INPUT_ID}
            type="text"
            className={styles.input}
            value={draftWebMapId}
            onChange={(e) => {
              setDraftWebMapId(e.target.value);
              setSavedAt(null);
              setVerify({ kind: 'idle' });
            }}
            placeholder={t('admin.webMapIdPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={idError !== null}
            aria-describedby={idError ? `${WEB_MAP_ID_INPUT_ID}-error` : undefined}
          />
          {idError && (
            <p id={`${WEB_MAP_ID_INPUT_ID}-error`} className={styles.error}>
              {idError}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <ActionButton
            variant="secondary"
            onPress={() => void handleVerify()}
            isDisabled={!validation.canVerify || verify.kind === 'verifying'}
            label={
              verify.kind === 'verifying'
                ? t('admin.verifying')
                : t('admin.verifyButton')
            }
          />
          <ActionButton
            variant="primary"
            onPress={handleSave}
            isDisabled={!validation.canSave}
            label={t('common.save')}
          />
          {savedAt !== null && (
            <span className={styles.savedHint} role="status">
              {t('admin.saved')}
            </span>
          )}
        </div>

        {verify.kind === 'success' && (
          <p className={styles.verifySuccess} role="status">
            {t('admin.verifySuccess')}
          </p>
        )}
        {verify.kind === 'error' && (
          <p className={styles.verifyError} role="status">
            {t(verify.messageKey)}
          </p>
        )}
      </div>
    </section>
  );
}
