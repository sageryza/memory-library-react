import LibraryIcon from '../shared/LibraryIcon';
import '../shared/Hashtag.css';

export default function LibraryCard({ library, memoryCount, onClick }) {
  const isLocked = library.isLocked;

  // Render search terms with boolean operators
  const renderSearchTerms = () => {
    if (!library.searchLogic) return null;

    const { andTerms = [], orTerms = [], excludeTerms } = library.searchLogic;
    const hasAndTerms = andTerms.length > 0;
    const hasOrTerms = orTerms.length > 0;
    const hasExcludeTerms = excludeTerms && excludeTerms.trim();

    if (!hasAndTerms && !hasOrTerms && !hasExcludeTerms) return null;

    const elements = [];

    // AND terms group
    if (hasAndTerms) {
      const andGroup = [];
      if (hasOrTerms) andGroup.push(<span key="and-open" className="operator">(</span>);

      andTerms.forEach((term, i) => {
        andGroup.push(<span key={`and-${i}`} className="hashtag small">{term}</span>);
        if (i < andTerms.length - 1) {
          andGroup.push(<span key={`and-op-${i}`} className="operator">AND</span>);
        }
      });

      if (hasOrTerms) andGroup.push(<span key="and-close" className="operator">)</span>);
      elements.push(...andGroup);
    }

    // OR terms group
    if (hasOrTerms) {
      const orGroup = [];
      orGroup.push(<span key="or-open" className="operator">(</span>);

      orTerms.forEach((term, i) => {
        orGroup.push(<span key={`or-${i}`} className="hashtag small">{term}</span>);
        if (i < orTerms.length - 1) {
          orGroup.push(<span key={`or-op-${i}`} className="operator">OR</span>);
        }
      });

      orGroup.push(<span key="or-close" className="operator">)</span>);
      elements.push(...orGroup);
    }

    // Exclude terms
    if (hasExcludeTerms) {
      elements.push(<span key="not-op" className="operator">NOT</span>);
      elements.push(<span key="exclude" className="hashtag small exclude">{excludeTerms}</span>);
    }

    return <div className="library-search-terms">{elements}</div>;
  };

  return (
    <div className="library-card" onClick={onClick}>
      <div className="library-card-header">
        <div className="library-card-header-top">
          <LibraryIcon size={24} color="currentColor" />
          <h3 className="library-card-title">{library.name}</h3>
        </div>
        <div className="library-card-divider"></div>
      </div>

      {library.description && (
        <p className="library-card-description">{library.description}</p>
      )}

      {renderSearchTerms()}

      <div className="library-card-footer">
        <span className="library-memory-count">
          {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
        </span>
        <div className="library-badges">
          {isLocked && (
            <span className="library-badge locked">Locked</span>
          )}
        </div>
      </div>
    </div>
  );
}
