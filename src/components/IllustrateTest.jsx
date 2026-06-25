// IllustrateTest — a bare-bones page to test image generation in isolation.
// Two modes: a Replicate trained style (text → image), or gpt-image-1 reference
// (upload an image + prompt → transformed image). No dream journal, no groups.
// Route: /illustrate-test.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import useAuth from '../hooks/useAuth';
import { functions } from '../firebase';

const generateTestImage = httpsCallable(functions, 'generateTestImage');
const generateReferenceImage = httpsCallable(functions, 'generateReferenceImage');

// Downscale an uploaded image to <= maxPx on its longest side and return a PNG
// data URL — keeps the upload payload small and matches gpt-image-1's output.
function resizeToDataUrl(file, maxPx = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function IllustrateTest() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState('style'); // 'style' | 'reference'
  const [prompt, setPrompt] = useState('a small fox asleep under a crescent moon, soft and dreamlike');
  const [style, setStyle] = useState('vict');
  const [imageData, setImageData] = useState(''); // data URL of the reference
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setImageData(await resizeToDataUrl(f));
    } catch {
      setError('Could not read that image.');
    }
  };

  const run = async () => {
    setError('');
    setUrl('');
    setInfo(null);
    setBusy(true);
    try {
      let res;
      if (mode === 'reference') {
        const [meta, b64] = imageData.split(',');
        const mimeType = (meta.match(/data:(.*?);/) || [])[1] || 'image/png';
        res = await generateReferenceImage({ prompt, imageBase64: b64, mimeType });
      } else {
        res = await generateTestImage({ prompt, style });
      }
      setUrl(res.data.url);
      setInfo(res.data);
    } catch (e) {
      const code = e?.code ? String(e.code).replace('functions/', '') : '';
      setError([code, e?.message || String(e)].filter(Boolean).join(' — '));
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

  const canRun = !busy && prompt.trim() && (mode === 'style' || imageData);

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>Image generation test</h1>
      <p style={S.sub}>
        Compare a trained Replicate style (text only) against gpt-image-1 reference
        (upload an image to transform). No dream journal involved.
      </p>

      <div style={S.modes}>
        <label style={S.modeLabel}>
          <input type="radio" name="mode" value="style"
            checked={mode === 'style'} onChange={() => setMode('style')} />
          Style (Replicate)
        </label>
        <label style={S.modeLabel}>
          <input type="radio" name="mode" value="reference"
            checked={mode === 'reference'} onChange={() => setMode('reference')} />
          Reference (gpt-image-1)
        </label>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        style={S.textarea}
        placeholder={mode === 'reference'
          ? 'How should the uploaded image be transformed?'
          : 'Describe an image…'}
      />

      {mode === 'style' ? (
        <label style={S.label}>
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value)} style={S.select}>
            <option value="vict">Book Illustrations</option>
            <option value="wtr">Watercolor</option>
            <option value="tok">PWC Scans</option>
            <option value="pnt">Painterly</option>
          </select>
        </label>
      ) : (
        <div style={S.uploadRow}>
          <input type="file" accept="image/*" onChange={onFile} />
          {imageData && <img src={imageData} alt="reference" style={S.thumb} />}
        </div>
      )}

      <button onClick={run} disabled={!canRun} style={S.btn}>
        {busy ? 'generating… (10–30s)' : 'generate image'}
      </button>

      {error && <p style={S.error}>⚠️ {error}</p>}
      {url && <img src={url} alt="generated result" style={S.img} />}
      {info && (
        <div style={S.receipt}>
          <div><strong>model:</strong> {info.model}</div>
          {info.version && <div><strong>version:</strong> {info.version}</div>}
          {info.prompt && <div><strong>prompt sent:</strong> {info.prompt}</div>}
          {info.predictionUrl && (
            <div>
              <a href={info.predictionUrl} target="_blank" rel="noreferrer" style={S.link}>
                view this run on Replicate →
              </a>
            </div>
          )}
        </div>
      )}
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
  modes: { display: 'flex', gap: 18, marginBottom: 14, fontSize: 15 },
  modeLabel: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  label: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 14, color: '#444' },
  select: { padding: '8px 10px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6, flex: 1 },
  uploadRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 },
  thumb: { width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc' },
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
    marginTop: 14,
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
  receipt: {
    marginTop: 14,
    padding: 12,
    background: '#f5f3f4',
    borderRadius: 6,
    fontSize: 13,
    color: '#555',
    lineHeight: 1.6,
    wordBreak: 'break-all',
  },
  link: { color: '#8a5a6b', fontWeight: 600 },
};
