export default function LibraryCard({ library, memoryCount, onClick }) {
  const isSearchBased = !!library.searchLogic;
  const isLocked = library.isLocked;

  return (
    <div className="library-card" onClick={onClick}>
      <div className="library-card-header">
        <h3 className="library-card-title">{library.name}</h3>
      </div>

      {library.description && (
        <p className="library-card-description">{library.description}</p>
      )}

      <div className="library-card-footer">
        <span className="library-memory-count">
          {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
        </span>
        <div className="library-badges">
          {isSearchBased && (
            <span className="library-badge search-based">Search-based</span>
          )}
          {isLocked && (
            <span className="library-badge locked">Locked</span>
          )}
        </div>
      </div>
    </div>
  );
}
