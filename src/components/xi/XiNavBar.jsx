import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getLastVersusGame } from '../../hooks/useVersusGame';
import './XiNavBar.css';

// The 7 destinations. Engine screens (today/curate/board/gallery/library) live
// inside the XI app and are selected via /xi?s=<key>; Board of the Day and
// Versus are their own routes.
const ITEMS = [
  { key: 'today', label: 'Today' },
  { key: 'curate', label: 'Curate' },
  { key: 'board', label: 'Board' },
  { key: 'boardday', label: 'Daily', route: '/xi/board' },
  { key: 'versus', label: 'Versus', route: '/xi/versus' },
  { key: 'gallery', label: 'Past' },
  { key: 'library', label: 'Library' },
];

const ICONS = {
  today: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  curate: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />,
  board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  boardday: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M3 15h18M9 10v11M15 10v11" /></>,
  versus: <path d="M3 6l7 6-7 6V6zM21 6l-7 6 7 6V6z" />,
  gallery: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
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
  else if (location.pathname === '/xi/board') active = 'boardday';
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
