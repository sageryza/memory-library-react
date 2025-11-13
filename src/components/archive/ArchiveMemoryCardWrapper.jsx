import React, { useState, useRef } from 'react';
import MemoryCard from '../shared/MemoryCard';
import ConstellationIcon from './ConstellationIcon';
import ConstellationTooltip from './ConstellationTooltip';
import { useMemoryConnections } from '../../hooks/useMemoryConnections';

// Feature flag - set to false to disable constellation feature
const ENABLE_CONSTELLATION_FEATURE = true;

/**
 * ArchiveMemoryCard Wrapper
 * Adds Archive-specific features to the base MemoryCard:
 * - Select mode with checkbox
 * - Constellation feature (icon & tooltip)
 * - Dragging to libraries
 * - Hashtag click handlers
 * - Selected state styling
 */
export default function ArchiveMemoryCardWrapper({
  memory,
  onView,
  onHashtagClick,
  isSelected,
  onSelect,
  selectMode,
  isDragging,
  onStartDrag,
  onDragStart,
  onDragEnd,
  isSimplified,
  formatTitleForDisplay,
  userId
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef(null);
  const { hasConnections } = useMemoryConnections(userId);

  const handleClick = () => {
    if (selectMode) {
      onSelect(memory.id);
    }
    // Single-click does nothing when not in select mode (for now)
    // TODO: Add single-click behavior here
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onView(memory);
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(memory.id);
  };

  const handleMouseDown = (e) => {
    if (selectMode && isSelected) {
      e.preventDefault();
      if (onStartDrag) {
        onStartDrag();
      }
    }
  };

  const handleDragStart = (e) => {
    if (onDragStart) {
      onDragStart(memory.id);
    }
  };

  const handleDragEnd = (e) => {
    if (onDragEnd) {
      onDragEnd();
    }
  };

  const handleConstellationClick = (e) => {
    e.stopPropagation();
    setShowTooltip(!showTooltip);
  };

  const handleHashtagClick = (tag) => {
    if (!selectMode && onHashtagClick) {
      onHashtagClick(tag);
    }
  };

  return (
    <div
      className={`archive-memory-wrapper ${isSelected ? 'selected' : ''} ${isDragging && isSelected ? 'dragging' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      draggable={selectMode && isSelected}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ cursor: selectMode ? (isSelected ? 'grab' : 'pointer') : 'pointer' }}
    >
      {/* Select Mode Checkbox */}
      {selectMode && (
        <div
          className={`memory-checkbox ${isSelected ? 'checked' : ''}`}
          onClick={handleCheckboxClick}
        />
      )}

      {/* Constellation Feature */}
      {ENABLE_CONSTELLATION_FEATURE && hasConnections(memory.id) && (
        <div className="constellation-icon-wrapper">
          <ConstellationIcon
            ref={iconRef}
            onClick={handleConstellationClick}
          />
        </div>
      )}

      {ENABLE_CONSTELLATION_FEATURE && showTooltip && (
        <ConstellationTooltip
          memoryId={memory.id}
          anchorElement={iconRef.current}
          onClose={() => setShowTooltip(false)}
          userId={userId}
        />
      )}

      {/* Base MemoryCard (Presentation) - handles all display */}
      <MemoryCard
        memory={memory}
        isStackedView={isSimplified}
        formatTitleForDisplay={formatTitleForDisplay}
        onHashtagClick={selectMode ? undefined : handleHashtagClick}
      />
    </div>
  );
}
