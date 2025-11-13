import React, { useState, useRef } from 'react';
import ConstellationIcon from './ConstellationIcon';
import ConstellationTooltip from './ConstellationTooltip';
import { useMemoryConnections } from '../../hooks/useMemoryConnections';
import '../shared/Hashtag.css';

// Feature flag - set to false to disable constellation feature
const ENABLE_CONSTELLATION_FEATURE = true;

// Memory Card Component for Archive view
export default function ArchiveMemoryCard({ memory, onView, onHashtagClick, isSelected, onSelect, selectMode, isDragging, onStartDrag, onDragStart, onDragEnd, isSimplified, formatTitleForDisplay, userId }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef(null);
  const { hasConnections } = useMemoryConnections(userId);
  const handleClick = () => {
    if (selectMode) {
      onSelect(memory.id);
    } else {
      onView(memory);
    }
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

  // Format title based on simplified view
  const displayTitle = formatTitleForDisplay ? formatTitleForDisplay(memory.title) : (memory.title || 'Untitled');

  return (
    <div
      className={`memory-item ${isSelected ? 'selected' : ''} ${isDragging && isSelected ? 'dragging' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      draggable={selectMode && isSelected}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ cursor: selectMode ? (isSelected ? 'grab' : 'pointer') : 'pointer' }}
    >
      {selectMode && (
        <div
          className={`memory-checkbox ${isSelected ? 'checked' : ''}`}
          onClick={handleCheckboxClick}
        />
      )}

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

      <div className="memory-header">
        <div
          className="memory-title"
          dangerouslySetInnerHTML={{ __html: displayTitle }}
        />
      </div>

      {!isSimplified && (
        <div className="memory-content">
          {memory.content}
        </div>
      )}

      {!isSimplified && (
        <div className="memory-footer">
          {memory.hashtags && memory.hashtags.length > 0 && (
            <div className="hashtag-container">
              {memory.hashtags.slice(0, 3).map((tag, idx) => (
                <span
                  key={idx}
                  className={`hashtag ${!selectMode ? 'clickable' : ''}`}
                  onClick={(e) => {
                    if (!selectMode) {
                      e.stopPropagation();
                      onHashtagClick(tag);
                    }
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
