import { useState } from 'react';
import { TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_URL } from '../../xi/appLinks';

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && 'ontouchend' in document);

/**
 * Floating "Open in the XI app" card for pages people land on from shared
 * links (Versus invites, shared boards). If the app is installed, the
 * universal link already opened it and this page is never seen — so this
 * banner's job is the OTHER case: explain, in two explicit steps, that you
 * install TestFlight first and the XI app second. Hidden until a public
 * TestFlight invite link exists (see src/xi/appLinks.js), and only shown
 * on iOS devices, where the steps make sense.
 */
export default function OpenInAppBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !TESTFLIGHT_INVITE_URL || !isIOS()) return null;

  return (
    <div style={styles.wrap}>
      <button style={styles.close} onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
      <div style={styles.title}>Open this in the XI app</div>
      <div style={styles.subtitle}>two steps</div>
      <div style={styles.row}>
        <a href={TESTFLIGHT_APP_URL} style={styles.step}>
          <TestFlightIcon />
          <span style={styles.stepLabel}>1. Get TestFlight<br /><small>free, from Apple</small></span>
        </a>
        <span style={styles.arrow}>→</span>
        <a href={TESTFLIGHT_INVITE_URL} style={styles.step}>
          <img src="/xi-app-icon.png" alt="XI" style={styles.appIcon} />
          <span style={styles.stepLabel}>2. Install XI<br /><small>inside TestFlight</small></span>
        </a>
      </div>
    </div>
  );
}

/** A simple TestFlight-style glyph: blue rounded square, white propeller. */
function TestFlightIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={styles.appIcon} aria-hidden="true">
      <rect width="44" height="44" rx="10" fill="#0070f5" />
      <g fill="#fff">
        <ellipse cx="22" cy="13" rx="4" ry="7" />
        <ellipse cx="13.5" cy="27" rx="4" ry="7" transform="rotate(120 13.5 27)" />
        <ellipse cx="30.5" cy="27" rx="4" ry="7" transform="rotate(-120 30.5 27)" />
        <circle cx="22" cy="22" r="3.4" />
      </g>
    </svg>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 1000,
    background: '#f5f0e6',
    border: '1px solid #c9a227',
    borderRadius: 6,
    padding: '12px 14px 14px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
    maxWidth: 430,
    margin: '0 auto',
    fontFamily: 'Georgia, serif',
    color: '#2b2b2b',
    textAlign: 'center',
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
  title: { fontSize: 16, fontWeight: 600 },
  subtitle: { fontSize: 12, color: '#b08a1e', marginTop: 2, letterSpacing: '0.08em' },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none',
    color: '#2b2b2b',
    background: '#fff',
    border: '1px solid #ddd2b8',
    borderRadius: 6,
    padding: '8px 10px',
  },
  stepLabel: { fontSize: 13, lineHeight: 1.25, textAlign: 'left' },
  arrow: { fontSize: 20, color: '#b08a1e' },
  appIcon: { width: 44, height: 44, borderRadius: 10, display: 'block' },
};
