// XI is live on the App Store (July 2026) — "times i", app id 6784887831.
export const APP_STORE_URL = 'https://apps.apple.com/app/times-i/id6784887831';

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && 'ontouchend' in document);

// Open the app at an xi:// path ('versus/abc123?i=tok', 'share/abc', '' for
// home); if nothing grabs the link (app not installed — or still on 1.1,
// which predates the xi:// scheme), fall through to the App Store listing,
// where an installed app shows "Open" anyway. The document.hidden check
// keeps the fallback from firing when the app DID open — iOS hides the page
// the moment it switches apps.
export function openInApp(path = '') {
  window.location.href = 'xi://' + path;
  setTimeout(() => {
    if (!document.hidden) window.location.href = APP_STORE_URL;
  }, 1600);
}
