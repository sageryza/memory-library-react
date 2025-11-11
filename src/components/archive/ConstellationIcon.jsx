import React, { forwardRef } from 'react';
import constellationIcon from '../../assets/constellation.svg';

/**
 * ConstellationIcon - Icon that indicates a memory has connections
 * Shows in the top-right corner of memory cards with a glowing effect
 * Uses the same icon as the Constellation Mode button in ConspiracyBoard
 */
const ConstellationIcon = forwardRef(({ onClick, className = '' }, ref) => {
  return (
    <img
      ref={ref}
      src={constellationIcon}
      alt="Constellation"
      width="20"
      height="20"
      className={`constellation-icon ${className}`}
      onClick={onClick}
      title="View connections"
    />
  );
});

ConstellationIcon.displayName = 'ConstellationIcon';

export default ConstellationIcon;
