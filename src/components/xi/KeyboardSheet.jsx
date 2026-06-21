import useVisualViewport from '../../xi/useVisualViewport';

// A bottom sheet pinned to the bottom edge of the visual viewport — i.e. exactly
// above the on-screen keyboard when it's open, or at the bottom of the screen
// when it's closed. It lives in a fixed layer sized to the visual viewport, so
// there's no iOS pixel-math gap. The layer ignores pointer events so the board
// stays tappable; only the sheet itself is interactive. While the sheet is up it
// sits over the bottom nav (you dismiss it with Cancel/Done).
export default function KeyboardSheet({ children }) {
  const vp = useVisualViewport();
  return (
    <div className="xiv-kblayer" style={{ top: vp.top, height: vp.height }}>
      <div className="xiv-sheet">{children}</div>
    </div>
  );
}
