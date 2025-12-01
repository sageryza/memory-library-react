import React from 'react';
import MemoryCard from '../shared/MemoryCard';
import { filterVisibleHashtags } from '../../utils/inlineParsingUtils';

export default function PlaygroundMemoryCard({
  memory,
  onMouseDown,
  onContextMenu,
  isDragging
}) {
  // Filter out hidden hashtags for display
  const displayMemory = {
    ...memory,
    hashtags: filterVisibleHashtags(memory.hashtags || [])
  };

  return (
    <div
      className={`playground-memory-card ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: `${memory.position.x}px`,
        top: `${memory.position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={(e) => onMouseDown(e, memory)}
      onContextMenu={(e) => onContextMenu(e, memory)}
    >
      <MemoryCard memory={displayMemory} />
    </div>
  );
}
