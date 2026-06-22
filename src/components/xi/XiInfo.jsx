import { useState } from 'react';

// A small "ⓘ" button that opens a how-to-play panel. Pass the directions as
// children. Tap the circle to open, the backdrop or × to close.
export default function XiInfo({ title = 'How to play', children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="xiv-info" aria-label={title} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" strokeLinecap="round" />
          <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <div className="xiv-infobackdrop" onClick={() => setOpen(false)}>
          <div className="xiv-infomodal" onClick={(e) => e.stopPropagation()}>
            <div className="xiv-infohead">
              <span>{title}</span>
              <button className="xiv-infox" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="xiv-infobody">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
