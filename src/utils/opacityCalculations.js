// TODO: Replace All Magic Numbers & Hardcoded Values (JavaScript)
// Find hardcoded opacity thresholds, timing values, dimensions, etc.
// Replace with descriptive named constants (e.g., MIN_VISIBLE_OPACITY = 0.3)
// This is part of a unified effort to replace ALL magic numbers (JS and CSS)
// See TODO.md for complete task description and examples

/**
 * Find all separate chains of connected memories
 * A chain is a group of memories connected by strings
 * ALL IDs are now guaranteed to be strings
 */
export function findAllChains(connections) {
  const chains = []
  const visited = new Set()

  // Helper function to find all memories in a chain using BFS
  function findChain(startId) {
    const chain = new Set()
    const queue = [startId]

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (visited.has(currentId)) continue

      visited.add(currentId)
      chain.add(currentId)

      // Find all neighbors
      connections.forEach(conn => {
        // IDs are already strings, no conversion needed
        if (conn.from === currentId && !visited.has(conn.to)) {
          queue.push(conn.to)
        } else if (conn.to === currentId && !visited.has(conn.from)) {
          queue.push(conn.from)
        }
      })
    }

    return chain
  }

  // Find all chains
  connections.forEach(conn => {
    // IDs are already strings, no conversion needed
    if (!visited.has(conn.from)) {
      chains.push(findChain(conn.from))
    } else if (!visited.has(conn.to)) {
      chains.push(findChain(conn.to))
    }
  })

  return chains
}

/**
 * Calculate opacity levels for all connected memories
 * Based on distance from most recent connection in each chain
 * ALL IDs are now guaranteed to be strings
 */
export function calculateOpacityLevels(connections) {
  const opacityMap = new Map()

  // Find all separate chains
  const chains = findAllChains(connections)

  // Process each chain independently
  chains.forEach(chain => {
    // Find the most recent connection in this chain
    let chainMostRecent = null
    let latestTimestamp = 0

    // Look through all connections to find the most recent one in this chain
    connections.forEach(conn => {
      // IDs are already strings, no conversion needed
      // Check if this connection is in the current chain
      if (chain.has(conn.from) && chain.has(conn.to)) {
        const timestamp = conn.timestamp || 0

        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp
          chainMostRecent = conn
        }
      }
    })

    // If no connections tracked in this chain, all memories stay at full opacity
    if (!chainMostRecent) {
      chain.forEach(id => {
        opacityMap.set(id, 1.0)
      })
      return
    }

    // Calculate distances from the most recent connection in this chain
    const visited = new Set()
    const queue = []

    // IDs are already strings, no conversion needed
    queue.push({ id: chainMostRecent.from, distance: 0 })
    queue.push({ id: chainMostRecent.to, distance: 0 })
    visited.add(chainMostRecent.from)
    visited.add(chainMostRecent.to)

    // BFS to calculate distances within this chain
    while (queue.length > 0) {
      const { id, distance } = queue.shift()

      // Set opacity based on distance
      let opacity
      switch(distance) {
        case 0:
          opacity = 1.0
          break
        case 1:
          opacity = 0.7
          break
        case 2:
          opacity = 0.45
          break
        default:
          opacity = 0.25
          break
      }

      opacityMap.set(id, opacity)

      // Find connected memories within this chain
      connections.forEach(conn => {
        // IDs are already strings, no conversion needed
        // Only process connections within this chain
        if (!chain.has(conn.from) || !chain.has(conn.to)) return

        let nextId = null
        if (conn.from === id && !visited.has(conn.to)) {
          nextId = conn.to
        } else if (conn.to === id && !visited.has(conn.from)) {
          nextId = conn.from
        }

        if (nextId) {
          visited.add(nextId)
          queue.push({ id: nextId, distance: distance + 1 })
        }
      })
    }
  })

  return opacityMap
}
