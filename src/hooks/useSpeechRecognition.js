// useSpeechRecognition — live voice-to-text via the browser's Web Speech API.
//
// Streams interim words as they're spoken (like a live dictation), and calls
// onFinal(text) when a phrase is finalized so the caller can append it.
//
// Support is uneven: solid on Chrome (desktop/Android), unreliable or absent on
// iOS Safari. `supported` lets the UI degrade gracefully (hide/disable the mic).
// Requires HTTPS (we deploy over HTTPS) and a user gesture to start.

import { useState, useRef, useCallback, useEffect } from 'react';

const getSpeechRecognition = () =>
  (typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
  null;

export const useSpeechRecognition = ({ onFinal, lang = 'en-US' } = {}) => {
  const [supported] = useState(() => !!getSpeechRecognition());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);

  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore — already stopped */
      }
    }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    // Re-create each start; some browsers don't cleanly restart an instance.
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event) => {
      let interimStr = '';
      let finalStr = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalStr += result[0].transcript;
        else interimStr += result[0].transcript;
      }
      if (finalStr && onFinalRef.current) onFinalRef.current(finalStr);
      setInterim(interimStr);
    };

    rec.onerror = (event) => {
      setError(event.error || 'speech-error');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setListening(false);
      }
    };

    rec.onend = () => {
      setInterim('');
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setError(null);
    } catch {
      /* ignore — start() throws if already running */
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Clean up on unmount.
  useEffect(
    () => () => {
      const rec = recRef.current;
      if (rec) {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  return { supported, listening, interim, error, start, stop, toggle };
};

export default useSpeechRecognition;
