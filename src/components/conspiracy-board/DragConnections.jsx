import { useEffect, useRef } from 'react'
import { compareIds } from '../../utils/idUtils'

// Simplified connections component that renders only connections for the actively dragged memory
// This is rendered outside the pan-container so it appears above the DragOverlay
export default function DragConnections({
  activeMemoryData,
  activeTransform,
  connections,
  droppedMemories,
  standalonePins = [],
  panOffset,
  isStackedView = false
}) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (svgRef.current) {
      const container = svgRef.current.parentElement
      svgRef.current.setAttribute('viewBox', `0 0 ${container.offsetWidth} ${container.offsetHeight}`)
    }
  }, [])

  // Return null if nothing is being dragged
  if (!activeMemoryData || !activeMemoryData.isOnCanvas) {
    return null
  }

  // Get only connections that involve the dragged memory
  const activeConnections = connections.filter(conn =>
    compareIds(conn.from, activeMemoryData.id) || compareIds(conn.to, activeMemoryData.id)
  )

  // Return null if no connections
  if (activeConnections.length === 0) {
    return null
  }

  const getNodePosition = (nodeId) => {
    // Check if this is the actively dragged memory
    if (compareIds(nodeId, activeMemoryData.id)) {
      const memory = droppedMemories.find(m => compareIds(m.id, nodeId))
      if (!memory) return null

      const cardWidth = isStackedView ? 120 : 250
      const xAdjustment = isStackedView ? 130 : 0
      const pinOffsetFromRight = 8
      const pinOffsetFromTop = 7

      // Apply both pan offset and drag transform for the active memory
      return {
        x: memory.x + xAdjustment + cardWidth - pinOffsetFromRight + panOffset.x + (activeTransform?.delta?.x || 0),
        y: memory.y + pinOffsetFromTop + panOffset.y + (activeTransform?.delta?.y || 0)
      }
    }

    // For non-dragged nodes, just apply pan offset
    const standalonePin = standalonePins.find(p => compareIds(p.id, nodeId))
    if (standalonePin) {
      return {
        x: standalonePin.x + 10 + panOffset.x,
        y: standalonePin.y + 24 + panOffset.y
      }
    }

    const memory = droppedMemories.find(m => compareIds(m.id, nodeId))
    if (!memory) return null

    const cardWidth = isStackedView ? 120 : 250
    const xAdjustment = isStackedView ? 130 : 0
    const pinOffsetFromRight = 8
    const pinOffsetFromTop = 7

    return {
      x: memory.x + xAdjustment + cardWidth - pinOffsetFromRight + panOffset.x,
      y: memory.y + pinOffsetFromTop + panOffset.y
    }
  }

  return (
    <svg
      ref={svgRef}
      className="drag-connections-svg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2500 // Above drag-overlay (2000)
      }}
    >
      {activeConnections.map((connection, index) => {
        const start = getNodePosition(connection.from)
        const end = getNodePosition(connection.to)
        if (!start || !end) return null

        return (
          <line
            key={`drag-${connection.from}-${connection.to}-${index}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#dc143c"
            strokeWidth="2"
            fill="none"
          />
        )
      })}
    </svg>
  )
}