import React from 'react'
import Dropdown from '../../../shared/Dropdown'
import { AddMemoryIcon, PlaygroundIcon } from '../../../icons'

export default function ToolsDropdown({
  selectedPin,
  openDropdown,
  setOpenDropdown,
  isConstellationMode,
  handleAddMemory,
  handleStartPlacingPin,
  scatterMemories,
  handleOpenPlayground,
  performUndo,
  performRedo,
  canUndo,
  canRedo
}) {
  return (
    <Dropdown
      className="header-dropdown"
      align="right"
      triggerOnHover={false}
      enableHoverSwitching={!!openDropdown}
      disabled={!!selectedPin}
      isOpen={openDropdown === 'tools'}
      onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'tools' : null)}
      trigger={
        <button className="header-dropdown-btn">
          <span>Tools</span>
        </button>
      }
      items={[
        {
          label: 'Add Memory',
          icon: <AddMemoryIcon color="#666666" />,
          onClick: handleAddMemory,
          disabled: isConstellationMode,
          shortcut: '⇧+N'
        },
        {
          label: 'Place Pin',
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="4" r="3" fill="#dc143c"/>
              <rect x="7.5" y="6.5" width="1" height="7" fill="#999"/>
            </svg>
          ),
          onClick: handleStartPlacingPin,
          disabled: isConstellationMode
        },
        {
          label: 'scatter',
          icon: (
            <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
              <circle cx="4" cy="3" r="1.3"/>
              <circle cx="11.5" cy="2" r="1.3"/>
              <circle cx="2.5" cy="7" r="1.3"/>
              <circle cx="8" cy="8.5" r="1.3"/>
              <circle cx="13.5" cy="10" r="1.3"/>
              <circle cx="6" cy="13" r="1.3"/>
              <circle cx="10.5" cy="14.5" r="1.3"/>
            </svg>
          ),
          onClick: scatterMemories,
          disabled: isConstellationMode
        },
        { separator: true },
        {
          label: 'Playground',
          icon: <PlaygroundIcon color="#666666" />,
          onClick: handleOpenPlayground
        },
        {
          label: 'Undo',
          icon: (
            <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
            </svg>
          ),
          onClick: performUndo,
          disabled: !canUndo || isConstellationMode,
          shortcut: '⌘+Z'
        },
        {
          label: 'Redo',
          icon: (
            <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966a.25.25 0 0 1 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
          ),
          onClick: performRedo,
          disabled: !canRedo || isConstellationMode,
          shortcut: '⌘+⇧+Z'
        }
      ]}
    />
  )
}