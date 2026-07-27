import { useCallback, useEffect, useRef, useState } from 'react';

// XI is a storytelling game, so a turn can be TOLD rather than typed: record
// the memory, and the other players press play and hear it. This is the web
// half of that — the same recording/playing the iOS app does.

// Stories are a turn in a game, not a podcast.
const MAX_SECONDS = 300;

// Safari (iOS) only records audio/mp4; Chrome/Firefox do webm. Both are
// formats the transcription step accepts.
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export const canRecord = () => typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && typeof MediaRecorder !== 'undefined';

// The browser's own speech recogniser — the same one behind the mic key on a
// phone keyboard. Free, no key, and it streams words back as you talk, so the
// story captions itself and nothing has to pay to transcribe it afterwards.
// Chrome/Edge and Safari have it; Firefox doesn't, and there a told story
// simply arrives without a text line (the recording still plays).
const SpeechRec = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const canCaption = () => !!SpeechRec;

export const storyClock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Record one spoken story: start / stop / listen back / throw it away. */
export function useStoryRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState(null); // { base64, mime, seconds, url, transcript }
  const [micError, setMicError] = useState('');
  /// The words as they're spoken, from the browser's own recogniser.
  const [liveText, setLiveText] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const tickRef = useRef(null);
  const startedRef = useRef(0);
  // Captions: finished phrases, the phrase in progress, and the recogniser
  // itself (which stops on its own and has to be nudged back up).
  const srRef = useRef(null);
  const committedRef = useRef('');
  const wantCaptionsRef = useRef(false);

  const stopCaptions = useCallback(() => {
    wantCaptionsRef.current = false;
    const sr = srRef.current;
    srRef.current = null;
    if (sr) { sr.onend = null; sr.onresult = null; sr.onerror = null; try { sr.stop(); } catch { /* already stopped */ } }
  }, []);

  const cleanup = useCallback(() => {
    clearInterval(tickRef.current); tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    stopCaptions();
  }, [stopCaptions]);

  // Free live captioning, running alongside the recording. The recogniser ends
  // itself on a pause (and on a time limit), so while we're still recording we
  // bank what it heard and start it again.
  const startCaptions = useCallback(() => {
    if (!SpeechRec) return;
    committedRef.current = '';
    wantCaptionsRef.current = true;
    const open = () => {
      if (!wantCaptionsRef.current) return;
      const sr = new SpeechRec();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = navigator.language || 'en-US';
      sr.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const chunk = e.results[i][0]?.transcript || '';
          if (e.results[i].isFinal) {
            committedRef.current = `${committedRef.current} ${chunk}`.trim();
          } else {
            interim += chunk;
          }
        }
        setLiveText(`${committedRef.current} ${interim}`.trim());
      };
      // A recogniser that stops on silence isn't an error — just reopen it.
      sr.onend = () => { if (wantCaptionsRef.current) open(); };
      sr.onerror = (e) => { if (e?.error === 'not-allowed') stopCaptions(); };
      srRef.current = sr;
      try { sr.start(); } catch { /* one is already running */ }
    };
    open();
  }, [stopCaptions]);

  useEffect(() => () => {
    cleanup();
    if (take?.url) URL.revokeObjectURL(take.url);
  }, [cleanup, take]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setMicError('');
    if (!canRecord()) { setMicError('This browser can’t record audio — you can type it instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        const elapsed = Math.min(MAX_SECONDS, (Date.now() - startedRef.current) / 1000);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        const heard = `${committedRef.current}`.trim();
        const reader = new FileReader();
        reader.onloadend = () => {
          setTake({
            base64: String(reader.result || '').split(',')[1] || '',
            mime: (rec.mimeType || mime || 'audio/webm').split(';')[0],
            seconds: elapsed,
            url: URL.createObjectURL(blob),
            transcript: heard,
          });
        };
        reader.readAsDataURL(blob);
        setRecording(false);
        cleanup();
      };
      recorderRef.current = rec;
      startedRef.current = Date.now();
      setSeconds(0);
      setLiveText('');
      startCaptions();
      rec.start();
      setRecording(true);
      tickRef.current = setInterval(() => {
        const el = (Date.now() - startedRef.current) / 1000;
        setSeconds(el);
        if (el >= MAX_SECONDS) stop();
      }, 200);
    } catch {
      setMicError('Microphone access is off — allow it in your browser to tell the story out loud.');
      cleanup();
    }
  }, [cleanup, stop, startCaptions]);

  const reset = useCallback(() => {
    if (take?.url) URL.revokeObjectURL(take.url);
    setTake(null);
    setSeconds(0);
    setLiveText('');
    committedRef.current = '';
  }, [take]);

  return { recording, seconds, take, micError, liveText, start, stop, reset };
}

export default useStoryRecorder;
