import React from 'react';

// A single illustrated XI card. `card` is a normalized deck card
// ({ id, cap, img, kind }) or a resolved ref. Events read as first-person
// actions; twists as universal modifiers.
export default function XiCard({ card, selected, locked, dimmed, onClick, size = 'md' }) {
  if (!card) return null;
  const classes = [
    'xi-card',
    `xi-card-${card.kind || 'event'}`,
    `xi-card-${size}`,
    selected ? 'is-selected' : '',
    locked ? 'is-locked' : '',
    dimmed ? 'is-dimmed' : '',
    onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick}>
      {card.img ? (
        <img className="xi-card-art" src={card.img} alt="" draggable={false} />
      ) : (
        <div className="xi-card-art xi-card-art-placeholder" />
      )}
      <span className="xi-card-cap">{card.cap}</span>
    </button>
  );
}
