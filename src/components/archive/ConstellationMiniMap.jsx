import React, { useMemo } from 'react';

/**
 * ConstellationMiniMap - Mini SVG visualization showing connections between memories
 * Displays stars (memories) and dashed lines (connections) in a scaled-down view
 */
export default function ConstellationMiniMap({ boardData, currentMemoryId, onClick }) {
  // Calculate memory positions and connections
  const { memoryPositions, scale, minX, minY } = useMemo(() => {
    // Find all memories that are part of the constellation network
    const connectedMemoryIds = new Set();
    boardData.connections.forEach(conn => {
      connectedMemoryIds.add(String(conn.from));
      connectedMemoryIds.add(String(conn.to));
    });

    // Get positions of connected memories only
    const positions = [];
    if (boardData.memories && boardData.memories.length > 0) {
      boardData.memories.forEach(mem => {
        if (connectedMemoryIds.has(String(mem.id)) && mem.x !== undefined && mem.y !== undefined) {
          positions.push({
            id: mem.id,
            x: mem.x || 0,
            y: mem.y || 0
          });
        }
      });
    }

    if (positions.length === 0) {
      return { memoryPositions: [], scale: 1, minX: 0, minY: 0 };
    }

    // Calculate bounding box and scale
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    const padding = 10;
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const scale = Math.min((100 - 2 * padding) / width, (100 - 2 * padding) / height);

    return { memoryPositions: positions, scale, minX, minY };
  }, [boardData]);

  if (memoryPositions.length === 0) {
    return (
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        className="constellation-minimap"
      >
        <text x="50" y="50" textAnchor="middle" fontSize="10" fill="#999">No data</text>
      </svg>
    );
  }

  const padding = 10;

  return (
    <div className="constellation-map-container" onClick={onClick}>
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        className="constellation-minimap"
      >
        {/* Define glow filter */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Draw connections (shortened dashed lines) */}
        {boardData.connections.map((conn, index) => {
          const fromPos = memoryPositions.find(p => p.id === conn.from);
          const toPos = memoryPositions.find(p => p.id === conn.to);

          if (!fromPos || !toPos) return null;

          const x1 = padding + (fromPos.x - minX) * scale;
          const y1 = padding + (fromPos.y - minY) * scale;
          const x2 = padding + (toPos.x - minX) * scale;
          const y2 = padding + (toPos.y - minY) * scale;

          // Calculate shortened line (1/3 of the distance from each star)
          const dx = x2 - x1;
          const dy = y2 - y1;
          const shortenedX1 = x1 + dx * 0.33;
          const shortenedY1 = y1 + dy * 0.33;
          const shortenedX2 = x1 + dx * 0.67;
          const shortenedY2 = y1 + dy * 0.67;

          return (
            <line
              key={`connection-${index}`}
              x1={shortenedX1}
              y1={shortenedY1}
              x2={shortenedX2}
              y2={shortenedY2}
              stroke="#050505"
              strokeWidth="1.5"
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Draw stars (memories) */}
        {memoryPositions.map(pos => {
          const x = padding + (pos.x - minX) * scale;
          const y = padding + (pos.y - minY) * scale;
          const isCurrentMemory = String(pos.id) === String(currentMemoryId);

          // Simpler star path matching React constellation mode
          const starPath = 'M 0,-8 L 2,-3 L 8,-3 L 3,1 L 5,8 L 0,3 L -5,8 L -3,1 L -8,-3 L -2,-3 Z';

          return (
            <g key={`star-${pos.id}`} transform={`translate(${x}, ${y})`}>
              {/* Glow circle for current memory */}
              {isCurrentMemory && (
                <circle
                  cx="0"
                  cy="0"
                  r="15"
                  fill="#FFD700"
                  opacity="0.2"
                  filter="url(#glow)"
                />
              )}

              {/* Star */}
              <path
                d={starPath}
                stroke="#050505"
                strokeWidth="0.5"
                fill={isCurrentMemory ? '#FFD700' : '#F5EBC2'}
                filter={isCurrentMemory ? 'url(#glow)' : undefined}
                className={isCurrentMemory ? 'current-memory-star' : ''}
              />
            </g>
          );
        })}
      </svg>

      {/* Board name label */}
      <div className="constellation-map-label">
        {boardData.boardName}
      </div>
    </div>
  );
}
