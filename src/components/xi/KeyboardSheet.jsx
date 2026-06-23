// A bottom sheet pinned to the bottom edge of the screen — which, with the
// viewport meta `interactive-widget=resizes-content` (see index.html), is exactly
// the top of the on-screen keyboard when it's open. The layout viewport shrinks
// with the keyboard, so a plain fixed/bottom-anchored layer lands above it with
// no visualViewport pixel-math. The layer ignores pointer events so the board
// stays tappable; only the sheet itself is interactive. While the sheet is up it
// sits over the bottom nav (you dismiss it with Cancel/Done).
export default function KeyboardSheet({ children }) {
  return (
    <div className="xiv-kblayer">
      <div className="xiv-sheet">{children}</div>
    </div>
  );
}
