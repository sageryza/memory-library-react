// Applies the freshly-fetched shared deck extras (see src/xi/deckExtras.js)
// and reports a signature that changes when the applied set changes — mount it
// where the pools are consumed so late-arriving extras trigger a re-init.
import { useEffect, useState } from 'react';
import { deckExtrasSignature, refreshDeckExtras } from '../xi/decks';

export function useDeckExtras() {
  const [sig, setSig] = useState(deckExtrasSignature());
  useEffect(() => {
    let alive = true;
    refreshDeckExtras().then((s) => { if (alive) setSig(s); });
    return () => { alive = false; };
  }, []);
  return sig;
}

export default useDeckExtras;
