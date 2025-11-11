import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ConstellationMiniMap from './ConstellationMiniMap';
import { useMemoryConnections } from '../../hooks/useMemoryConnections';

/**
 * ConstellationTooltip - Floating tooltip showing mini-maps of all boards where memory has connections
 * Uses React Portal to render at body level for proper positioning
 */
export default function ConstellationTooltip({ memoryId, anchorElement, onClose, userId }) {
  const tooltipRef = useRef(null);
  const { getMemoryConnections, navigateToBoard } = useMemoryConnections(userId);
  const connections = getMemoryConnections(memoryId);

  // Position tooltip near anchor element
  useEffect(() => {
    if (!tooltipRef.current || !anchorElement) return;

    const iconRect = anchorElement.getBoundingClientRect();
    const tooltip = tooltipRef.current;

    // Position below the icon, aligned to the right
    tooltip.style.position = 'fixed';
    tooltip.style.top = `${iconRect.bottom + 5}px`;
    tooltip.style.left = `${Math.max(10, iconRect.left - tooltip.offsetWidth + iconRect.width)}px`;
    tooltip.style.zIndex = '999998'; // Increased z-index to ensure tooltip is visible
  }, [anchorElement]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target) &&
        anchorElement &&
        !anchorElement.contains(e.target)
      ) {
        onClose();
      }
    };

    // Delay to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose, anchorElement]);

  if (connections.length === 0) return null;

  const tooltip = (
    <div ref={tooltipRef} className="constellation-tooltip">
      {connections.map((boardData) => (
        <ConstellationMiniMap
          key={boardData.boardId}
          boardData={boardData}
          currentMemoryId={memoryId}
          onClick={() => navigateToBoard(boardData.boardId)}
        />
      ))}
    </div>
  );

  // Render using portal to body
  return createPortal(tooltip, document.body);
}
