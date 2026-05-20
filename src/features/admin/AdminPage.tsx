import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { useMapConfig } from '@contexts/MapConfigContext';
import { useAuth } from '@hooks/useAuth';
import styles from './AdminPage.module.css';

const WEB_MAP_ID_INPUT_ID = 'admin-webmap-id';
const FEATURE_URL_INPUT_ID = 'admin-feature-url';

interface SaveButtonProps {
  onPress: () => void;
  isDisabled: boolean;
  label: string;
}

function SaveButton({ onPress, isDisabled, label }: SaveButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, isDisabled }, ref);
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={`${styles.saveBtn}${isDisabled ? ` ${styles.saveBtnDisabled}` : ''}`}
    >
      {label}
    </button>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { webMapId, featureServiceUrl, setMapConfig } = useMapConfig();

  const isAdmin = user !== null && user.roles.includes('Admin');

  const [draftWebMapId, setDraftWebMapId] = useState(webMapId);
  const [draftFeatureUrl, setDraftFeatureUrl] = useState(featureServiceUrl);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const trimmedId = draftWebMapId.trim();
  const trimmedUrl = draftFeatureUrl.trim();

  const validation = useMemo(() => {
    const idValid = trimmedId.length > 0;
    const urlNonEmpty = trimmedUrl.length > 0;
    const urlIsHttps = trimmedUrl.startsWith('https://');
    const urlValid = urlNonEmpty && urlIsHttps;
    const changed = trimmedId !== webMapId || trimmedUrl !== featureServiceUrl;
    return {
      idValid,
      urlNonEmpty,
      urlIsHttps,
      urlValid,
      changed,
      canSave: idValid && urlValid && changed,
    };
  }, [trimmedId, trimmedUrl, webMapId, featureServiceUrl]);

  const handleSave = () => {
    if (!validation.canSave) return;
    setMapConfig(trimmedId, trimmedUrl);
    setSavedAt(Date.now());
  };

  if (!isAdmin) return null;

  const idError =
    draftWebMapId.length > 0 && !validation.idValid ? t('admin.webMapIdError') : null;
  const urlError =
    draftFeatureUrl.length > 0 && !validation.urlValid
      ? validation.urlNonEmpty && !validation.urlIsHttps
        ? t('admin.featureUrlHttpsError')
        : t('admin.featureUrlError')
      : null;

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

        <div className={styles.field}>
          <label htmlFor={FEATURE_URL_INPUT_ID} className={styles.label}>
            {t('admin.featureUrlLabel')}
          </label>
          <input
            id={FEATURE_URL_INPUT_ID}
            type="url"
            inputMode="url"
            className={styles.input}
            value={draftFeatureUrl}
            onChange={(e) => {
              setDraftFeatureUrl(e.target.value);
              setSavedAt(null);
            }}
            placeholder={t('admin.featureUrlPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={urlError !== null}
            aria-describedby={urlError ? `${FEATURE_URL_INPUT_ID}-error` : undefined}
          />
          {urlError && (
            <p id={`${FEATURE_URL_INPUT_ID}-error`} className={styles.error}>
              {urlError}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <SaveButton
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
      </div>
    </section>
  );
}
