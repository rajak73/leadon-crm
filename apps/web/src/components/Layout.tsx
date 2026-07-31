import { NavLink, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useI18n, LOCALES, type Locale } from '../lib/i18n';
import { Avatar } from './ui';
import { InstallButton } from './InstallButton';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcuts } from './KeyboardShortcuts';

// Instagram MVP surface only. The rest of the CRM (Leads, Deals, Pipeline,
// Contacts, Tasks, Workflows, Reports, Billing, Simulator) stays fully
// implemented and reachable by direct URL — just not linked from the sidebar,
// per the product decision to ship an Instagram-only front door for now.
const nav = [
  { to: '/app', key: 'nav.dashboard', icon: '📊', end: true },
  { to: '/app/inbox', key: 'nav.inbox', icon: '💬' },
  { to: '/app/leads', key: 'nav.leads', icon: '🎯' },
  { to: '/app/auto-reply-rules', key: 'nav.autoReplyRules', icon: '🤖' },
  { to: '/app/follow-ups', key: 'nav.followUps', icon: '⏱️' },
  { to: '/app/integrations', key: 'nav.integrations', icon: '🔌' },
  { to: '/app/team', key: 'nav.team', icon: '👥' },
  { to: '/app/api-docs', key: 'nav.apiDocs', icon: '📖' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, currentOrg, orgs, switchOrg, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const sidebar = (
    <>
      <div className="brand">LeadOS</div>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>{n.icon}</span> {t(n.key)}
        </NavLink>
      ))}
      {(currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN') && (
        <NavLink to="/app/audit" onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span>📜</span> {t('nav.audit')}
        </NavLink>
      )}
      {user?.isSuperAdmin && (
        <NavLink to="/admin" onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ marginTop: 8 }}>
          <span>🛡️</span> {t('nav.superAdmin')}
        </NavLink>
      )}
      <div className="spacer" />
      <button
        className="btn outline block"
        onClick={() => {
          // logout()'s state update renders Protected while still matched to
          // the current /app/* route, so its guard replaces history with
          // /login before this handler's navigate('/') call would otherwise
          // run — flushSync forces that redirect to happen synchronously
          // first, so the explicit navigate('/') below is guaranteed to be
          // the LAST history entry (landing on the public marketing page).
          flushSync(() => logout());
          navigate('/', { replace: true });
        }}
      >
        {t('action.signOut')}
      </button>
    </>
  );

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">{sidebar}</aside>

      {/* Mobile drawer + backdrop */}
      {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar sidebar-mobile ${menuOpen ? 'open' : ''}`}>{sidebar}</aside>

      <div className="main">
        <div className="topbar">
          <div className="row">
            <button className="hamburger" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>☰</button>
            {orgs.length > 1 ? (
              <select
                className="select"
                style={{ maxWidth: 200 }}
                value={currentOrg?.organizationId}
                onChange={(e) => switchOrg(e.target.value)}
              >
                {orgs.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>
                    {o.organizationName}
                  </option>
                ))}
              </select>
            ) : (
              <strong className="org-name">{currentOrg?.organizationName}</strong>
            )}
            <button
              className="btn sm outline hide-sm"
              style={{ color: 'var(--muted)' }}
              title="Search (⌘K)"
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            >
              🔍 Search <span style={{ opacity: 0.6, marginLeft: 6 }}>⌘K</span>
            </button>
          </div>
          <div className="row">
            <InstallButton />
            <select
              className="select hide-sm"
              style={{ width: 'auto', padding: '6px 8px' }}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label={t('common.language')}
              title={t('common.language')}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button className="btn sm outline" onClick={toggle} aria-label={t('common.theme')} title={t('common.theme')}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <NotificationBell />
            <span className="subtle hide-sm">{user?.firstName} {user?.lastName}</span>
            <Avatar name={`${user?.firstName} ${user?.lastName}`} />
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
    </div>
  );
}
