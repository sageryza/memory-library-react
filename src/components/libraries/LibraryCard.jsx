import LibraryIcon from '../shared/LibraryIcon';

export default function LibraryCard({ library, memoryCount, onClick }) {
  const isLocked = library.isLocked;

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
