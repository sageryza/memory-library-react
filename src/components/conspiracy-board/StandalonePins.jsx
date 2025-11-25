import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { setHasId } from '../../utils/idUtils'
import './ConstellationMode.css'

function StandalonePin({ pin, isSelected, onPinClick, onUpdatePosition, onContextMenu, panOffset, isConstellationSelected, showAllInsights }) {
  const [hoveredTooltip, setHoveredTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: pin.id,
    data: { ...pin, isStandalonePin: true },
  })

  const style = {
    position: 'absolute',
    left: pin.x,
    top: pin.y,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: 1,
  }

  const handleClick = (e) => {
    e.stopPropagation()
    onPinClick(pin.id)
  }

  const handleMouseEnter = (e) => {
    if (pin.description && pin.description.trim()) {
      setHoveredTooltip(true)
      setTooltipPosition({
        x: pin.x,
        y: pin.y
      })
    }
  }

  const handleMouseLeave = () => {
    setHoveredTooltip(false)
  }

  // Update tooltip position when showAllInsights changes
  useEffect(() => {
    if (showAllInsights && pin.description && pin.description.trim()) {
      setTooltipPosition({
        x: pin.x,
        y: pin.y
      })
    }
  }, [showAllInsights, pin.x, pin.y, pin.id, pin.description])

  // Show if either hovering this pin OR showAllInsights is true
  const shouldShowTooltip = (showAllInsights || hoveredTooltip) && pin.description && pin.description.trim()

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`standalone-pin ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isConstellationSelected ? 'constellation-star' : ''}`}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.stopPropagation()
          onContextMenu(e, 'pin', pin)
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-pin-id={pin.id}
      >
        {isConstellationSelected ? (
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
        ) : pin.pinHead === 'star' ? (
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
            <div className="standalone-pin-tail" />
          </div>
        ) : pin.pinHead === 'flag' ? (
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
        ) : (
          <>
            <div className="standalone-pin-circle" />
            <div className="standalone-pin-tail" />
          </>
        )}
      </div>

      {shouldShowTooltip && (
        <div
          className="connection-tooltip show"
          style={{
            position: 'absolute',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 2500 // Above strings (2100) and pins
          }}
        >
          {pin.description}
        </div>
      )}
    </>
  )
}

export default function StandalonePins({
  standalonePins,
  selectedPin,
  onPinClick,
  onUpdatePosition,
  onContextMenu,
  isPlacingPin,
  placementPosition,
  panOffset,
  constellationSelectedNodes,
  showAllInsights
}) {
  return (
    <>
      {standalonePins.map(pin => (
        <StandalonePin
          key={pin.id}
          pin={pin}
          isSelected={selectedPin === pin.id}
          onPinClick={onPinClick}
          onUpdatePosition={onUpdatePosition}
          onContextMenu={onContextMenu}
          panOffset={panOffset}
          isConstellationSelected={constellationSelectedNodes && setHasId(constellationSelectedNodes, pin.id)}
          showAllInsights={showAllInsights}
        />
      ))}
      {isPlacingPin && placementPosition && (
        <div
          className="standalone-pin placing"
          style={{
            position: 'absolute',
            left: placementPosition.x - 10,
            top: placementPosition.y - 25,
            opacity: 1,
            pointerEvents: 'none',
          }}
        >
          <div className="standalone-pin-circle" />
          <div className="standalone-pin-tail" />
        </div>
      )}
    </>
  )
}