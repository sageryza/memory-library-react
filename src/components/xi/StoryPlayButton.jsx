import { useEffect, useRef, useState } from 'react';
import { storyClock } from '../../xi/storyVoice';

// The ▶ on a told story — see src/xi/storyVoice.js for the recorder half.

/**
 * A ▶ that plays one story at a time — starting a second one stops the first.
 * `id` identifies the story (or the composer's own take).
 */
export function StoryPlayButton({ id, url, seconds, label = 'listen', className = 'xiv-play' }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  // Only one story at a time, across every button on the page.
  useEffect(() => {
    const onOther = (e) => {
      if (e.detail !== id) { audioRef.current?.pause(); setPlaying(false); }
    };
    window.addEventListener('xi-story-play', onOther);
    return () => window.removeEventListener('xi-story-play', onOther);
  }, [id]);

  const toggle = () => {
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    window.dispatchEvent(new CustomEvent('xi-story-play', { detail: id }));
    if (!audioRef.current) {
      const a = new Audio(url);
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      audioRef.current = a;
    }
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <button type="button" className={className} onClick={toggle}
      aria-label={playing ? 'Stop' : 'Play the story'}>
      <span className="xiv-play-ico">{playing ? '■' : '▶'}</span>
      {seconds > 0 ? storyClock(seconds) : label}
    </button>
  );
}

export default StoryPlayButton;
