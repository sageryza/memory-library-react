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

// The 2a icon set, traced from the redesign prototype: sun · overlapping
// circles · four squares · open book. Icon-only — the redesign drops the
// labels, so each button carries the label as its aria-label instead.
const ICONS = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2" />
    </>
  ),
  versus: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  board: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </>
  ),
  library: (
    <>
      <path d="M12 6.5C10.5 5 8.5 4.5 6 4.5H2.5v14H6c2.5 0 4.5.5 6 2 1.5-1.5 3.5-2 6-2h3.5v-14H18c-2.5 0-4.5.5-6 2Z" />
      <path d="M12 6.5v14" />
    </>
  ),
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
        <button key={it.key} className={'xinav-btn' + (active === it.key ? ' on' : '')} onClick={() => go(it)} aria-label={it.label}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[it.key]}</svg>
        </button>
      ))}
    </nav>
  );
}
