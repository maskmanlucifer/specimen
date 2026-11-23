import { NavLink, useNavigate } from 'react-router-dom';
import { initials } from '../lib/format';
import { useSession } from '../store/session';
import { Avatar, Icon, Kbd, Logo } from './ui';

/** Header for the non-editor pages: wordmark, Boards / Plugins / Docs, search, avatar. */
export function AppHeader({ onSearch }: { onSearch?: () => void }) {
  const user = useSession((s) => s.session?.user);
  const nav = useNavigate();
  return (
    <header className="app-header">
      <NavLink to="/boards" style={{ textDecoration: 'none' }}>
        <Logo size={24} />
      </NavLink>
      <nav className="app-nav">
        <NavLink to="/boards">Boards</NavLink>
        <NavLink to="/plugins">Plugins</NavLink>
        <a href="https://github.com/maskmanlucifer/specimen#readme" target="_blank" rel="noreferrer">
          Docs
        </a>
      </nav>
      {onSearch && (
        <button type="button" className="app-search" onClick={onSearch} aria-label="Search boards, cards, transcripts">
          <Icon name="search" />
          <span>Search boards, cards, transcripts</span>
          <Kbd>⌘K</Kbd>
        </button>
      )}
      <button type="button" className="app-user" onClick={() => nav('/settings')} aria-label="Settings">
        <Avatar text={initials(user?.name ?? '?')} size={30} />
      </button>
    </header>
  );
}
