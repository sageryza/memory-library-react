import { useState, useEffect, useMemo, useRef } from 'react'
import { useConstellations } from '../../hooks/useConstellations'
import { useAuth } from '../../hooks/useAuth'
import { normalizeId, compareIds } from '../../utils/idUtils'
import './ConstellationSidebar.css'

// Canvas offset constants - must match ConspiracyBoard.jsx
const CANVAS_OFFSET_X = 4500
const CANVAS_OFFSET_Y = 3000

export default function ConstellationSidebar({
  droppedMemories,
  connections,
  standalonePins,
  panOffset,
  zoomLevel = 1,
  viewportWidth,
  viewportHeight,
  onLoadConstellation,
  onConstellationSelect,
  selectedConstellationNodes,
  onPanToNetwork,
  // Search props from TabbedSidebar
  searchTerm = ''
}) {
  const { user } = useAuth()
  const { constellations, saveConstellation, loadConstellation, deleteConstellation } = useConstellations(user?.uid)
  const [activeTab, setActiveTab] = useState('select')
  const [selectedNetworkId, setSelectedNetworkId] = useState(null)
  const [constellationName, setConstellationName] = useState('')
  const [selectedSavedId, setSelectedSavedId] = useState(null)
  const prevSelectedNodesRef = useRef(null)
  const isAutoPanningRef = useRef(false)
  const stableSortOrderRef = useRef(null)
  const prevPanOffsetRef = useRef(panOffset)
  const justAutopannedRef = useRef(false)

  // Detect manual panning and clear the auto-pan lock
  useEffect(() => {
    // Skip if this is the first render
    if (!prevPanOffsetRef.current) {
      prevPanOffsetRef.current = panOffset
      return
    }

    // Check if panOffset changed
    const panChanged =
      prevPanOffsetRef.current.x !== panOffset.x ||
      prevPanOffsetRef.current.y !== panOffset.y

    if (panChanged) {
      // If we just set the auto-pan flag, this is the auto-pan happening
      if (justAutopannedRef.current) {
        justAutopannedRef.current = false
      } else if (isAutoPanningRef.current) {
        // Pan changed but we didn't just auto-pan - this is manual panning
        // Clear the lock so sorting can resume
        isAutoPanningRef.current = false
      }
    }

    prevPanOffsetRef.current = panOffset
  }, [panOffset])

  // Detect all connected networks
  const detectedNetworks = useMemo(() => {
    const visited = new Set()
    const networks = []

    // Helper function to get all connected nodes using BFS
    const getNetwork = (startId) => {
      const normalizedStartId = normalizeId(startId)
      const network = new Set([normalizedStartId])
      const toProcess = [normalizedStartId]

      while (toProcess.length > 0) {
        const current = toProcess.pop()

        connections.forEach(conn => {
          const normalizedFrom = normalizeId(conn.from)
          const normalizedTo = normalizeId(conn.to)

          const fromMatch = normalizedFrom === current
          const toMatch = normalizedTo === current

          if (fromMatch && !network.has(normalizedTo)) {
            network.add(normalizedTo)
            toProcess.push(normalizedTo)
          }
          if (toMatch && !network.has(normalizedFrom)) {
            network.add(normalizedFrom)
            toProcess.push(normalizedFrom)
          }
        })
      }

      return network
    }

    // Find all nodes that have connections
    const allNodesWithConnections = new Set()
    connections.forEach(conn => {
      allNodesWithConnections.add(normalizeId(conn.from))
      allNodesWithConnections.add(normalizeId(conn.to))
    })

    // Process each unvisited node
    allNodesWithConnections.forEach(nodeId => {
      const normalizedNodeId = normalizeId(nodeId)
      if (!visited.has(normalizedNodeId)) {
        const network = getNetwork(normalizedNodeId)
        network.forEach(id => visited.add(normalizeId(id)))

        // Get actual memory and pin objects for this network
        const networkMemories = droppedMemories.filter(m =>
          network.has(normalizeId(m.id))
        )
        const networkPins = standalonePins.filter(p =>
          network.has(normalizeId(p.id))
        )
        const networkConnections = connections.filter(conn => {
          const fromInNetwork = network.has(normalizeId(conn.from))
          const toInNetwork = network.has(normalizeId(conn.to))
          return fromInNetwork && toInNetwork
        })

        if (networkMemories.length > 0 || networkPins.length > 0) {
          networks.push({
            id: Array.from(network).sort().join('-'), // Create unique ID
            nodes: network,
            memories: networkMemories,
            pins: networkPins,
            connections: networkConnections
          })
        }
      }
    })

    return networks
  }, [droppedMemories, connections, standalonePins])

  // Filter out already saved networks
  const unsavedNetworks = useMemo(() => {
    // Check if a constellation is already saved
    const isSaved = (network) => {
      return constellations.some(saved => {
        const savedNodes = new Set([
          ...(saved.memories || []).map(m => normalizeId(m.id)),
          ...(saved.pins || []).map(p => normalizeId(p.id))
        ])

        // Check if this network matches a saved constellation
        return network.nodes.size === savedNodes.size &&
          Array.from(network.nodes).every(nodeId =>
            savedNodes.has(normalizeId(nodeId))
          )
      })
    }

    const filtered = detectedNetworks.filter(network => !isSaved(network))
    return filtered
  }, [detectedNetworks, constellations])

  // Calculate visibility of each network
  const networksWithVisibility = useMemo(() => {
    const networksWithVis = unsavedNetworks.map(network => {
      const allItems = [...network.memories, ...network.pins]

      // Calculate viewport bounds considering pan, zoom, and canvas offset
      // screenToCanvas formula: canvasX = (screenX + CANVAS_OFFSET_X - panOffset.x) / zoomLevel
      // Viewport left edge (screen X=0): canvasX = (CANVAS_OFFSET_X - panOffset.x) / zoomLevel
      // Viewport right edge (screen X=viewportWidth): canvasX = (viewportWidth + CANVAS_OFFSET_X - panOffset.x) / zoomLevel
      const viewportLeft = (CANVAS_OFFSET_X - panOffset.x) / zoomLevel
      const viewportTop = (CANVAS_OFFSET_Y - panOffset.y) / zoomLevel
      const viewportRight = (viewportWidth + CANVAS_OFFSET_X - panOffset.x) / zoomLevel
      const viewportBottom = (viewportHeight + CANVAS_OFFSET_Y - panOffset.y) / zoomLevel

      let visibleCount = 0
      allItems.forEach(item => {
        const itemRight = item.x + (item.width || 280) // Default width for memories
        const itemBottom = item.y + (item.height || 150) // Default height for memories

        const inViewport =
          item.x < viewportRight &&
          itemRight > viewportLeft &&
          item.y < viewportBottom &&
          itemBottom > viewportTop

        if (inViewport) visibleCount++
      })

      const visibility = allItems.length > 0
        ? visibleCount / allItems.length
        : 0

      return {
        ...network,
        visibility,
        visibilityCategory:
          visibility === 1 ? 'full' :
          visibility > 0 ? 'partial' :
          'none'
      }
    })

    // If we're auto-panning (from sidebar click), keep the stable sort order
    // If we're manually panning (user dragging), update the sort order
    if (isAutoPanningRef.current && stableSortOrderRef.current) {
      // Use stable order - just update visibility values without re-sorting
      const stableOrder = stableSortOrderRef.current
      return networksWithVis.sort((a, b) => {
        const aIndex = stableOrder.indexOf(a.id)
        const bIndex = stableOrder.indexOf(b.id)
        // Keep original order for known items, put new items at end
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })
    }

    // Manual pan or first load - sort by visibility and update stable order
    const sorted = networksWithVis.sort((a, b) => {
      // Sort by visibility category first
      const categoryOrder = { 'full': 0, 'partial': 1, 'none': 2 }
      const categoryDiff = categoryOrder[a.visibilityCategory] - categoryOrder[b.visibilityCategory]
      if (categoryDiff !== 0) return categoryDiff

      // Within same category, sort by actual visibility percentage
      if (b.visibility !== a.visibility) return b.visibility - a.visibility

      // Finally, sort by x position (left to right)
      const aMinX = Math.min(...[...a.memories, ...a.pins].map(item => item.x))
      const bMinX = Math.min(...[...b.memories, ...b.pins].map(item => item.x))
      return aMinX - bMinX
    })

    // Save the stable order
    stableSortOrderRef.current = sorted.map(n => n.id)
    return sorted
  }, [unsavedNetworks, panOffset, zoomLevel, viewportWidth, viewportHeight])

  // Watch for constellation selection from canvas and update sidebar selection
  useEffect(() => {
    // Check if selectedConstellationNodes actually changed
    const currentNodes = selectedConstellationNodes
    const prevNodes = prevSelectedNodesRef.current

    // Compare the Sets to see if they're different
    const hasChanged = (() => {
      if (!currentNodes && !prevNodes) return false
      if (!currentNodes || !prevNodes) return true
      if (currentNodes.size !== prevNodes.size) return true

      // Check if all elements are the same
      for (const node of currentNodes) {
        if (!prevNodes.has(node)) return true
      }
      return false
    })()

    // Update the ref for next time
    prevSelectedNodesRef.current = currentNodes

    // Only proceed if selection actually changed
    if (!hasChanged) return

    // IMPORTANT: When deselecting (null/empty), we need to clear the local state
    if (!selectedConstellationNodes || selectedConstellationNodes.size === 0) {
      setSelectedNetworkId(null)
      setSelectedSavedId(null)
      setConstellationName('')
      return
    }

    // Normalize the selected nodes for comparison
    const selectedNodeSet = new Set(
      Array.from(selectedConstellationNodes).map(id => normalizeId(id))
    )

    // Try to match against unsaved networks first
    const matchingUnsavedNetwork = networksWithVisibility.find(network => {
      if (network.nodes.size !== selectedNodeSet.size) return false
      return Array.from(network.nodes).every(nodeId =>
        selectedNodeSet.has(normalizeId(nodeId))
      )
    })

    if (matchingUnsavedNetwork) {
      // Found in unsaved networks - select in "Select" tab
      setActiveTab('select')
      setSelectedNetworkId(matchingUnsavedNetwork.id)
      setConstellationName('') // Clear name when switching
      setSelectedSavedId(null)
      return
    }

    // Try to match against saved constellations
    const matchingSavedConstellation = constellations.find(saved => {
      const savedNodes = new Set([
        ...(saved.memories || []).map(m => normalizeId(m.id)),
        ...(saved.pins || []).map(p => normalizeId(p.id))
      ])

      if (savedNodes.size !== selectedNodeSet.size) return false
      return Array.from(savedNodes).every(nodeId =>
        selectedNodeSet.has(normalizeId(nodeId))
      )
    })

    if (matchingSavedConstellation) {
      // Found in saved constellations - select in "Load" tab
      setActiveTab('load')
      setSelectedSavedId(matchingSavedConstellation.id)
      setConstellationName('') // Clear name when switching
      setSelectedNetworkId(null)
    }
  }, [selectedConstellationNodes, networksWithVisibility, constellations])

  // Create mini visualization for a network
  const createMiniVisualization = (network, isSelected = false) => {
    const items = [...network.memories, ...network.pins]

    if (items.length === 0) return null

    // Calculate actual star positions (connection points) for accurate bounding box
    const starPositions = items.map(item => {
      const isMemory = network.memories.some(m => compareIds(m.id, item.id))
      if (isMemory) {
        // Memory connection point
        return {
          x: item.x + 272,  // Pin is 272px from left edge
          y: item.y + 7     // Pin is 7px from top
        }
      } else {
        // Pin connection point
        return {
          x: item.x + 10,   // Center of pin
          y: item.y + 24    // Bottom of pin tail
        }
      }
    })

    const minX = Math.min(...starPositions.map(p => p.x))
    const maxX = Math.max(...starPositions.map(p => p.x))
    const minY = Math.min(...starPositions.map(p => p.y))
    const maxY = Math.max(...starPositions.map(p => p.y))

    // Larger buffer for bigger star size
    const starBuffer = 20

    const width = (maxX - minX + starBuffer) || starBuffer
    const height = (maxY - minY + starBuffer) || starBuffer

    // Target size for mini visualization
    // TODO: Make minimap visualizations bigger
    // Need to investigate what's constraining their size (bounding box? container?)
    const targetWidth = 200
    const targetHeight = 120
    const padding = 20

    // Calculate scale to fit - more aggressive compression for distances
    const scaleX = (targetWidth - 2 * padding) / width
    const scaleY = (targetHeight - 2 * padding) / height
    // Apply additional compression factor to make lines shorter relative to star size
    const scale = Math.min(scaleX, scaleY) * 0.85

    // Calculate actual scaled dimensions
    const scaledWidth = width * scale
    const scaledHeight = height * scale

    // Calculate centering offsets to center the constellation
    const offsetX = (targetWidth - scaledWidth) / 2
    const offsetY = (targetHeight - scaledHeight) / 2

    // Scale items based on their star positions with centering
    const scaledItems = items.map(item => {
      const isMemory = network.memories.some(m => compareIds(m.id, item.id))
      let starX, starY

      if (isMemory) {
        starX = item.x + 272  // Pin position on memory
        starY = item.y + 7
      } else {
        starX = item.x + 10   // Center of pin
        starY = item.y + 24   // Bottom of pin tail
      }

      return {
        ...item,
        scaledX: (starX - minX) * scale + offsetX,
        scaledY: (starY - minY) * scale + offsetY,
        scale: scale // Store scale for use in rendering
      }
    })

    // Get scaled connections - no offsets needed as scaledX/Y already at star positions
    const scaledConnections = network.connections.map(conn => {
      const fromItem = scaledItems.find(item =>
        compareIds(item.id, conn.from)
      )
      const toItem = scaledItems.find(item =>
        compareIds(item.id, conn.to)
      )

      if (!fromItem || !toItem) return null

      return {
        from: { scaledX: fromItem.scaledX, scaledY: fromItem.scaledY },
        to: { scaledX: toItem.scaledX, scaledY: toItem.scaledY }
      }
    }).filter(conn => conn !== null)

    return (
      <svg
        viewBox={`0 0 ${targetWidth} ${targetHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="mini-constellation"
        style={{ width: '100%', height: 'auto' }}
      >
        {/* Draw connections */}
        {scaledConnections.map((conn, idx) => (
          <line
            key={idx}
            x1={conn.from.scaledX}
            y1={conn.from.scaledY}
            x2={conn.to.scaledX}
            y2={conn.to.scaledY}
            stroke="#808080"
            strokeWidth="2"
            strokeDasharray="5,5"
            strokeLinecap="round"
          />
        ))}

        {/* Draw nodes as stars */}
        {scaledItems.map((item) => {
          // No offset needed - scaledX/Y already at star positions
          return (
            <g key={item.id} transform={`translate(${item.scaledX}, ${item.scaledY})`}>
              {/* Gray outline stroke */}
              <path
                d="M 0,-10 L 3,-4 L 9,-3 L 4.5,1 L 5.5,7 L 0,4 L -5.5,7 L -4.5,1 L -9,-3 L -3,-4 Z"
                fill="none"
                stroke="#808080"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {/* Gold fill */}
              <path
                d="M 0,-10 L 3,-4 L 9,-3 L 4.5,1 L 5.5,7 L 0,4 L -5.5,7 L -4.5,1 L -9,-3 L -3,-4 Z"
                fill="#FFD700"
                stroke="none"
              />
            </g>
          )
        })}
      </svg>
    )
  }

  const handleSelectNetwork = (network, e) => {
    e.stopPropagation()
    setSelectedNetworkId(network.id)
    setConstellationName('')

    // Notify parent to highlight on board
    if (onConstellationSelect) {
      onConstellationSelect(network.nodes)
    }

    // Pan to show the network on canvas
    if (onPanToNetwork) {
      // Set flags to lock sort order during auto-pan
      // This stays locked until user manually pans
      isAutoPanningRef.current = true
      justAutopannedRef.current = true
      onPanToNetwork(network)
    }
  }

  const handleSaveConstellation = async () => {
    const network = networksWithVisibility.find(n => n.id === selectedNetworkId)

    if (!network) return

    const constellationData = {
      memories: network.memories,
      pins: network.pins,
      connections: network.connections
    }

    try {
      await saveConstellation(constellationName.trim(), constellationData)
      setSelectedNetworkId(null)
      setConstellationName('')
      setActiveTab('load')
    } catch (e) {
      console.error('Failed to save constellation:', e)
      alert('Failed to save constellation. Please try again.')
    }
  }

  const handleLoadConstellation = () => {
    if (!selectedSavedId) return

    const data = loadConstellation(selectedSavedId)
    if (data) {
      onLoadConstellation(data)
    }
  }

  const handleDeleteConstellation = async () => {
    if (!selectedSavedId) return

    if (window.confirm('Are you sure you want to delete this constellation?')) {
      try {
        await deleteConstellation(selectedSavedId)
        setSelectedSavedId(null)
      } catch (e) {
        console.error('Failed to delete constellation:', e)
        alert('Failed to delete constellation.')
      }
    }
  }

  const handleDeselectAll = (e) => {
    // Don't deselect if clicking on interactive elements
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
      return
    }

    setSelectedNetworkId(null)
    setSelectedSavedId(null)
    setConstellationName('')
    if (onConstellationSelect) {
      onConstellationSelect(null)
    }
  }

  return (
    <div className="constellation-sidebar" onClick={handleDeselectAll}>
      {/* File folder tabs */}
      {/* TODO: Fix tab styling issues:
          - Add space above Select/Load tabs
          - Add header color */}
      <div className="constellation-tabs">
        <button
          className={`tab ${activeTab === 'select' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setActiveTab('select')
          }}
        >
          Select
        </button>
        <button
          className={`tab ${activeTab === 'load' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setActiveTab('load')
          }}
        >
          Load
        </button>
      </div>

      {/* Tab content */}
      <div className="constellation-content">
        {activeTab === 'select' ? (
          <div className="select-content">
            {networksWithVisibility.length === 0 ? (
              <p className="no-constellations">No unsaved constellations found</p>
            ) : (
              <div className="networks-list">
                {networksWithVisibility.map(network => (
                  <div
                    key={network.id}
                    className={`network-item ${selectedNetworkId === network.id ? 'selected' : ''}`}
                    onClick={(e) => handleSelectNetwork(network, e)}
                  >
                    {createMiniVisualization(network, selectedNetworkId === network.id)}

                    {selectedNetworkId === network.id && (
                      <div className="network-save-controls">
                        <input
                          type="text"
                          placeholder="Enter name..."
                          value={constellationName}
                          onChange={(e) => setConstellationName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="name-input"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSaveConstellation()
                          }}
                          className="btn-save"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="load-content">
            {(() => {
              // Filter constellations by search term
              const filteredConstellations = constellations.filter(c => {
                if (!searchTerm) return true
                return (c.name || 'Untitled').toLowerCase().includes(searchTerm.toLowerCase())
              })

              if (constellations.length === 0) {
                return <p className="no-constellations">No saved constellations yet</p>
              }
              if (filteredConstellations.length === 0) {
                return <p className="no-constellations">No constellations match your search</p>
              }
              return (
                <div className="saved-list">
                  {filteredConstellations.map(constellation => (
                    <div
                      key={constellation.id}
                      className={`saved-item ${selectedSavedId === constellation.id ? 'selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedSavedId(constellation.id)
                      }}
                    >
                      {createMiniVisualization({
                        memories: constellation.memories || [],
                        pins: constellation.pins || [],
                        connections: constellation.connections || []
                      })}
                      <div className="saved-name">{constellation.name || 'Untitled'}</div>

                      {selectedSavedId === constellation.id && (
                        <div className="saved-actions">
                          <button onClick={handleLoadConstellation} className="btn-load">
                            Add to current board
                          </button>
                          <button onClick={handleDeleteConstellation} className="btn-delete">
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}