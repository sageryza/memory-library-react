import LibraryIcon from './LibraryIcon';
import { LockIcon, UnlockIcon } from './LockIcon';
import './Hashtag.css';
import './LibraryCardContent.css';

/**
 * Renders count as small gray squares
 * Shows up to 10 squares, grouped by 5 with extra spacing
 */
function MemorySquares({ count }) {
  if (count === 0) return null;

  const maxSquares = 10;
  const showNumber = count > maxSquares;
  const squaresToShow = showNumber ? maxSquares : count;

  // Group squares by 5
  const squares = [];
  for (let i = 0; i < squaresToShow; i++) {
    // Add group spacer after every 5th square (but not at start)
    if (i > 0 && i % 5 === 0) {
      squares.push(<span key={`spacer-${i}`} className="memory-square-spacer" />);
    }
    squares.push(<span key={i} className="memory-square">■</span>);
  }

  return (
    <span className="memory-squares">
      {squares}
      {showNumber && <span className="memory-count-overflow">+{count - maxSquares}</span>}
    </span>
  );
}

/**
 * Shared library card content component
 * Used by both LibraryCard (Libraries page) and LibrarySidebar
 *
 * @param {object} library - Library data
 * @param {number} memoryCount - Number of memories in library
 * @param {boolean} compact - Use smaller sizing for sidebar
 * @param {function} onLockClick - Handler for lock icon click (optional)
 * @param {boolean} showLockButton - Show clickable lock button vs static icon
 * @param {boolean} hideUnlockIcon - Hide the unlock icon when library is unlocked
 */
export default function LibraryCardContent({
  library,
  memoryCount,
  compact = false,
  onLockClick,
  showLockButton = false,
  hideUnlockIcon = false
}) {
  const isLocked = library.isLocked;

  // Icon sizes based on compact mode - slightly larger
  const iconSize = compact ? 16 : 20;
  const lockSize = compact ? 12 : 14;

  const handleLockClick = (e) => {
    e.stopPropagation();
    onLockClick?.(library.id, !isLocked);
  };

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

    return <>{elements}</>;
  };

  return (
    <>
      {/* Header with icon, name, lock */}
      <div className="library-card-header">
        <div className="library-card-header-top">
          <LibraryIcon size={iconSize} color={isLocked ? "#999" : "#2F4F4F"} />
          <span className="library-card-title">{library.name}</span>
          {showLockButton ? (
            <button
              className="library-lock-btn"
              onClick={handleLockClick}
              title={isLocked ? "Click to unlock" : "Click to lock"}
            >
              {isLocked ? (
                <LockIcon size={lockSize} color="#999" className="library-lock-icon" />
              ) : (
                <UnlockIcon size={lockSize} color="#999" className="library-lock-icon" />
              )}
            </button>
          ) : (
            isLocked ? (
              <LockIcon size={lockSize} color="#999" className="library-lock-icon" />
            ) : (
              !hideUnlockIcon && <UnlockIcon size={lockSize} color="#999" className="library-lock-icon" />
            )
          )}
        </div>
        <div className="library-card-divider"></div>
      </div>

      {/* Description */}
      {library.description && (
        <p className="library-card-description">{library.description}</p>
      )}

      {/* Memory count with squares - always render for consistent spacing */}
      <div className="library-memory-count">
        <MemorySquares count={memoryCount} />
      </div>

      {/* Search terms at bottom - always render container for consistent spacing */}
      <div className="library-search-terms">
        {renderSearchTerms()}
      </div>
    </>
  );
}
