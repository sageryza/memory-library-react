/**
 * Utility functions for playground memory positioning and collision detection
 */

/**
 * Checks if two rectangles overlap
 * @param {object} pos1 - Position object { x, y }
 * @param {object} size1 - Size object { width, height }
 * @param {object} pos2 - Position object { x, y }
 * @param {object} size2 - Size object { width, height }
 * @returns {boolean} true if collision detected
 */
export function checkCollision(pos1, size1, pos2, size2) {
  return !(
    pos1.x + size1.width < pos2.x ||
    pos1.x > pos2.x + size2.width ||
    pos1.y + size1.height < pos2.y ||
    pos1.y > pos2.y + size2.height
  );
}

/**
 * Generates random position avoiding collisions
 * @param {array} existingMemories - Current memories with positions
 * @param {object} canvasSize - { width, height } of canvas
 * @param {object} cardSize - { width, height } of memory card (default: 200x150)
 * @param {number} padding - Minimum padding around cards (default: 20px)
 * @returns {object} { x, y } position
 */
export function generateRandomPosition(
  existingMemories = [],
  canvasSize = { width: 1000, height: 800 },
  cardSize = { width: 200, height: 150 },
  padding = 20
) {
  const maxAttempts = 50;
  let attempts = 0;

  // Calculate safe bounds
  const maxX = canvasSize.width - cardSize.width - padding;
  const maxY = canvasSize.height - cardSize.height - padding;

  while (attempts < maxAttempts) {
    // Generate random position within bounds
    const x = Math.random() * maxX + padding;
    const y = Math.random() * maxY + padding;

    const newPosition = { x, y };

    // Check overlap with existing memories
    let hasCollision = false;

    for (const memory of existingMemories) {
      if (memory.position) {
        // Add padding to collision detection
        const paddedSize = {
          width: cardSize.width + padding,
          height: cardSize.height + padding
        };

        if (checkCollision(newPosition, paddedSize, memory.position, paddedSize)) {
          hasCollision = true;
          break;
        }
      }
    }

    // If no collision, return this position
    if (!hasCollision) {
      return newPosition;
    }

    attempts++;
  }

  // After max attempts, return a position anyway (fallback)
  // Place it in a grid-like pattern based on number of existing memories
  const index = existingMemories.length;
  const cols = Math.floor(canvasSize.width / (cardSize.width + padding));
  const row = Math.floor(index / cols);
  const col = index % cols;

  return {
    x: col * (cardSize.width + padding) + padding,
    y: row * (cardSize.height + padding) + padding
  };
}

/**
 * Calculate canvas dimensions based on viewport
 * @param {number} viewportWidth - Width of viewport
 * @param {number} viewportHeight - Height of viewport
 * @param {number} multiplier - Size multiplier (default: 1.5 for 50% extra space)
 * @returns {object} { width, height } canvas dimensions
 */
export function calculateCanvasDimensions(viewportWidth, viewportHeight, multiplier = 1.5) {
  return {
    width: viewportWidth * multiplier,
    height: viewportHeight * multiplier
  };
}

/**
 * Estimate memory card height based on content
 * (Used for better collision detection)
 * @param {object} memory - Memory object
 * @returns {number} Estimated height in pixels
 */
export function estimateCardHeight(memory) {
  const baseHeight = 100; // Base card height with padding
  const titleHeight = memory.title ? 25 : 0;
  const contentHeight = memory.content ? Math.min(memory.content.length / 3, 80) : 20;
  const hashtagHeight = memory.hashtags && memory.hashtags.length > 0 ? 25 : 0;

  return baseHeight + titleHeight + contentHeight + hashtagHeight;
}
