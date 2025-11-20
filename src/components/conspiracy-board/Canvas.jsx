import { useDraggable, useDroppable } from '@dnd-kit/core'
import MemoryCard from '../shared/MemoryCard'
import PublicMemoryCard from '../public/PublicMemoryCard'
import InlineMemoryEditor from './InlineMemoryEditor'
import { calculateOpacityLevels } from '../../utils/opacityCalculations'
import { setHasId } from '../../utils/idUtils'
import './Canvas.css'
import './ConstellationMode.css'

function DroppedMemoryCard({ memory, isSelected, onPinClick, isStackedView, onContextMenu, onDoubleClick, onClick, opacity, isConstellationSelected, formatTitleForDisplay, isInlineEditing, onInlineUpdate, onInlineBlur, onInlineEscape, isPublicBoard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `canvas-${memory.id}`,
    data: { ...memory, isOnCanvas: true },
    disabled: isInlineEditing, // Disable dragging while inline editing
  })

  // When in stacked view, adjust x position so pin stays in same place
  // Normal card width: 250px, Stacked card width: 120px, Difference: 130px
  const adjustedX = isStackedView ? memory.x + 130 : memory.x

  const style = {
    position: 'absolute',
    left: adjustedX,
    top: memory.y,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    cursor: isInlineEditing ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    zIndex: isDragging ? 1000 : 'auto',
    opacity: isDragging ? 0 : opacity, // Hide original card when dragging (DragOverlay shows instead)
    transition: isDragging ? 'none' : undefined, // Only remove transition during drag
  }

  const handlePinClick = (e) => {
    e.stopPropagation()
    onPinClick(memory.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!isInlineEditing && listeners)}
      {...(!isInlineEditing && attributes)}
      className={`dropped-memory ${isDragging ? 'dragging' : ''} ${isStackedView ? 'stacked-view' : ''}`}
      data-memory-id={memory.id}
      onContextMenu={(e) => {
        e.stopPropagation()
        onContextMenu(e, 'memory', memory)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick(memory.id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e, memory)
      }}
    >
      {isInlineEditing ? (
        <InlineMemoryEditor
          memory={memory}
          onUpdate={(newTitle) => onInlineUpdate(memory.id, newTitle)}
          onBlur={(finalTitle) => onInlineBlur(memory.id, finalTitle)}
          onEscape={() => onInlineEscape(memory.id)}
          isStackedView={isStackedView}
        />
      ) : (
        isPublicBoard ? (
          <PublicMemoryCard memory={memory} isStackedView={isStackedView} formatTitleForDisplay={formatTitleForDisplay} />
        ) : (
          <MemoryCard memory={memory} isStackedView={isStackedView} formatTitleForDisplay={formatTitleForDisplay} />
        )
      )}
      {isConstellationSelected ? (
        <div
          className="memory-pin constellation-star"
          onClick={handlePinClick}
          title="Click to connect"
        >
          <div style={{ position: 'relative', width: '60px', height: '60px' }}>
            <svg width="60" height="60" viewBox="-4 -4 59 56" className="constellation-star-svg">
              {/* Outline path - drawn first (underneath) */}
              <path
                d="M25.5 0l6.545 19.459L51 19.754l-15.727 11.691L41.09 48 25.5 36.309 9.91 48l5.818-16.555L0 19.754l18.955-.295z"
                fill="none"
                stroke="#808080"
                strokeWidth="8"
                strokeLinejoin="round"
              />
              {/* Fill path - drawn second (on top) */}
              <path
                d="M25.5 0l6.545 19.459L51 19.754l-15.727 11.691L41.09 48 25.5 36.309 9.91 48l5.818-16.555L0 19.754l18.955-.295z"
                fill="#FFD700"
                stroke="none"
                className="star-fill"
              />
            </svg>
            <div className="star-dazzle"></div>
          </div>
        </div>
      ) : (
        <div
          className={`memory-pin ${isSelected ? 'selected' : ''}`}
          onClick={handlePinClick}
          title="Click to connect"
        >
          <div className="memory-pin-circle" />
          <div className="memory-pin-tail" />
        </div>
      )}
    </div>
  )
}

export default function Canvas({ droppedMemories, selectedPin, onPinClick, isStackedView, onContextMenu, onDoubleClick, onClick, connections, showOpacityFading, constellationSelectedNodes, formatTitleForDisplay, inlineEditingMemoryId, onInlineMemoryUpdate, onInlineMemoryBlur, onInlineMemoryEscape, isPublicBoard }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'canvas',
  })

  // Calculate opacity levels using the complex algorithm
  let opacityMap = new Map()
  if (showOpacityFading) {
    opacityMap = calculateOpacityLevels(connections)
  }

  // Get opacity for a memory
  const getMemoryOpacity = (memoryId) => {
    if (!showOpacityFading) {
      return 1.0 // Full opacity when fading disabled
    }

    // Check if memory has any connections
    const hasConnections = connections.some(conn =>
      String(conn.from) === String(memoryId) || String(conn.to) === String(memoryId)
    )

    // Unconnected memories stay at full opacity
    if (!hasConnections) {
      return 1.0
    }

    // Connected memories use calculated opacity
    return opacityMap.get(String(memoryId)) || 1.0
  }

  return (
    <div
      ref={setNodeRef}
      className={`canvas ${isOver ? 'drag-over' : ''}`}
    >
      {droppedMemories.map(memory => (
        <DroppedMemoryCard
          key={memory.id}
          memory={memory}
          isSelected={selectedPin === memory.id}
          onPinClick={onPinClick}
          isStackedView={isStackedView}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onClick={onClick}
          opacity={getMemoryOpacity(memory.id)}
          isConstellationSelected={constellationSelectedNodes && setHasId(constellationSelectedNodes, memory.id)}
          formatTitleForDisplay={formatTitleForDisplay}
          isInlineEditing={inlineEditingMemoryId === memory.id}
          onInlineUpdate={onInlineMemoryUpdate}
          onInlineBlur={onInlineMemoryBlur}
          onInlineEscape={onInlineMemoryEscape}
          isPublicBoard={isPublicBoard}
        />
      ))}
    </div>
  )
}