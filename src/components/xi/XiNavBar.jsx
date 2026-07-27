import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getLastVersusGame } from '../../hooks/useVersusGame';
import './XiNavBar.css';

// The four destinations, matching the iOS app's tab bar (XiNavBar.swift):
// today · versus · board · library, lowercase serif labels, gold when active.
// Curate left the bar (it lives behind Today's gear, like the app); Board of
// the Day stays retired.
const ITEMS = [
  { key: 'today', label: 'today' },
  { key: 'versus', label: 'versus', route: '/xi/versus' },
  { key: 'board', label: 'board' },
  { key: 'library', label: 'library' },
];

// Icons mirror the app's SF Symbols: rectangle.portrait.on.rectangle.portrait,
// person.2, sparkles, books.vertical. The sparkles star paths are the exact
// bezier fit of Apple's glyph (big star bottom-right, medium left, small top).
const ICONS = {
  today: (
    <>
      <rect x="4" y="6.5" width="12.5" height="15" rx="2" />
      <path d="M8.5 3h9A2.5 2.5 0 0 1 20 5.5V17" />
    </>
  ),
  versus: (
    <>
      <path d="M15 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="6.5" r="3.5" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.87" />
      <path d="M15.5 3.13a3.5 3.5 0 0 1 0 6.75" />
    </>
  ),
  board: (
    <g transform="translate(0.5 1.5) scale(0.235)" fill="currentColor" stroke="none">
      <path d="M 55.8 31.9C52.8 32.3 53.9 36.4 53.2 38.5C52.5 44.4 52.0 51.0 47.3 55.3C42.9 59.9 36.4 60.6 30.4 61.3C28.2 61.9 24.2 60.8 23.9 64.0C24.4 67.0 28.4 65.9 30.6 66.6C36.5 67.4 43.0 68.0 47.3 72.6C52.0 76.9 52.5 83.5 53.3 89.4C54.0 91.5 52.7 95.5 55.8 95.9C59.0 95.6 57.9 91.6 58.5 89.4C59.4 83.5 60.0 76.9 64.6 72.6C68.8 68.0 75.4 67.3 81.2 66.5C83.4 65.8 87.4 67.0 87.9 64.0C87.7 60.8 83.6 61.9 81.5 61.2C75.5 60.5 68.9 59.9 64.6 55.2C59.9 51.0 59.3 44.5 58.5 38.5C57.9 36.4 59.0 32.2 55.8 31.9Z" />
      <path d="M 25.8 21.9C24.5 22.2 25.1 23.9 24.7 24.8C24.4 27.4 24.3 30.3 22.3 32.2C20.4 34.3 17.4 34.4 14.8 34.7C13.9 35.0 12.2 34.5 11.9 35.8C12.0 37.2 13.9 36.8 14.8 37.0C17.4 37.4 20.4 37.4 22.3 39.5C24.3 41.4 24.4 44.3 24.7 46.9C25.0 47.9 24.5 49.6 25.8 49.9C27.2 49.8 26.8 48.0 27.0 47.1C27.4 44.4 27.4 41.4 29.6 39.5C31.5 37.4 34.5 37.4 37.1 37.0C38.0 36.8 39.8 37.2 39.9 35.8C39.6 34.5 37.9 35.0 36.9 34.7C34.3 34.4 31.4 34.3 29.5 32.3C27.4 30.4 27.4 27.4 27.0 24.8C26.8 23.9 27.2 22.0 25.8 21.9Z" />
      <path d="M 47.9 4.9C47.1 5.1 47.3 6.2 47.2 6.9C47.1 8.5 46.7 10.3 45.5 11.5C44.3 12.7 42.5 13.1 40.8 13.2C40.2 13.3 39.0 13.1 38.9 14.0C39.2 14.8 40.2 14.4 40.8 14.6C42.5 14.7 44.2 15.0 45.4 16.3C46.8 17.5 47.1 19.3 47.2 21.0C47.3 21.6 47.1 22.8 47.9 22.8C48.7 22.7 48.4 21.6 48.6 21.0C48.6 19.3 49.1 17.5 50.4 16.2C51.6 15.0 53.3 14.6 55.0 14.6C55.6 14.4 56.6 14.8 56.8 14.0C56.8 13.1 55.6 13.3 55.0 13.2C53.3 13.1 51.5 12.8 50.3 11.5C49.1 10.3 48.6 8.5 48.6 6.9C48.4 6.2 48.8 5.1 47.9 4.9Z" />
    </g>
  ),
  library: <path d="m16 6 4 14M12 6v14M8 8v12M4 4v16" />,
};

// Shared bottom nav, rendered on every XI screen. Hidden only while a text box
// is focused so the writer can still escape but isn't crowded mid-story.
export default function XiNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const isText = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    const onIn = (e) => { if (isText(e.target)) setWriting(true); };
    const onOut = (e) => { if (isText(e.target)) setWriting(false); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);

  let active;
  if (location.pathname.startsWith('/xi/versus')) active = 'versus';
  // Board of the Day is retired from the nav (July 2026) — the route still
  // works if opened directly, it just isn't linked anywhere.
  else if (location.pathname === '/xi/board') active = '';
  else active = params.get('s') || 'today';

  const go = (item) => {
    // Tapping Versus drops you back into the game you were last in, if any.
    if (item.key === 'versus') {
      const last = getLastVersusGame();
      navigate(last ? '/xi/versus/' + last : '/xi/versus');
      return;
    }
    navigate(item.route || ('/xi?s=' + item.key));
  };

  return (
    <nav className={'xinav' + (writing ? ' writing' : '')}>
      {ITEMS.map((it) => (
        <button key={it.key} className={'xinav-btn' + (active === it.key ? ' on' : '')} onClick={() => go(it)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[it.key]}</svg>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
