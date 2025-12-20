import React from 'react';
import MemoryCard from '../shared/MemoryCard';
import InlineMemoryEditor from '../conspiracy-board/InlineMemoryEditor';
import { filterVisibleHashtags } from '../../utils/inlineParsingUtils';

export default function PlaygroundMemoryCard({
  memory,
  onMouseDown,
  onContextMenu,
  isDragging,
  isInlineEditing,
  onInlineUpdate,
  onInlineBlur,
  onInlineEscape
}) {
  // Filter out hidden hashtags for display
  const displayMemory = {
    ...memory,
    hashtags: filterVisibleHashtags(memory.hashtags || [])
  };

  const handleClick = (e) => {
    // Stop propagation when inline editing to prevent canvas click
    if (isInlineEditing) {
      e.stopPropagation();
    }
  };

  // Safety check for position
  const position = memory.position || { x: 0, y: 0 };

  return (
    <div
      className={`playground-memory-card ${isDragging ? 'dragging' : ''} ${isInlineEditing ? 'inline-editing' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isInlineEditing ? 'text' : (isDragging ? 'grabbing' : 'grab')
      }}
      onMouseDown={isInlineEditing ? undefined : (e) => onMouseDown(e, memory)}
      onContextMenu={isInlineEditing ? undefined : (e) => onContextMenu(e, memory)}
      onClick={handleClick}
    >
      {isInlineEditing ? (
        <InlineMemoryEditor
          memory={displayMemory}
          onUpdate={(newTitle) => onInlineUpdate(memory.id, newTitle)}
          onBlur={(finalTitle) => onInlineBlur(memory.id, finalTitle)}
          onEscape={() => onInlineEscape(memory.id)}
        />
      ) : (
        <MemoryCard memory={displayMemory} />
      )}
    </div>
  );
}
