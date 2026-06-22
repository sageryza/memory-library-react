// DreamCard — presentational card for a single dream entry.
// Shared by the live feed (GroupDreamJournal) and the no-auth preview
// (GroupDreamJournalPreview) so the card's look has a single source of truth.
//
// Illustration is optional: when the parent passes `onIllustrate`, the card
// shows a button to draw the dream (the live feed). The preview omits it, so
// no button appears there — but a previously-saved illustration still renders.

const DreamCard = ({ dream, onIllustrate, illustrating = false }) => {
  if (!dream) return null;
  const { authorName, title, content } = dream;
  const symbols = dream.dream?.symbols || [];
  const emotions = dream.dream?.emotions || [];
  const lucid = dream.dream?.lucid;
  const illustration = dream.illustration;

  return (
    <article className="gdj-card">
      <div className="gdj-card-head">
        <span className="gdj-author">{authorName || 'Anonymous'}</span>
        {lucid && <span className="gdj-badge">lucid</span>}
      </div>
      {title && <h3 className="gdj-card-title">{title}</h3>}
      <p className="gdj-card-body">{content}</p>

      {illustration?.url && (
        <figure className="gdj-illustration">
          <img
            src={illustration.url}
            alt={title ? `Illustration of “${title}”` : 'Dream illustration'}
            loading="lazy"
          />
        </figure>
      )}

      {symbols.length > 0 && (
        <div className="gdj-tags">
          {symbols.map((s) => (
            <span key={s} className="gdj-tag">
              {s}
            </span>
          ))}
        </div>
      )}
      {emotions.length > 0 && (
        <div className="gdj-tags gdj-tags-emotion">
          {emotions.map((em) => (
            <span key={em} className="gdj-tag gdj-tag-emotion">
              {em}
            </span>
          ))}
        </div>
      )}

      {onIllustrate && (
        <div className="gdj-card-actions">
          <button
            type="button"
            className="gdj-illustrate-btn"
            onClick={onIllustrate}
            disabled={illustrating}
          >
            {illustrating
              ? 'drawing…'
              : illustration?.url
                ? 'redraw'
                : '✦ illustrate'}
          </button>
        </div>
      )}
    </article>
  );
};

export default DreamCard;
