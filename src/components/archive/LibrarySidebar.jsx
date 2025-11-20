import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LibraryIcon from '../shared/LibraryIcon';
import '../shared/Hashtag.css';

export function LibraryCard({ library, memoryCount, onDrop, onDragOver, onDragLeave, isDragOver }) {
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
    <div
      className={`sidebar-library-card ${isDragOver ? 'drag-over' : ''} ${library.id === 'core-memories' ? 'core-memories' : ''} ${library.id === 'coincidences' ? 'coincidences' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      style={{ borderColor: getLibraryColor() }}
    >
      <div className="sidebar-library-header">
        <div className="sidebar-library-header-top">
          <LibraryIcon size={20} color="currentColor" />
          <h4 className="sidebar-library-name">{library.name}</h4>
        </div>
        <div className="sidebar-library-divider"></div>
      </div>
      {library.description && (
        <p className="sidebar-library-description">{library.description}</p>
      )}
      {renderSearchTerms()}
      <div className="sidebar-library-stats">
        <span className="sidebar-memory-count">{memoryCount} memories</span>
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
