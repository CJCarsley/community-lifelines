import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { FocusScope } from '@react-aria/focus';
import { useListBox, useOption } from '@react-aria/listbox';
import { DismissButton, useOverlay } from '@react-aria/overlays';
import { Item, useListState } from 'react-stately';
import type { ListState } from '@react-stately/list';
import type { Key } from '@react-types/shared';
import { useIncidentContext } from '@contexts/IncidentContext';
import { useAuth } from '@hooks/useAuth';
import type { IncidentRecord } from '@types';
import styles from './IncidentSelector.module.css';

const TRUNCATE_LEN = 28;

const GEOMETRY_ABBR: Record<IncidentRecord['geometryTypes'][number], string> = {
  point: 'PT',
  line: 'LN',
  area: 'AR',
};

function truncate(s: string) {
  return s.length > TRUNCATE_LEN ? s.slice(0, TRUNCATE_LEN - 1) + '…' : s;
}

// ─── IncidentOption ───────────────────────────────────────────────────────────

interface IncidentOptionProps {
  // react-aria's Key is narrower than React.Key (excludes bigint added in React 19)
  item: { key: Key; value: IncidentRecord | null };
  state: ListState<IncidentRecord>;
}

function IncidentOption({ item, state }: IncidentOptionProps) {
  const ref = useRef<HTMLLIElement>(null);
  const { optionProps, isSelected, isFocused } = useOption(
    { key: item.key },
    state,
    ref as React.RefObject<HTMLElement>,
  );
  const incident = item.value;
  if (!incident) return null;

  return (
    <li
      {...optionProps}
      ref={ref}
      className={[
        styles.option,
        isSelected ? styles.optionSelected : '',
        isFocused ? styles.optionFocused : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.optionName}>{incident.name}</span>
      <span className={styles.optionMeta}>
        <span className={styles.optionId}>#{incident.incidentId}</span>
        {incident.geometryTypes.map((g) => (
          <span key={g} className={styles.geometryChip}>
            {GEOMETRY_ABBR[g]}
          </span>
        ))}
      </span>
    </li>
  );
}

// ─── IncidentSelector ─────────────────────────────────────────────────────────

export default function IncidentSelector() {
  const { t } = useTranslation();
  const { incidents, activeIncident, setActiveIncidentId, setIsCreating } = useIncidentContext();
  const { user } = useAuth();
  const isAdmin = user !== null && user.roles.includes('Admin');
  const [isOpen, setIsOpen] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setOverlayStyle({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(rect.width, 260),
      });
    }
    setIsOpen(true);
  }, []);

  const { buttonProps } = useButton(
    {
      onPress: isOpen ? close : open,
      // Admins can always open the menu (to reach "Create New"); non-admins only
      // when there's something to select.
      isDisabled: incidents.length === 0 && !isAdmin,
      'aria-haspopup': 'listbox',
      'aria-expanded': isOpen,
    },
    triggerRef,
  );

  const { overlayProps } = useOverlay(
    { isOpen, onClose: close, isDismissable: true },
    overlayRef,
  );

  const state = useListState<IncidentRecord>({
    items: incidents,
    children: (incident) => (
      <Item key={incident.incidentId} textValue={incident.name}>
        {incident.name}
      </Item>
    ),
    selectionMode: 'single',
    selectedKeys: activeIncident ? new Set([activeIncident.incidentId]) : new Set<string>(),
    onSelectionChange: (keys) => {
      if (keys === 'all') return;
      const [id] = [...keys];
      if (id != null) {
        setActiveIncidentId(String(id));
        close();
      }
    },
  });

  const { listBoxProps } = useListBox(
    { 'aria-label': t('topBar.incidentSelector.label'), autoFocus: isOpen ? 'first' : false },
    state,
    listBoxRef,
  );

  return (
    <div className={styles.container}>
      <button {...buttonProps} ref={triggerRef} className={styles.trigger}>
        <span className={styles.triggerName}>
          {activeIncident ? truncate(activeIncident.name) : t('topBar.noIncidents')}
        </span>
        <svg
          className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ''}`}
          viewBox="0 0 10 6"
          width="10"
          height="6"
          aria-hidden="true"
        >
          <path d="M0 0l5 6 5-6z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <FocusScope restoreFocus>
          <div {...overlayProps} ref={overlayRef} style={overlayStyle} className={styles.overlay}>
            <DismissButton onDismiss={close} />
            <ul {...listBoxProps} ref={listBoxRef} className={styles.listBox}>
              {[...state.collection].map((item) => (
                <IncidentOption
                  key={item.key}
                  item={item as { key: Key; value: IncidentRecord | null }}
                  state={state}
                />
              ))}
            </ul>
            {isAdmin && (
              <>
                <div className={styles.menuDivider} role="separator" />
                <button
                  type="button"
                  className={styles.createNew}
                  onClick={() => {
                    setIsCreating(true);
                    close();
                  }}
                >
                  <span className={styles.createPlus} aria-hidden="true">+</span>
                  {t('incident.create.new')}
                </button>
              </>
            )}
            <DismissButton onDismiss={close} />
          </div>
        </FocusScope>
      )}
    </div>
  );
}
