// DreamCard — presentational card for a single dream entry.
// Shared by the live feed (GroupDreamJournal) and the no-auth preview
// (GroupDreamJournalPreview) so the card's look has a single source of truth.

const DreamCard = ({ dream }) => {
  if (!dream) return null;
  const { authorName, title, content } = dream;
  const symbols = dream.dream?.symbols || [];
  const emotions = dream.dream?.emotions || [];
  const lucid = dream.dream?.lucid;

  return (
    <article className="gdj-card">
      <div className="gdj-card-head">
        <span className="gdj-author">{authorName || 'Anonymous'}</span>
        {lucid && <span className="gdj-badge">lucid</span>}
      </div>
      {title && <h3 className="gdj-card-title">{title}</h3>}
      <p className="gdj-card-body">{content}</p>
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
    </article>
  );
};

export default DreamCard;
