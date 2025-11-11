import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function LibraryCard({ library, memoryCount, onDrop, onDragOver, onDragLeave, isDragOver }) {
  const getLibraryColor = () => {
    if (library.id === 'core-memories') return '#b1872f';
    if (library.id === 'coincidences') return '#9932CC';
    return '#E0E0E0';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    onDragOver(library.id);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    onDrop(library.id);
  };

  const handleDragLeave = () => {
    onDragLeave();
  };

  return (
    <div
      className={`sidebar-library-card ${isDragOver ? 'drag-over' : ''} ${library.id === 'core-memories' ? 'core-memories' : ''} ${library.id === 'coincidences' ? 'coincidences' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      style={{ borderColor: getLibraryColor() }}
    >
      <h4 className="sidebar-library-name">{library.name}</h4>
      {library.description && (
        <p className="sidebar-library-description">{library.description}</p>
      )}
      <div className="sidebar-library-stats">
        <span className="sidebar-memory-count">{memoryCount} memories</span>
        {library.searchLogic && (
          <span className="search-based-indicator">Search-based</span>
        )}
        {library.isLocked && (
          <span className="search-based-indicator">Locked</span>
        )}
      </div>
    </div>
  );
}

export default function LibrarySidebar({
  libraries,
  getLibraryMemoryCount,
  onMemoryDropToLibrary,
  collapsed,
  onToggleCollapse
}) {
  const [dragOverLibraryId, setDragOverLibraryId] = useState(null);

  const handleDragOver = (libraryId) => {
    setDragOverLibraryId(libraryId);
  };

  const handleDrop = (libraryId) => {
    if (onMemoryDropToLibrary) {
      onMemoryDropToLibrary(libraryId);
    }
    setDragOverLibraryId(null);
  };

  const handleDragLeave = () => {
    setDragOverLibraryId(null);
  };

  return (
    <div className={`sidebar-wrapper ${collapsed ? 'closed' : ''}`}>
      {/* Sidebar Toggle Tab */}
      <button
        className="sidebar-toggle-tab"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Libraries</h2>
        </div>

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
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  isDragOver={dragOverLibraryId === library.id}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
