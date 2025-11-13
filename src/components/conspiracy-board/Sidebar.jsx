import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import MemoryCard from '../shared/MemoryCard'
import AdvancedSearch from '../shared/AdvancedSearch'
import SearchInput from '../shared/SearchInput'

// TODO: Add right-click context menu to edit memories in sidebar
// Currently only double-click opens edit modal
// Should add onContextMenu handler to show context menu with "Edit Memory" option
// See ConspiracyBoard.jsx:1423-1429 for example implementation
function DraggableMemoryCard({ memory, onDoubleClick, formatTitleForDisplay, isSimplified }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: memory.id,
    data: memory,
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined

  const handleDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDoubleClick(memory)
  }

  // TODO: Add handleContextMenu function here
  // const handleContextMenu = (e) => {
  //   e.preventDefault()
  //   // Show context menu with edit option
  // }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable-memory ${isDragging ? 'dragging' : ''}`}
      onDoubleClick={handleDoubleClick}
      // TODO: Add onContextMenu={handleContextMenu}
    >
      <MemoryCard
        memory={memory}
        isStackedView={isSimplified}
        formatTitleForDisplay={formatTitleForDisplay}
      />
    </div>
  )
}

export default function Sidebar({
  memories,
  droppedMemories = [],
  onRandomlyPlaceMemory,
  showSearch = false,
  formatTitleForDisplay,
  isSimplified
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [filteredByAdvanced, setFilteredByAdvanced] = useState(null)

  // First filter out memories that are already on the canvas
  const droppedMemoryIds = new Set(droppedMemories.map(m => m.id))
  const availableMemories = memories.filter(memory => !droppedMemoryIds.has(memory.id))

  // Apply advanced filter if active, otherwise use search filter
  let filteredMemories
  if (filteredByAdvanced) {
    // Use advanced search results, but still exclude dropped memories
    filteredMemories = filteredByAdvanced.filter(memory => !droppedMemoryIds.has(memory.id))
  } else {
    // Use regular search
    filteredMemories = availableMemories.filter(memory => {
      const searchLower = searchTerm.toLowerCase()
      return (
        (memory.title || '').toLowerCase().includes(searchLower) ||
        (memory.content || '').toLowerCase().includes(searchLower) ||
        (memory.hashtags || []).some(tag => tag.toLowerCase().includes(searchLower))
      )
    })
  }

  return (
    <div className="sidebar">
      {/* Search Section - Only render when showSearch is true */}
      {showSearch && (
        <div className="sidebar-search">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            onToggleAdvanced={() => setShowAdvancedSearch(!showAdvancedSearch)}
          />

          {/* Advanced Search Panel - Inline */}
          <AdvancedSearch
            isOpen={showAdvancedSearch}
            memories={memories}
            onFilter={(filtered) => {
              setFilteredByAdvanced(filtered)
              if (filtered) {
                setSearchTerm('') // Clear regular search when using advanced
              }
            }}
          />
        </div>
      )}

      <div className="memory-list">
        {filteredMemories.length === 0 ? (
          <p className="empty-state">
            {searchTerm ? 'No memories match your search' : 'No memories found'}
          </p>
        ) : (
          filteredMemories.map(memory => (
            <DraggableMemoryCard
              key={memory.id}
              memory={memory}
              onDoubleClick={onRandomlyPlaceMemory}
              formatTitleForDisplay={formatTitleForDisplay}
              isSimplified={isSimplified}
            />
          ))
        )}
      </div>
    </div>
  )
}