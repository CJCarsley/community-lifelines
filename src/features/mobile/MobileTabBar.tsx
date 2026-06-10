import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MobileTabBar.module.css';

export type MobileTab = 'overview' | 'map' | 'chat' | 'admin';

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1.1 1.5V22a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 8 20.3a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.7 8a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 8 3.7a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 16 3.7a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

interface TabDef {
  id: MobileTab;
  labelKey: string;
  Icon: ComponentType;
}

const BASE_TABS: TabDef[] = [
  { id: 'overview', labelKey: 'nav.overview', Icon: GridIcon },
  { id: 'map', labelKey: 'nav.map', Icon: MapIcon },
  { id: 'chat', labelKey: 'nav.chat', Icon: ChatIcon },
];

export interface MobileTabBarProps {
  tab: MobileTab;
  isAdmin: boolean;
  onChange: (tab: MobileTab) => void;
}

export default function MobileTabBar({ tab, isAdmin, onChange }: MobileTabBarProps) {
  const { t } = useTranslation();
  const tabs = isAdmin
    ? [...BASE_TABS, { id: 'admin' as const, labelKey: 'admin.navButton', Icon: GearIcon }]
    : BASE_TABS;

  return (
    <nav className={styles.bar} role="tablist" aria-label={t('nav.lifelineRail')}>
      {tabs.map(({ id, labelKey, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.tab}${active ? ` ${styles.tabActive}` : ''}`}
            onClick={() => onChange(id)}
          >
            <Icon />
            <span className={styles.label}>{t(labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
