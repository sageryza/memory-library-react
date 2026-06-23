// IllustrateTest — a bare-bones page to test image generation in isolation.
// One prompt box, one button, the resulting image. No dream journal, no groups,
// no scrolling concerns. Route: /illustrate-test.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import useAuth from '../hooks/useAuth';
import { functions } from '../firebase';

const generateTestImage = httpsCallable(functions, 'generateTestImage');

export default function IllustrateTest() {
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState('a small fox asleep under a crescent moon, soft and dreamlike');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    setUrl('');
    setBusy(true);
    try {
      const res = await generateTestImage({ prompt });
      setUrl(res.data.url);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <div style={S.wrap}>Loading…</div>;
  if (!user) {
    return (
      <div style={S.wrap}>
        <p>Please sign in first.</p>
        <Link to="/login" style={S.btn}>sign in</Link>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>Image generation test</h1>
      <p style={S.sub}>
        Book Illustrations style · Replicate. Type anything and generate — no
        dream journal involved.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        style={S.textarea}
        placeholder="Describe an image…"
      />

      <button onClick={run} disabled={busy || !prompt.trim()} style={S.btn}>
        {busy ? 'generating… (10–30s)' : 'generate image'}
      </button>

      {error && <p style={S.error}>⚠️ {error}</p>}
      {url && <img src={url} alt="generated result" style={S.img} />}
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 520,
    margin: '0 auto',
    padding: '40px 20px 80px',
    fontFamily: 'system-ui, sans-serif',
    color: '#222',
  },
  h1: { fontSize: 22, margin: '0 0 4px' },
  sub: { color: '#666', fontSize: 14, margin: '0 0 18px', lineHeight: 1.5 },
  textarea: {
    width: '100%',
    padding: 12,
    fontSize: 16,
    border: '1px solid #ccc',
    borderRadius: 6,
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  btn: {
    display: 'inline-block',
    marginTop: 12,
    padding: '12px 22px',
    fontSize: 16,
    border: 'none',
    borderRadius: 6,
    background: '#8a5a6b',
    color: '#fff',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  error: { color: '#b00020', marginTop: 16, whiteSpace: 'pre-wrap', lineHeight: 1.5 },
  img: { width: '100%', marginTop: 20, borderRadius: 8, display: 'block' },
};
