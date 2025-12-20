import { useState } from 'react';
import './ToolRail.css';

/**
 * ToolRail - A vertical icon toolbar that expands on hover to show labels.
 * Similar to Adobe Creative Suite apps (Photoshop, Illustrator, etc.)
 *
 * @param {Array} toolGroups - Array of tool groups, each group is an array of tools
 *   Each tool: { icon: ReactNode, label: string, onClick: function, isActive?: boolean, disabled?: boolean }
 * @param {string} position - 'left' or 'right' (default: 'left')
 */
export default function ToolRail({ toolGroups = [], position = 'left' }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Prevent clicks from propagating to canvas
  const handleClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`tool-rail ${position} ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {toolGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="tool-group">
          {group.map((tool, toolIndex) => (
            <button
              key={toolIndex}
              className={`tool-rail-btn ${tool.isActive ? 'active' : ''}`}
              onClick={tool.onClick}
              disabled={tool.disabled}
              title={!isExpanded ? tool.label : undefined}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-label">{tool.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
