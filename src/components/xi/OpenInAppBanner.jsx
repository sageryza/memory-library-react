import { useState } from 'react';
import { APP_STORE_URL, isIOS, openInApp } from '../../xi/appLinks';

/**
 * Floating "Open in the XI app" card for XI web surfaces. Safari's own Smart
 * App Banner (index.html apple-itunes-app meta) covers Safari; this card
 * covers everywhere the Smart Banner doesn't show — in-app browsers (Gmail,
 * Messages previews) and non-Safari iOS browsers. One tap tries the app
 * (xi:// deep link) and falls through to the App Store when it isn't
 * installed. iOS only — that's where the app lives. Dismissal is remembered
 * per device so it never nags; it deliberately stays OFF the versus game
 * pages, which have their own inline button where a floating card would
 * cover the board.
 *
 * `target` = xi:// path to open ('' for home, 'share/{id}' on shared
 * boards); `lift` raises the card above the XI bottom nav on /xi pages.
 */
export default function OpenInAppBanner({ target = '', lift = false }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('xiOpenAppDismissed') === '1'; } catch { return false; }
  });
  if (dismissed || !isIOS()) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('xiOpenAppDismissed', '1'); } catch { /* ignore */ }
  };

  return (
    <div style={{ ...styles.wrap, bottom: lift ? 68 : 12 }}>
      <button style={styles.close} onClick={dismiss} aria-label="Dismiss">✕</button>
      <img src="/xi-app-icon.png" alt="" style={styles.appIcon} />
      <div style={styles.textcol}>
        <div style={styles.title}>XI is better in the app</div>
        <div style={styles.subtitle}>free on the App Store</div>
      </div>
      <button style={styles.open} onClick={() => openInApp(target)}>Open</button>
    </div>
  );
}

// Kept for non-JS contexts that need a plain link.
export { APP_STORE_URL };

const styles = {
  wrap: {
    position: 'fixed',
    left: 12,
    right: 12,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#f5f0e6',
    border: '1px solid #c9a227',
    borderRadius: 6,
    padding: '10px 40px 10px 12px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
    maxWidth: 430,
    margin: '0 auto',
    fontFamily: 'Georgia, serif',
    color: '#2b2b2b',
  },
  close: {
    position: 'absolute',
    top: 6,
    right: 8,
    border: 'none',
    background: 'none',
    fontSize: 14,
    color: '#8a8a8a',
    cursor: 'pointer',
    padding: 4,
  },
  appIcon: { width: 40, height: 40, borderRadius: 9, display: 'block', flex: 'none' },
  textcol: { flex: 1, minWidth: 0, textAlign: 'left' },
  title: { fontSize: 15, fontWeight: 600, lineHeight: 1.2 },
  subtitle: { fontSize: 12, color: '#b08a1e', marginTop: 2 },
  open: {
    flex: 'none',
    fontFamily: 'inherit',
    fontSize: 15,
    background: '#b08c36',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    cursor: 'pointer',
  },
};
