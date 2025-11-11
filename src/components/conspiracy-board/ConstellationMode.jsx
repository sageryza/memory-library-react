import { useState, useEffect } from 'react'
import { useConstellations } from '../../hooks/useConstellations'
import { useAuth } from '../../hooks/useAuth'
import { compareIds } from '../../utils/idUtils'
import './ConstellationMode.css'

export default function ConstellationMode({
  isActive,
  onToggle,
  droppedMemories,
  connections,
  standalonePins,
  onSelectionChange,
  onExport
}) {
  const { user } = useAuth()
  const { saveConstellation } = useConstellations(user?.uid)
  const [selectedNodes, setSelectedNodes] = useState(new Set())
  const [constellationName, setConstellationName] = useState('')

  useEffect(() => {
    if (!isActive) {
      setSelectedNodes(new Set())
      setConstellationName('')
      if (onSelectionChange) {
        onSelectionChange(null)
      }
    }
  }, [isActive, onSelectionChange])

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectionChange && isActive) {
      onSelectionChange(selectedNodes.size > 0 ? selectedNodes : null)
    }
  }, [selectedNodes, onSelectionChange, isActive])

  const selectConnectedNetwork = (nodeId) => {
    // Select entire connected graph using BFS
    const connected = new Set([nodeId])
    const toProcess = [nodeId]

    while (toProcess.length > 0) {
      const current = toProcess.pop()

      // Find all connections involving this node
      connections.forEach(conn => {
        const fromMatch = compareIds(conn.from, current)
        const toMatch = compareIds(conn.to, current)

        if (fromMatch && !connected.has(conn.to)) {
          connected.add(conn.to)
          toProcess.push(conn.to)
        }
        if (toMatch && !connected.has(conn.from)) {
          connected.add(conn.from)
          toProcess.push(conn.from)
        }
      })
    }

    setSelectedNodes(connected)
  }

  const selectAll = () => {
    const allNodes = [
      ...droppedMemories.map(m => m.id),
      ...standalonePins.map(p => p.id)
    ]
    setSelectedNodes(new Set(allNodes))
  }

  // Helper function to check if a node has any connections
  const hasConnections = (nodeId) => {
    return connections.some(conn => {
      const fromMatch = compareIds(conn.from, nodeId)
      const toMatch = compareIds(conn.to, nodeId)
      return fromMatch || toMatch
    })
  }

  // Filter memories and pins to only include those with connections
  const selectableMemories = droppedMemories.filter(m => hasConnections(m.id))
  const selectablePins = standalonePins.filter(p => hasConnections(p.id))

  // Calculate scaled positions for visualization
  const getVisualizationData = () => {
    if (selectedNodes.size === 0) return null


    // Get all selected items with their positions - ensure ID type consistency
    const selectedItems = [
      ...droppedMemories.filter(m => {
        // Try both string and original type
        return selectedNodes.has(m.id) || selectedNodes.has(String(m.id))
      }).map(m => ({ id: m.id, x: m.x, y: m.y, type: 'memory' })),
      ...standalonePins.filter(p => {
        // Try both string and original type
        return selectedNodes.has(p.id) || selectedNodes.has(String(p.id))
      }).map(p => ({ id: p.id, x: p.x, y: p.y, type: 'pin' }))
    ]

    if (selectedItems.length === 0) return null

    // Calculate bounding box
    const minX = Math.min(...selectedItems.map(item => item.x))
    const maxX = Math.max(...selectedItems.map(item => item.x))
    const minY = Math.min(...selectedItems.map(item => item.y))
    const maxY = Math.max(...selectedItems.map(item => item.y))

    const width = maxX - minX || 100
    const height = maxY - minY || 100

    // Target visualization size
    const targetWidth = 240
    const targetHeight = 180
    const padding = 20

    // Calculate scale to fit
    const scaleX = (targetWidth - 2 * padding) / width
    const scaleY = (targetHeight - 2 * padding) / height
    const scale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down

    // Scale and center items
    const scaledItems = selectedItems.map(item => ({
      ...item,
      scaledX: (item.x - minX) * scale + padding,
      scaledY: (item.y - minY) * scale + padding
    }))

    // Get connections between selected nodes - with type-safe comparison
    const selectedConnections = connections.filter(conn => {
      const fromSelected = selectedNodes.has(conn.from) || selectedNodes.has(String(conn.from))
      const toSelected = selectedNodes.has(conn.to) || selectedNodes.has(String(conn.to))
      return fromSelected && toSelected
    }).map(conn => {
      const fromItem = scaledItems.find(item =>
        compareIds(item.id, conn.from)
      )
      const toItem = scaledItems.find(item =>
        compareIds(item.id, conn.to)
      )
      return { from: fromItem, to: toItem }
    }).filter(conn => conn.from && conn.to)

    const result = {
      items: scaledItems,
      connections: selectedConnections,
      viewBoxWidth: targetWidth,
      viewBoxHeight: targetHeight
    }

    return result
  }

  const visualizationData = getVisualizationData()

  const exportConstellation = async () => {
    if (selectedNodes.size === 0) {
      alert('Please select at least one memory or pin to export')
      return
    }

    if (!constellationName.trim()) {
      alert('Please enter a name for the constellation')
      return
    }

    // Get selected memories and pins - with type-safe comparison
    const selectedMemories = droppedMemories.filter(m =>
      selectedNodes.has(m.id) || selectedNodes.has(String(m.id))
    )
    const selectedPins = standalonePins.filter(p =>
      selectedNodes.has(p.id) || selectedNodes.has(String(p.id))
    )

    // Get connections between selected nodes - with type-safe comparison
    const selectedConnections = connections.filter(conn => {
      const fromSelected = selectedNodes.has(conn.from) || selectedNodes.has(String(conn.from))
      const toSelected = selectedNodes.has(conn.to) || selectedNodes.has(String(conn.to))
      return fromSelected && toSelected
    })

    const constellationData = {
      memories: selectedMemories,
      pins: selectedPins,
      connections: selectedConnections
    }

    try {
      // Save to Firebase
      await saveConstellation(constellationName.trim(), constellationData)

      const constellation = {
        name: constellationName,
        ...constellationData,
        nodeCount: selectedNodes.size,
        connectionCount: selectedConnections.length
      }

      // Call parent export handler if provided
      if (onExport) {
        onExport(constellation)
      }

      alert(`Constellation "${constellationName}" exported successfully!`)
      onToggle() // Exit constellation mode
    } catch (e) {
      console.error('Failed to save constellation:', e)
      alert('Failed to save constellation. Please try again.')
    }
  }

  return (
    <>
      <div className="constellation-mode-panel">
        <div className="constellation-header">
          <h3>✨ Constellation Mode</h3>
          <button className="btn-exit-constellation" onClick={onToggle}>
            Exit Mode
          </button>
        </div>

        <div className="constellation-info">
          <p>{selectedNodes.size} nodes selected</p>
          <div className="constellation-actions">
            <button onClick={selectAll} className="btn-select-all">
              Select All
            </button>
            <button onClick={() => setSelectedNodes(new Set())} className="btn-clear-selection">
              Clear Selection
            </button>
          </div>
        </div>

        {visualizationData && (
          <div className="constellation-visualization">
            <svg
              width={visualizationData.viewBoxWidth}
              height={visualizationData.viewBoxHeight}
              viewBox={`0 0 ${visualizationData.viewBoxWidth} ${visualizationData.viewBoxHeight}`}
              style={{
                border: '2px solid #FFD700',
                borderRadius: '8px',
                background: '#faf8e9'
              }}
            >
              {/* Draw connections as gold dashed lines */}
              {visualizationData.connections.map((conn, idx) => (
                <line
                  key={idx}
                  x1={conn.from.scaledX}
                  y1={conn.from.scaledY}
                  x2={conn.to.scaledX}
                  y2={conn.to.scaledY}
                  stroke="#FFD700"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  strokeLinecap="round"
                />
              ))}

              {/* Draw nodes */}
              {visualizationData.items.map((item) => (
                item.type === 'pin' ? (
                  // Draw star for pins
                  <g key={item.id} transform={`translate(${item.scaledX}, ${item.scaledY})`}>
                    <path
                      d="M 0,-8 L 2,-3 L 8,-3 L 3,1 L 5,8 L 0,3 L -5,8 L -3,1 L -8,-3 L -2,-3 Z"
                      fill="#FFD700"
                      stroke="#FFD700"
                      strokeWidth="1"
                    />
                  </g>
                ) : (
                  // Draw small circle for memories
                  <circle
                    key={item.id}
                    cx={item.scaledX}
                    cy={item.scaledY}
                    r="4"
                    fill="#FFD700"
                    stroke="#FFD700"
                    strokeWidth="1"
                  />
                )
              ))}
            </svg>
          </div>
        )}

        <div className="constellation-export">
          <input
            type="text"
            placeholder="Constellation name..."
            value={constellationName}
            onChange={(e) => setConstellationName(e.target.value)}
            className="constellation-name-input"
          />
          <button
            onClick={exportConstellation}
            className="btn-export-constellation"
            disabled={selectedNodes.size === 0}
          >
            Export Constellation
          </button>
        </div>

        <div className="constellation-help">
          <p>Click any memory or pin to select its entire connected network.</p>
          <p>Only items with connections can be selected.</p>
        </div>
      </div>

      {/* Overlay for visual feedback - render outside panel */}
      <div className="constellation-overlay">
        {selectableMemories.map(memory => (
          <div
            key={memory.id}
            className={`constellation-node ${selectedNodes.has(memory.id) ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: memory.x,
              top: memory.y,
              width: '280px',
              height: '150px',
              pointerEvents: 'all',
              cursor: 'pointer',
              zIndex: 9000
            }}
            onClick={(e) => {
              e.stopPropagation()
              selectConnectedNetwork(memory.id)
            }}
          />
        ))}
        {selectablePins.map(pin => (
          <div
            key={pin.id}
            className={`constellation-node-pin ${selectedNodes.has(pin.id) ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: pin.x,
              top: pin.y,
              width: '30px',
              height: '30px',
              pointerEvents: 'all',
              cursor: 'pointer',
              zIndex: 9000
            }}
            onClick={(e) => {
              e.stopPropagation()
              selectConnectedNetwork(pin.id)
            }}
          />
        ))}
      </div>
    </>
  )
}