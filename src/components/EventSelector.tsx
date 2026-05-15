import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { FocusScope } from '@react-aria/focus';
import { useListBox, useOption } from '@react-aria/listbox';
import { DismissButton, useOverlay } from '@react-aria/overlays';
import { Item, useListState } from 'react-stately';
import type { ListState } from '@react-stately/list';
import { useCrisisEventContext } from '@contexts/CrisisEventContext';
import type { CrisisEvent } from '@types';
import styles from './EventSelector.module.css';

const TRUNCATE_LEN = 28;

function truncate(s: string) {
  return s.length > TRUNCATE_LEN ? s.slice(0, TRUNCATE_LEN - 1) + '…' : s;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTypeClass(type: string): string {
  const key = `type_${type}`;
  return (styles as Record<string, string>)[key] ?? styles.type_default;
}

// ─── EventOption ──────────────────────────────────────────────────────────────

interface EventOptionProps {
  item: { key: React.Key; value: CrisisEvent | null };
  state: ListState<CrisisEvent>;
}

function EventOption({ item, state }: EventOptionProps) {
  const ref = useRef<HTMLLIElement>(null);
  const { optionProps, isSelected, isFocused } = useOption(
    { key: item.key },
    state,
    ref as React.RefObject<HTMLElement>,
  );
  const event = item.value;
  if (!event) return null;

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
      <span className={styles.optionName}>{event.name}</span>
      <span className={styles.optionMeta}>
        <span className={`${styles.typeBadge} ${getTypeClass(event.type)}`}>{event.type}</span>
        <span className={styles.optionDate}>{formatDate(event.startDate)}</span>
        <span className={styles.optionCounties}>{event.affectedCounties.length} counties</span>
      </span>
    </li>
  );
}

// ─── EventSelector ────────────────────────────────────────────────────────────

export default function EventSelector() {
  const { t } = useTranslation();
  const { events, activeEvent, setActiveEventId } = useCrisisEventContext();
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
      isDisabled: events.length === 0,
      'aria-haspopup': 'listbox',
      'aria-expanded': isOpen,
    },
    triggerRef,
  );

  const { overlayProps } = useOverlay(
    { isOpen, onClose: close, isDismissable: true },
    overlayRef,
  );

  const state = useListState<CrisisEvent>({
    items: events,
    children: (event) => (
      <Item key={event.id} textValue={event.name}>
        {event.name}
      </Item>
    ),
    selectionMode: 'single',
    selectedKeys: activeEvent ? new Set([activeEvent.id]) : new Set<string>(),
    onSelectionChange: (keys) => {
      if (keys === 'all') return;
      const [id] = [...keys];
      if (id != null) {
        setActiveEventId(String(id));
        close();
      }
    },
  });

  const { listBoxProps } = useListBox(
    { 'aria-label': t('topBar.eventSelector.label'), autoFocus: isOpen ? 'first' : false },
    state,
    listBoxRef,
  );

  return (
    <div className={styles.container}>
      <button {...buttonProps} ref={triggerRef} className={styles.trigger}>
        <span className={styles.triggerName}>
          {activeEvent ? truncate(activeEvent.name) : t('topBar.noEvents')}
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
                <EventOption
                  key={item.key}
                  item={item as { key: React.Key; value: CrisisEvent | null }}
                  state={state}
                />
              ))}
            </ul>
            <DismissButton onDismiss={close} />
          </div>
        </FocusScope>
      )}
    </div>
  );
}
