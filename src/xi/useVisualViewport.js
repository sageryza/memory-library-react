import { useEffect, useState } from 'react';

// Tracks the visual viewport (the area NOT covered by the on-screen keyboard).
// Returns its top offset + height in layout pixels, and whether the keyboard is
// open. Anchoring a fixed layer to { top, height } pins content to the real
// keyboard edge without the iOS innerHeight-vs-toolbar guesswork that left a gap.
// iOS Safari ignores the `interactive-widget` viewport flag, so this JS is what
// actually keeps the composer above the keyboard there.
export default function useVisualViewport() {
  const [vp, setVp] = useState(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    keyboardOpen: false,
  }));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const keyboardOpen = (window.innerHeight - vv.height - vv.offsetTop) > 120;
      setVp({ top: vv.offsetTop, height: vv.height, keyboardOpen });
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return vp;
}
