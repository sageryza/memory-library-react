import { useEffect, useState } from 'react';

// Returns the on-screen keyboard height in px (0 when closed), derived from the
// visual viewport. Use it to pin a fixed element just above the keyboard so it
// never gets scrolled out of view on iOS.
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(kb);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return inset;
}
