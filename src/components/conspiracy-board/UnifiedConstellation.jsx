import { useState, useEffect } from 'react'
import { useConstellations } from '../../hooks/useConstellations'
import { useAuth } from '../../hooks/useAuth'
import { compareIds } from '../../utils/idUtils'
import './UnifiedConstellation.css'

export default function UnifiedConstellation({
  isOpen,
  onClose,
  droppedMemories,
  connections,
  standalonePins,
  onLoadConstellation
}) {
  const { user } = useAuth()
  const { constellations, saveConstellation, loadConstellation, deleteConstellation } = useConstellations(user?.uid)
  const [activeTab, setActiveTab] = useState('select') // 'select' or 'load'
  const [selectedNodes, setSelectedNodes] = useState(new Set())
  const [constellationName, setConstellationName] = useState('')
  const [selectedConstellationId, setSelectedConstellationId] = useState(null)

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedNodes(new Set())
      setConstellationName('')
      setActiveTab('select')
      setSelectedConstellationId(null)
    }
  }, [isOpen])

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

  // Calculate scaled positions for visualization
  const getVisualizationData = () => {
    if (selectedNodes.size === 0) return null

    // Get all selected items with their positions
    const selectedItems = [
      ...droppedMemories.filter(m => {
        return selectedNodes.has(m.id) || selectedNodes.has(String(m.id))
      }).map(m => ({ id: m.id, x: m.x, y: m.y, type: 'memory' })),
      ...standalonePins.filter(p => {
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

    // Get connections between selected nodes
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

    return {
      items: scaledItems,
      connections: selectedConnections,
      viewBoxWidth: targetWidth,
      viewBoxHeight: targetHeight
    }
  }

  const visualizationData = getVisualizationData()

  const handleSaveConstellation = async () => {
    if (selectedNodes.size === 0) {
      alert('Please select at least one memory or pin to save')
      return
    }

    if (!constellationName.trim()) {
      alert('Please enter a name for the constellation')
      return
    }

    // Get selected memories and pins
    const selectedMemories = droppedMemories.filter(m =>
      selectedNodes.has(m.id) || selectedNodes.has(String(m.id))
    )
    const selectedPins = standalonePins.filter(p =>
      selectedNodes.has(p.id) || selectedNodes.has(String(p.id))
    )

    // Get connections between selected nodes
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
      await saveConstellation(constellationName.trim(), constellationData)
      alert(`Constellation "${constellationName}" saved successfully!`)
      setConstellationName('')
      setSelectedNodes(new Set())
      setActiveTab('load') // Switch to load tab after saving
    } catch (e) {
      console.error('Failed to save constellation:', e)
      alert('Failed to save constellation. Please try again.')
    }
  }

  const handleLoad = () => {
    if (!selectedConstellationId) {
      alert('Please select a constellation to load')
      return
    }

    const data = loadConstellation(selectedConstellationId)
    if (data) {
      onLoadConstellation(data)
      onClose()
    }
  }

  const handleDelete = async () => {
    if (!selectedConstellationId) {
      alert('Please select a constellation to delete')
      return
    }

    if (window.confirm('Are you sure you want to delete this constellation?')) {
      try {
        await deleteConstellation(selectedConstellationId)
        setSelectedConstellationId(null)
      } catch (e) {
        console.error('Failed to delete constellation:', e)
        alert('Failed to delete constellation.')
      }
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="unified-constellation-overlay" onClick={onClose} />

      {/* Modal */}
      <div className="unified-constellation-modal">
        <div className="unified-constellation-header">
          <h2>✨ Constellations</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="unified-constellation-tabs">
          <button
            className={`tab ${activeTab === 'select' ? 'active' : ''}`}
            onClick={() => setActiveTab('select')}
          >
            Select & Save
          </button>
          <button
            className={`tab ${activeTab === 'load' ? 'active' : ''}`}
            onClick={() => setActiveTab('load')}
          >
            Load Saved
          </button>
        </div>

        {/* Tab Content */}
        <div className="unified-constellation-content">
          {activeTab === 'select' ? (
            <div className="select-tab">
              <div className="selection-info">
                <p>{selectedNodes.size} nodes selected</p>
                <div className="selection-actions">
                  <button onClick={selectAll} className="btn-select-all">
                    Select All
                  </button>
                  <button onClick={() => setSelectedNodes(new Set())} className="btn-clear">
                    Clear Selection
                  </button>
                </div>
              </div>

              {visualizationData && (
                <div className="constellation-preview">
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
                    {/* Draw connections */}
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
                        <g key={item.id} transform={`translate(${item.scaledX}, ${item.scaledY})`}>
                          <path
                            d="M 0,-8 L 2,-3 L 8,-3 L 3,1 L 5,8 L 0,3 L -5,8 L -3,1 L -8,-3 L -2,-3 Z"
                            fill="#FFD700"
                            stroke="#FFD700"
                            strokeWidth="1"
                          />
                        </g>
                      ) : (
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

              <div className="save-section">
                <input
                  type="text"
                  placeholder="Enter constellation name..."
                  value={constellationName}
                  onChange={(e) => setConstellationName(e.target.value)}
                  className="name-input"
                />
                <button
                  onClick={handleSaveConstellation}
                  className="btn-save"
                  disabled={selectedNodes.size === 0}
                >
                  Save Constellation
                </button>
              </div>

              <div className="help-text">
                <p>Click on memories or pins on the board to select entire connected networks.</p>
              </div>
            </div>
          ) : (
            <div className="load-tab">
              <div className="constellations-list">
                {constellations.length === 0 ? (
                  <p className="no-constellations">No saved constellations yet</p>
                ) : (
                  constellations.map(constellation => (
                    <div
                      key={constellation.id}
                      className={`constellation-item ${selectedConstellationId === constellation.id ? 'selected' : ''}`}
                      onClick={() => setSelectedConstellationId(constellation.id)}
                    >
                      <div className="constellation-name">{constellation.name || constellation.id}</div>
                      <div className="constellation-meta">
                        {constellation.memories?.length || 0} memories,
                        {constellation.pins?.length || 0} pins,
                        {constellation.connections?.length || 0} connections
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedConstellationId && (
                <div className="load-actions">
                  <button onClick={handleLoad} className="btn-load">
                    Load Constellation
                  </button>
                  <button onClick={handleDelete} className="btn-delete">
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selection Overlay for board interaction */}
      {isOpen && activeTab === 'select' && (
        <div className="constellation-selection-overlay">
          {selectableMemories.map(memory => (
            <div
              key={memory.id}
              className={`selectable-node ${selectedNodes.has(memory.id) ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: memory.x,
                top: memory.y,
                width: '280px',
                height: '150px',
                pointerEvents: 'all',
                cursor: 'pointer'
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
              className={`selectable-node-pin ${selectedNodes.has(pin.id) ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: pin.x,
                top: pin.y,
                width: '30px',
                height: '30px',
                pointerEvents: 'all',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation()
                selectConnectedNetwork(pin.id)
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}