import LibraryCardContent from '../shared/LibraryCardContent';

export default function LibraryCard({ library, memoryCount, onContextMenu, onToggleLock }) {
  return (
    <div
      className={`library-card ${library.isLocked ? 'locked' : ''}`}
      onContextMenu={onContextMenu}
    >
      <LibraryCardContent
        library={library}
        memoryCount={memoryCount}
        compact={false}
        onLockClick={onToggleLock}
        showLockButton={true}
      />
    </div>
  );
}
