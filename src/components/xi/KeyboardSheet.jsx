import useVisualViewport from '../../xi/useVisualViewport';

// A bottom sheet pinned to the top edge of the on-screen keyboard. It lives in a
// fixed layer sized to the visual viewport, so its bottom edge sits exactly at
// the keyboard (no iOS pixel-math gap). When the keyboard is closed it rests just
// above the bottom nav. The layer ignores pointer events so the board stays
// tappable; only the sheet itself is interactive.
export default function KeyboardSheet({ children }) {
  const vp = useVisualViewport();
  return (
    <div className="xiv-kblayer" style={{ top: vp.top, height: vp.height }}>
      <div className="xiv-sheet" style={{ bottom: vp.keyboardOpen ? 0 : 60 }}>
        {children}
      </div>
    </div>
  );
}
