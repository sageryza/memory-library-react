import React, { forwardRef } from 'react';
import constellationSvg from '../../assets/constellation.svg';

/**
 * ConstellationIcon - SVG icon that indicates a memory has connections
 * Shows in the top-right corner of memory cards with a glowing effect
 * Uses the same constellation.svg as the constellation tab
 */
const ConstellationIcon = forwardRef(({ onClick, className = '' }, ref) => {
  return (
    <img
      ref={ref}
      src={constellationSvg}
      alt="View connections"
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