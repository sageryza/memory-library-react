import { useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import MemoryCard from '../shared/MemoryCard'
import PublicMemoryCard from '../public/PublicMemoryCard'
import InlineMemoryEditor from './InlineMemoryEditor'
import { calculateOpacityLevels } from '../../utils/opacityCalculations'
import { setHasId } from '../../utils/idUtils'
import './Canvas.css'
import './ConstellationMode.css'

const LONG_PRESS_DELAY = 500 // ms

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

  // Long-press for context menu on mobile
  const longPressTimerRef = useRef(null)
  const longPressTouchRef = useRef(null)

  const handleTouchStart = (e) => {
    if (isInlineEditing) return
    const touch = e.touches[0]
    longPressTouchRef.current = { x: touch.clientX, y: touch.clientY }

    longPressTimerRef.current = setTimeout(() => {
      if (longPressTouchRef.current) {
        // Trigger context menu
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: longPressTouchRef.current.x,
          clientY: longPressTouchRef.current.y
        }
        onContextMenu(syntheticEvent, 'memory', memory)
        longPressTouchRef.current = null
      }
    }, LONG_PRESS_DELAY)
  }

  const handleTouchMove = (e) => {
    if (longPressTouchRef.current && e.touches?.length) {
      const touch = e.touches[0]
      const dx = touch.clientX - longPressTouchRef.current.x
      const dy = touch.clientY - longPressTouchRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      // Cancel if finger moved more than 10px
      if (distance > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        longPressTouchRef.current = null
      }
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressTouchRef.current = null
  }

  // When in stacked view, adjust x position so pin stays in same place
  // Normal card width: 200px, Stacked card width: 120px, Difference: 80px
  const adjustedX = isStackedView ? memory.x + 80 : memory.x

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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
          onContextMenu={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onContextMenu(e, 'memoryPin', memory)
          }}
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
      ) : memory.pinHead === 'star' ? (
        <div
          className={`memory-pin ${isSelected ? 'selected' : ''}`}
          onClick={handlePinClick}
          onContextMenu={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onContextMenu(e, 'memoryPin', memory)
          }}
          title="Click to connect (right-click to change)"
        >
          <div className="pin-head-star">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 17l-6.3 4 2.3-7.2-6-4.4h7.6z"
                fill="#FFD700"
                stroke="#B8860B"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <div className="memory-pin-tail" />
          </div>
        </div>
      ) : memory.pinHead === 'flag' ? (
        <div
          className={`memory-pin ${isSelected ? 'selected' : ''}`}
          onClick={handlePinClick}
          onContextMenu={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onContextMenu(e, 'memoryPin', memory)
          }}
          title="Click to connect (right-click to change)"
        >
          <div className="pin-head-flag">
            <svg width="16" height="20" viewBox="0 0 16 20">
              <path
                d="M2 0v20"
                stroke="#555"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M3 1h11l-3 4 3 4H3z"
                fill="#DC2626"
                stroke="#991B1B"
                strokeWidth="0.5"
              />
            </svg>
          </div>
        </div>
      ) : (
        <div
          className={`memory-pin ${isSelected ? 'selected' : ''}`}
          onClick={handlePinClick}
          onContextMenu={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onContextMenu(e, 'memoryPin', memory)
          }}
          title="Click to connect (right-click to change)"
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