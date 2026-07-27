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

export const storyClock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Record one spoken story: start / stop / listen back / throw it away. */
export function useStoryRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState(null); // { base64, mime, seconds, url }
  const [micError, setMicError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const tickRef = useRef(null);
  const startedRef = useRef(0);

  const cleanup = useCallback(() => {
    clearInterval(tickRef.current); tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

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
        const reader = new FileReader();
        reader.onloadend = () => {
          setTake({
            base64: String(reader.result || '').split(',')[1] || '',
            mime: (rec.mimeType || mime || 'audio/webm').split(';')[0],
            seconds: elapsed,
            url: URL.createObjectURL(blob),
          });
        };
        reader.readAsDataURL(blob);
        setRecording(false);
        cleanup();
      };
      recorderRef.current = rec;
      startedRef.current = Date.now();
      setSeconds(0);
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
  }, [cleanup, stop]);

  const reset = useCallback(() => {
    if (take?.url) URL.revokeObjectURL(take.url);
    setTake(null);
    setSeconds(0);
  }, [take]);

  return { recording, seconds, take, micError, start, stop, reset };
}

export default useStoryRecorder;
