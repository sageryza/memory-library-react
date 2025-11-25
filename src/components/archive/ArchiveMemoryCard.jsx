import React, { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import ConstellationIcon from './ConstellationIcon';
import ConstellationTooltip from './ConstellationTooltip';
import { useMemoryConnections } from '../../hooks/useMemoryConnections';
import '../shared/Hashtag.css';

// Feature flag - set to false to disable constellation feature
const ENABLE_CONSTELLATION_FEATURE = true;

// Memory Card Component for Archive view
export default function ArchiveMemoryCard({ memory, onView, onHashtagClick, isSelected, onSelect, selectMode, isSimplified, formatTitleForDisplay, userId }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef(null);
  const { hasConnections } = useMemoryConnections(userId);

  // Use @dnd-kit draggable hook - only enable when in select mode and selected
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: memory.id,
    disabled: !selectMode || !isSelected,
    data: { memory }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: selectMode ? (isSelected ? 'grab' : 'pointer') : 'pointer'
  };

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

  const handleConstellationClick = (e) => {
    e.stopPropagation();
    setShowTooltip(!showTooltip);
  };

  // Format title based on simplified view
  const displayTitle = formatTitleForDisplay ? formatTitleForDisplay(memory.title) : (memory.title || 'Untitled');

  return (
    <div
      ref={setNodeRef}
      className={`memory-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={handleClick}
      style={style}
      {...(selectMode && isSelected ? listeners : {})}
      {...(selectMode && isSelected ? attributes : {})}
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
