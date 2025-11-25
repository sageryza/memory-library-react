import { useState, useEffect } from 'react'
import './PinGrid.css'

export default function PinGrid({ pin, panOffset, zoomLevel = 1 }) {
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  // Update viewport size on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Grid spacing in pixels (~1 inch at 96 DPI)
  const gridSpacing = 96

  // Margin from viewport edges (1 inch)
  const margin = 96

  // Calculate grid dimensions (viewport size minus margins)
  const gridWidth = viewportSize.width - (margin * 2)
  const gridHeight = viewportSize.height - (margin * 2)

  // Pin tail bottom position (pin is 20px wide, tail ends at y + 24)
  const pinCenterX = pin.x + 10
  const pinCenterY = pin.y + 24 // Bottom of pin tail

  // Calculate how far the grid extends from the pin center
  const halfWidth = gridWidth / 2
  const halfHeight = gridHeight / 2

  // Grid bounds relative to pin center
  const gridLeft = pinCenterX - halfWidth
  const gridTop = pinCenterY - halfHeight

  // Arrow marker size
  const arrowSize = 10

  // Generate vertical grid lines (excluding center axis)
  const verticalLines = []
  for (let x = gridSpacing; x < halfWidth; x += gridSpacing) {
    // Lines to the right of center
    verticalLines.push(pinCenterX + x)
    // Lines to the left of center
    verticalLines.push(pinCenterX - x)
  }

  // Generate horizontal grid lines (excluding center axis)
  const horizontalLines = []
  for (let y = gridSpacing; y < halfHeight; y += gridSpacing) {
    // Lines below center
    horizontalLines.push(pinCenterY + y)
    // Lines above center
    horizontalLines.push(pinCenterY - y)
  }

  return (
    <svg
      className="pin-grid"
      style={{
        position: 'absolute',
        left: gridLeft,
        top: gridTop,
        width: gridWidth,
        height: gridHeight,
        pointerEvents: 'none',
        zIndex: 1, // Below pins and connections
      }}
    >
      <defs>
        {/* Arrow marker for axis ends */}
        <marker
          id="grid-arrow"
          markerWidth={arrowSize}
          markerHeight={arrowSize}
          refX={arrowSize - 1}
          refY={arrowSize / 2}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d={`M 0 0 L ${arrowSize} ${arrowSize / 2} L 0 ${arrowSize} z`}
            fill="black"
          />
        </marker>
      </defs>

      {/* Grid lines (0.5px gray) */}
      <g className="grid-lines">
        {/* Vertical grid lines */}
        {verticalLines.map((x, i) => (
          <line
            key={`v-${i}`}
            x1={x - gridLeft}
            y1={0}
            x2={x - gridLeft}
            y2={gridHeight}
            stroke="#999"
            strokeWidth="0.5"
          />
        ))}

        {/* Horizontal grid lines */}
        {horizontalLines.map((y, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={y - gridTop}
            x2={gridWidth}
            y2={y - gridTop}
            stroke="#999"
            strokeWidth="0.5"
          />
        ))}
      </g>

      {/* Main axes (2px dashed black with arrows) */}
      <g className="grid-axes">
        {/* Horizontal axis - left segment */}
        <line
          x1={arrowSize}
          y1={halfHeight}
          x2={halfWidth - 5}
          y2={halfHeight}
          stroke="black"
          strokeWidth="2"
          strokeDasharray="8 4"
        />
        {/* Horizontal axis - right segment */}
        <line
          x1={halfWidth + 5}
          y1={halfHeight}
          x2={gridWidth - arrowSize}
          y2={halfHeight}
          stroke="black"
          strokeWidth="2"
          strokeDasharray="8 4"
        />

        {/* Vertical axis - top segment */}
        <line
          x1={halfWidth}
          y1={arrowSize}
          x2={halfWidth}
          y2={halfHeight - 5}
          stroke="black"
          strokeWidth="2"
          strokeDasharray="8 4"
        />
        {/* Vertical axis - bottom segment */}
        <line
          x1={halfWidth}
          y1={halfHeight + 5}
          x2={halfWidth}
          y2={gridHeight - arrowSize}
          stroke="black"
          strokeWidth="2"
          strokeDasharray="8 4"
        />

        {/* Arrow heads */}
        {/* Right arrow */}
        <polygon
          points={`${gridWidth - arrowSize},${halfHeight - arrowSize / 2} ${gridWidth},${halfHeight} ${gridWidth - arrowSize},${halfHeight + arrowSize / 2}`}
          fill="black"
        />
        {/* Left arrow */}
        <polygon
          points={`${arrowSize},${halfHeight - arrowSize / 2} 0,${halfHeight} ${arrowSize},${halfHeight + arrowSize / 2}`}
          fill="black"
        />
        {/* Bottom arrow */}
        <polygon
          points={`${halfWidth - arrowSize / 2},${gridHeight - arrowSize} ${halfWidth},${gridHeight} ${halfWidth + arrowSize / 2},${gridHeight - arrowSize}`}
          fill="black"
        />
        {/* Top arrow */}
        <polygon
          points={`${halfWidth - arrowSize / 2},${arrowSize} ${halfWidth},0 ${halfWidth + arrowSize / 2},${arrowSize}`}
          fill="black"
        />
      </g>
    </svg>
  )
}
