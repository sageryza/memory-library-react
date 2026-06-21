import { useEffect } from 'react';

// iOS leaves a white gap when the keyboard opens under a fixed full-screen
// element. Shrink the element to the visual viewport so content scrolls cleanly
// above the keyboard instead. Pass a ref to the fixed container.
export default function useViewportFit(ref) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => { if (ref.current) ref.current.style.height = vv.height + 'px'; };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, [ref]);
}
