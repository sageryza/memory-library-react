import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { X, Pencil, Trash2 } from 'lucide-react'
import MemoryCard from '../shared/MemoryCard'
import AdvancedSearch from '../shared/AdvancedSearch'
import SearchInput from '../shared/SearchInput'

function DraggableMemoryCard({ memory, onDoubleClick, onContextMenu, formatTitleForDisplay, isSimplified }) {
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

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, memory)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable-memory ${isDragging ? 'dragging' : ''}`}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
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
  onCloseSearch,
  formatTitleForDisplay,
  isSimplified,
  onEditMemory,
  onDeleteMemory
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [filteredByAdvanced, setFilteredByAdvanced] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  // Handle context menu for sidebar memories
  const handleSidebarContextMenu = (e, memory) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      memory
    })
  }

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null)
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

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
          <div className="sidebar-search-header">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              onToggleAdvanced={() => setShowAdvancedSearch(!showAdvancedSearch)}
            />
            {onCloseSearch && (
              <button
                className="close-search-bar-btn"
                onClick={onCloseSearch}
                title="Close search"
              >
                <X size={18} />
              </button>
            )}
          </div>

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

      <div className={`memory-list ${isSimplified ? 'simplified-grid' : ''}`}>
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
              onContextMenu={handleSidebarContextMenu}
              formatTitleForDisplay={formatTitleForDisplay}
              isSimplified={isSimplified}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="hashtag-context-menu"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            background: '#ffffff',
            border: '1px solid #e0e0e0',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 2000,
            fontFamily: 'Crimson Text, serif',
            fontSize: '14px',
            minWidth: '160px',
            overflow: 'hidden'
          }}
        >
          <div
            className="hashtag-context-item"
            onClick={() => {
              onEditMemory(contextMenu.memory)
              setContextMenu(null)
            }}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              color: '#2F4F4F',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s ease',
              borderBottom: '1px solid #f0f0f0'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f8f8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Pencil size={16} /> Edit Memory
          </div>
          <div
            className="hashtag-context-item"
            onClick={() => {
              onDeleteMemory(contextMenu.memory.id)
              setContextMenu(null)
            }}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              color: '#2F4F4F',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f8f8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Trash2 size={16} /> Delete Memory
          </div>
        </div>
      )}
    </div>
  )
}