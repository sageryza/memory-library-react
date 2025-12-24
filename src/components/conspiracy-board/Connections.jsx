import { useEffect, useRef, useState } from 'react'
import { calculateOpacityLevels } from '../../utils/opacityCalculations'
import { compareIds, normalizeId, setHasId } from '../../utils/idUtils'
import { CARD_WIDTH, CARD_WIDTH_STACKED, PIN_OFFSET_FROM_RIGHT, PIN_OFFSET_FROM_TOP, STANDALONE_PIN_CENTER_X, STANDALONE_PIN_BOTTOM_Y } from './constants'
import './Connections.css'

// TODO: Add customizable string/connection colors for Advanced Mode
// Allow users to set custom colors via settings
// Could use CSS custom properties or inline styles based on user preferences
const LONG_PRESS_DELAY = 500 // ms

export default function Connections({ connections, droppedMemories, standalonePins = [], activeTransform, onConnectionClick, onConnectionDelete, onConnectionContextMenu, showOpacityFading = false, isStackedView = false, showAllInsights = false, selectedPin = null, cursorPosition = null, constellationSelectedNodes = null, stringsInFront = true, isDragging = false }) {
  const svgRef = useRef(null)
  const [hoveredConnection, setHoveredConnection] = useState(null)
  const [tooltipPositions, setTooltipPositions] = useState({})
  const [, forceUpdate] = useState({})

  // Long-press for context menu on mobile
  const longPressTimerRef = useRef(null)
  const longPressTouchRef = useRef(null)

  useEffect(() => {
    // Set SVG viewBox to match the full canvas size
    const updateViewBox = () => {
      if (svgRef.current) {
        svgRef.current.setAttribute('viewBox', '0 0 10000 8000')
      }
    }
    updateViewBox()
  }, [])

  // Force redraw when memories move or during drag
  useEffect(() => {
    // This will trigger a re-render whenever droppedMemories change position or activeTransform changes
  }, [droppedMemories, connections, standalonePins, activeTransform, isStackedView])

  // Force update after DOM elements are rendered to switch from fallback to actual positions
  useEffect(() => {
    if (connections.length > 0 && droppedMemories.length > 0) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        forceUpdate({})
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [connections.length, droppedMemories.length, isStackedView])

  const getNodePosition = (nodeId) => {
    // Check if it's a standalone pin first (these use different dragging)
    const standalonePin = standalonePins.find(p => compareIds(p.id, nodeId))
    if (standalonePin) {
      // Apply transform only for standalone pins being dragged
      let deltaX = 0
      let deltaY = 0
      if (activeTransform && compareIds(activeTransform.id, nodeId)) {
        deltaX = activeTransform.delta.x
        deltaY = activeTransform.delta.y
      }

      // Standalone pins - connect to bottom of tail
      return {
        x: standalonePin.x + STANDALONE_PIN_CENTER_X + deltaX,
        y: standalonePin.y + STANDALONE_PIN_BOTTOM_Y + deltaY
      }
    }

    // Otherwise it's a memory - calculate position directly
    const memory = droppedMemories.find(m => compareIds(m.id, nodeId))
    if (!memory) return null

    // Direct calculation based on memory position and view state
    // Pin is positioned at top: -17px, right: -2px with 20px width, 24px height
    // Tail center is at x: 10px from pin container left (left: 9px + 1px for center of 2px width)
    // Pin right edge is 2px outside card, so pin spans from cardWidth-18px to cardWidth+2px
    // Tail center absolute x: cardWidth - 18px + 10px = cardWidth - 8px
    // Tail bottom is at y: -17px + 24px = 7px from card top
    const cardWidth = isStackedView ? CARD_WIDTH_STACKED : CARD_WIDTH

    // In stacked view, cards are shifted right by 80px to keep pins aligned
    const xAdjustment = isStackedView ? 80 : 0

    // Apply transform if memory is being dragged
    // Memory cards have draggable id as `canvas-${memory.id}`
    let deltaX = 0
    let deltaY = 0
    const canvasNodeId = `canvas-${normalizeId(nodeId)}`
    if (activeTransform && normalizeId(activeTransform.id) === canvasNodeId) {
      deltaX = activeTransform.delta.x
      deltaY = activeTransform.delta.y
    }

    return {
      x: memory.x + xAdjustment + cardWidth - PIN_OFFSET_FROM_RIGHT + deltaX,
      y: memory.y + PIN_OFFSET_FROM_TOP + deltaY
    }
  }

  // Calculate opacity levels using the complex algorithm
  let opacityMap = new Map()
  if (showOpacityFading) {
    opacityMap = calculateOpacityLevels(connections)
  }

  // Get opacity for a connection based on its connected memories
  const getConnectionOpacity = (connection) => {
    if (!showOpacityFading) {
      return 1.0 // Full opacity when fading disabled
    }

    // Get opacity of both connected memories
    // IDs are already strings, no conversion needed
    const fromOpacity = opacityMap.get(connection.from) || 1.0
    const toOpacity = opacityMap.get(connection.to) || 1.0

    // Use the average of both memories' opacity
    return (fromOpacity + toOpacity) / 2
  }

  // Get insight for hovered connection from connection object
  const hoveredInsight = hoveredConnection?.insight || null

  // Get position for temporary connection line
  const tempConnectionStart = selectedPin ? getNodePosition(selectedPin) : null

  // Touch handlers for long-press context menu on connections
  const handleConnectionTouchStart = (e, connection) => {
    const touch = e.touches[0]
    longPressTouchRef.current = { x: touch.clientX, y: touch.clientY, connection }

    longPressTimerRef.current = setTimeout(() => {
      if (longPressTouchRef.current) {
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: longPressTouchRef.current.x,
          clientY: longPressTouchRef.current.y
        }
        onConnectionContextMenu(syntheticEvent, longPressTouchRef.current.connection)
        longPressTouchRef.current = null
      }
    }, LONG_PRESS_DELAY)
  }

  const handleConnectionTouchMove = (e) => {
    if (longPressTouchRef.current && e.touches?.length) {
      const touch = e.touches[0]
      const dx = touch.clientX - longPressTouchRef.current.x
      const dy = touch.clientY - longPressTouchRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        longPressTouchRef.current = null
      }
    }
  }

  const handleConnectionTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressTouchRef.current = null
  }

  return (
    <>
      {/* String z-index: always in front while dragging, otherwise controlled by stringsInFront toggle */}
      <svg
        ref={svgRef}
        className="connections-svg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '10000px',  // Match canvas width
          height: '8000px',   // Match canvas height
          pointerEvents: 'none',
          zIndex: isDragging ? 2300 : (stringsInFront ? 100 : 1) // Above pins (2200) while dragging
        }}
        viewBox="0 0 10000 8000"
      >
        {/* Define animated gold gradient for selected connections */}
        <defs>
          <linearGradient id="goldSheen" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.3">
              <animate attributeName="offset" values="0;1;0" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#FFD700" stopOpacity="1">
              <animate attributeName="offset" values="0.5;1.5;0.5" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0.3">
              <animate attributeName="offset" values="1;2;1" dur="2s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>

        {/* Existing connections - skip dragged memory's connections (DragConnections handles those) */}
        {connections
          .filter(connection => {
            if (!isDragging || !activeTransform?.id) return true
            const draggedId = normalizeId(activeTransform.id).replace('canvas-', '')
            return !compareIds(connection.from, draggedId) && !compareIds(connection.to, draggedId)
          })
          .map((connection, index) => {
        const start = getNodePosition(connection.from)
        const end = getNodePosition(connection.to)
        if (!start || !end) return null

        const opacity = getConnectionOpacity(connection)
        const connectionKey = `${connection.from}-${connection.to}-${index}`
        const midpoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
        }

        // Check if this connection is selected in constellation mode
        const isSelected = constellationSelectedNodes &&
          setHasId(constellationSelectedNodes, connection.from) &&
          setHasId(constellationSelectedNodes, connection.to)

        return (
          <g key={connectionKey}>
            {/* Invisible thick line for easier right-click targeting */}
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="transparent"
              strokeWidth="10"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onConnectionContextMenu(e, connection)
              }}
              onMouseEnter={(e) => {
                if (connection.insight && connection.insight.trim()) {
                  setHoveredConnection(connection)
                  setTooltipPositions(prev => ({
                    ...prev,
                    [connectionKey]: midpoint
                  }))
                }
              }}
              onMouseLeave={() => {
                setHoveredConnection(null)
              }}
              onTouchStart={(e) => handleConnectionTouchStart(e, connection)}
              onTouchMove={handleConnectionTouchMove}
              onTouchEnd={handleConnectionTouchEnd}
            />
            {/* Visible line - gray dashed if selected, crimson otherwise */}
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              strokeLinecap="round"
              strokeOpacity={opacity}
              strokeDasharray={isSelected ? "10,10" : "none"}
              className={isSelected ? "" : "connection-line"}
              style={{
                stroke: isSelected ? "#808080" : "#dc143c",
                strokeWidth: isSelected ? 4 : 2,
                pointerEvents: 'none',
                transition: 'stroke-opacity 0.5s ease'
              }}
            />
          </g>
        )
        })}

        {/* Temporary connection line while dragging */}
        {tempConnectionStart && cursorPosition && (
          <line
            x1={tempConnectionStart.x}
            y1={tempConnectionStart.y}
            x2={cursorPosition.x}
            y2={cursorPosition.y}
            stroke="#dc143c"
            strokeWidth="2"
            strokeDasharray="5,5"
            strokeLinecap="round"
            opacity="0.7"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Connection Tooltips */}
      {connections.map((connection, index) => {
        const connectionKey = `${connection.from}-${connection.to}-${index}`
        const insight = connection.insight?.trim()
        if (!insight) return null

        const start = getNodePosition(connection.from)
        const end = getNodePosition(connection.to)
        if (!start || !end) return null

        const midpoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
        }

        // Show if either hovering this connection OR showAllInsights is true
        const shouldShow = showAllInsights || (hoveredConnection === connection)
        if (!shouldShow) return null

        return (
          <div
            key={`tooltip-${connectionKey}`}
            className="connection-tooltip show"
            style={{
              position: 'absolute',
              left: midpoint.x,
              top: midpoint.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 2500  // Above strings (2100) and pins
            }}
          >
            {insight}
          </div>
        )
      })}
    </>
  )
}