import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import SidebarContainer from '../shared/Sidebar';
import LibraryCardContent from '../shared/LibraryCardContent';

export function LibraryCard({ library, memoryCount, onClick, isActive }) {
  // Use @dnd-kit droppable hook for each library card
  const {
    isOver,
    setNodeRef,
  } = useDroppable({
    id: `library-${library.id}`,
    data: { libraryId: library.id }
  });

  const getLibraryColor = () => {
    if (library.id === 'core-memories') return '#b1872f';
    if (library.id === 'coincidences') return '#9932CC';
    return '#E0E0E0';
  };

  return (
    <div
      ref={setNodeRef}
      className={`sidebar-library-card ${isOver ? 'drag-over' : ''} ${isActive ? 'active' : ''} ${library.isLocked ? 'locked' : ''} ${library.id === 'core-memories' ? 'core-memories' : ''} ${library.id === 'coincidences' ? 'coincidences' : ''}`}
      style={{ borderColor: getLibraryColor() }}
      onClick={library.isLocked ? undefined : onClick}
    >
      <LibraryCardContent
        library={library}
        memoryCount={memoryCount}
        compact={true}
        showLockButton={false}
        hideUnlockIcon={true}
      />
    </div>
  );
}

export default function LibrarySidebar({
  libraries,
  getLibraryMemoryCount,
  collapsed,
  onToggleCollapse
}) {
  return (
    <SidebarContainer isOpen={!collapsed} onToggle={onToggleCollapse}>
      <div className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-libraries-grid">
            {libraries.length === 0 ? (
              <div className="empty-state">
                <p>No libraries yet</p>
              </div>
            ) : (
              libraries.map(library => (
                <LibraryCard
                  key={library.id}
                  library={library}
                  memoryCount={getLibraryMemoryCount(library.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </SidebarContainer>
  );
}
