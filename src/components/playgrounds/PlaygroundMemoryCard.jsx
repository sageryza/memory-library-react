import React from 'react';
import { filterVisibleHashtags } from '../../utils/inlineParsingUtils';
import '../shared/Hashtag.css';

export default function PlaygroundMemoryCard({
  memory,
  onMouseDown,
  onContextMenu,
  isDragging
}) {
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
      {memory.title && (
        <div className="memory-header">
          <div className="memory-title">{memory.title}</div>
        </div>
      )}

      {memory.content && (
        <div className="memory-content">{memory.content}</div>
      )}

      {memory.hashtags && memory.hashtags.length > 0 && (
        <div className="memory-footer">
          <div className="hashtag-container small-gap">
            {filterVisibleHashtags(memory.hashtags).map((tag, idx) => (
              <span key={idx} className="hashtag small">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
