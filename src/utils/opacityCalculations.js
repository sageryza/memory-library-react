/**
 * Find all separate chains of connected memories
 * A chain is a group of memories connected by strings
 */
export function findAllChains(connections) {
  const chains = []
  const visited = new Set()

  // Helper function to find all memories in a chain using BFS
  function findChain(startId) {
    const chain = new Set()
    const queue = [String(startId)]

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (visited.has(currentId)) continue

      visited.add(currentId)
      chain.add(currentId)

      // Find all neighbors
      connections.forEach(conn => {
        const fromStr = String(conn.from)
        const toStr = String(conn.to)

        if (fromStr === currentId && !visited.has(toStr)) {
          queue.push(toStr)
        } else if (toStr === currentId && !visited.has(fromStr)) {
          queue.push(fromStr)
        }
      })
    }

    return chain
  }

  // Find all chains
  connections.forEach(conn => {
    const fromStr = String(conn.from)
    const toStr = String(conn.to)

    if (!visited.has(fromStr)) {
      chains.push(findChain(fromStr))
    } else if (!visited.has(toStr)) {
      chains.push(findChain(toStr))
    }
  })

  return chains
}

/**
 * Calculate opacity levels for all connected memories
 * Based on distance from most recent connection in each chain
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
      const fromStr = String(conn.from)
      const toStr = String(conn.to)

      // Check if this connection is in the current chain
      if (chain.has(fromStr) && chain.has(toStr)) {
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

    const fromId = String(chainMostRecent.from)
    const toId = String(chainMostRecent.to)

    queue.push({ id: fromId, distance: 0 })
    queue.push({ id: toId, distance: 0 })
    visited.add(fromId)
    visited.add(toId)

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
        const connFromStr = String(conn.from)
        const connToStr = String(conn.to)

        // Only process connections within this chain
        if (!chain.has(connFromStr) || !chain.has(connToStr)) return

        let nextId = null
        if (connFromStr === id && !visited.has(connToStr)) {
          nextId = connToStr
        } else if (connToStr === id && !visited.has(connFromStr)) {
          nextId = connFromStr
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
