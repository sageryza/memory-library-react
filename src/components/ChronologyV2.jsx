import { useState, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useDroppable, useDraggable, pointerWithin } from '@dnd-kit/core';
import { Library } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChronologyStateV2 } from '../hooks/useChronologyStateV2';
import useLibraries from '../hooks/useLibraries';
import useLibraryFilter from '../hooks/useLibraryFilter';
import Header from './shared/Header';
import SidebarWrapper from './shared/Sidebar';
import TabbedSidebar from './shared/TabbedSidebar';
import MemoryCard from './shared/MemoryCard';
import { ensureStringId } from '../utils/generateId';
import './ChronologyV2.css';

// Strip HTML tags from content
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Draggable memory card for sidebar
function DraggableSidebarCard({ memory }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `sidebar-${memory.id}`,
    data: { memory, source: 'sidebar' },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable-memory ${isDragging ? 'dragging' : ''}`}
    >
      <MemoryCard memory={memory} />
    </div>
  );
}

// Timeline card - draggable with drop indicators
function TimelineCard({ memory, dropIndicator }) {
  const cardRef = useRef(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `timeline-${memory.id}`,
    data: { memory, source: 'timeline' },
  });

  const combinedRef = (node) => {
    cardRef.current = node;
    setNodeRef(node);
  };

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 1000,
  } : undefined;

  const showLeftIndicator = dropIndicator?.id === memory.id && dropIndicator?.side === 'left';
  const showRightIndicator = dropIndicator?.id === memory.id && dropIndicator?.side === 'right';

  return (
    <div
      ref={combinedRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`timeline-card ${isDragging ? 'dragging' : ''}`}
      data-memory-id={memory.id}
    >
      <div className={`drop-indicator left ${showLeftIndicator ? 'active' : ''}`} />
      <div className={`drop-indicator right ${showRightIndicator ? 'active' : ''}`} />

      <div className="timeline-card-content-wrapper">
        <div className="timeline-card-title">{memory.title}</div>
        {memory.content && (
          <div className="timeline-card-content">{stripHtml(memory.content)}</div>
        )}
        {memory.hashtags?.length > 0 && (
          <div className="timeline-card-hashtags">
            {memory.hashtags.map((tag, i) => (
              <span key={i} className="hashtag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The timeline with continuous base line
function Timeline({ memories, dropIndicator }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'timeline-dropzone',
  });

  return (
    <div className="timeline-area">
      <div
        ref={setNodeRef}
        className={`timeline-container ${isOver ? 'drag-over' : ''}`}
      >
        {/* Cards sit above the line */}
        <div className="timeline-cards">
          {memories.map((memory) => (
            <TimelineCard
              key={memory.id}
              memory={memory}
              dropIndicator={dropIndicator}
            />
          ))}
        </div>

        {/* Empty state text */}
        {memories.length === 0 && (
          <div className="timeline-empty-text">
            Drag memories here to build your timeline
          </div>
        )}
      </div>

      {/* Continuous timeline line - always visible */}
      <div className="timeline-base" />
    </div>
  );
}

// Droppable sidebar wrapper - allows dropping timeline cards back to sidebar
function DroppableSidebarArea({ children, isOver }) {
  const { setNodeRef } = useDroppable({
    id: 'sidebar-dropzone',
  });

  return (
    <div
      ref={setNodeRef}
      className={`sidebar-drop-area ${isOver ? 'drag-over' : ''}`}
      style={{ height: '100%' }}
    >
      {children}
    </div>
  );
}

// Sidebar content with memory list
function SidebarMemoryList({ memories, searchTerm, setSearchTerm }) {
  const filteredMemories = useMemo(() => {
    if (!searchTerm) return memories;
    const lower = searchTerm.toLowerCase();
    return memories.filter(m =>
      (m.title || '').toLowerCase().includes(lower) ||
      (m.content || '').toLowerCase().includes(lower) ||
      (m.hashtags || []).some(t => t.toLowerCase().includes(lower))
    );
  }, [memories, searchTerm]);

  return (
    <div className="sidebar-memory-list">
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search memories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="sidebar-search-input"
        />
      </div>
      <div className="memory-list">
        {filteredMemories.length === 0 ? (
          <p className="empty-state">
            {searchTerm ? 'No memories match your search' : 'All memories are on the timeline'}
          </p>
        ) : (
          filteredMemories.map(memory => (
            <DraggableSidebarCard key={memory.id} memory={memory} />
          ))
        )}
      </div>
    </div>
  );
}

export default function ChronologyV2({ memories = [], memoriesLoading }) {
  const { user } = useAuth();
  const { timelineIds, setTimelineIds, loading: stateLoading } = useChronologyStateV2(user?.uid);
  const { libraries, getLibraryMemories } = useLibraries(user?.uid);

  // Library filter hook for sidebar
  const {
    selectedLibraryId,
    filteredMemories: libraryFilteredMemories,
    selectLibrary
  } = useLibraryFilter(libraries, memories, getLibraryMemories);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDragData, setActiveDragData] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null);
  const [isOverSidebar, setIsOverSidebar] = useState(false);

  // Convert memories to a map for quick lookup
  const memoriesMap = useMemo(() => {
    const map = new Map();
    memories.forEach(m => map.set(ensureStringId(m.id), m));
    return map;
  }, [memories]);

  // Get timeline memories in order
  const timelineMemories = useMemo(() => {
    return timelineIds
      .map(id => memoriesMap.get(ensureStringId(id)))
      .filter(Boolean);
  }, [timelineIds, memoriesMap]);

  // Get sidebar memories (not on timeline, filtered by selected library)
  const sidebarMemories = useMemo(() => {
    const timelineIdSet = new Set(timelineIds.map(id => ensureStringId(id)));
    return libraryFilteredMemories.filter(m => !timelineIdSet.has(ensureStringId(m.id)));
  }, [libraryFilteredMemories, timelineIds]);

  // Handle drag start
  const handleDragStart = (event) => {
    const { active } = event;
    setActiveDragData(active.data.current);
  };

  // Handle drag move - calculate drop indicator position
  const handleDragMove = (event) => {
    if (!activeDragData) return;

    // Get the pointer position from the event
    const { active, over } = event;

    // Track if we're over the sidebar
    setIsOverSidebar(over?.id === 'sidebar-dropzone');

    // If not over the timeline, clear indicator
    if (!over || over.id !== 'timeline-dropzone') {
      setDropIndicator(null);
      return;
    }

    // Find which card we're over by checking pointer position
    const pointerX = event.activatorEvent?.clientX + (event.delta?.x || 0);

    // Find all timeline cards and check which one we're over
    const cards = document.querySelectorAll('.timeline-card[data-memory-id]');
    let foundIndicator = null;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const memoryId = card.getAttribute('data-memory-id');

      if (pointerX >= rect.left && pointerX <= rect.right) {
        const midpoint = rect.left + rect.width / 2;
        const side = pointerX < midpoint ? 'left' : 'right';
        foundIndicator = { id: memoryId, side };
        break;
      }
    }

    setDropIndicator(foundIndicator);
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;
    const currentDropIndicator = dropIndicator;

    setActiveDragData(null);
    setDropIndicator(null);
    setIsOverSidebar(false);

    if (!over) return;

    const dragData = active.data.current;
    const memory = dragData?.memory;
    if (!memory) return;

    const memoryId = ensureStringId(memory.id);

    // Dropping timeline card onto sidebar - remove from timeline
    if (dragData.source === 'timeline' && over.id === 'sidebar-dropzone') {
      const newIds = timelineIds.filter(id => ensureStringId(id) !== memoryId);
      setTimelineIds(newIds);
      return;
    }

    // Dropping from sidebar
    if (dragData.source === 'sidebar') {
      if (currentDropIndicator) {
        // Insert at specific position
        const targetIndex = timelineIds.findIndex(
          id => ensureStringId(id) === ensureStringId(currentDropIndicator.id)
        );

        if (targetIndex !== -1) {
          const newIds = [...timelineIds];
          const insertIndex = currentDropIndicator.side === 'left' ? targetIndex : targetIndex + 1;
          newIds.splice(insertIndex, 0, memoryId);
          setTimelineIds(newIds);
          return;
        }
      }

      // No indicator - add to end
      if (over.id === 'timeline-dropzone') {
        const newIds = [...timelineIds, memoryId];
        setTimelineIds(newIds);
      }
    }

    // Reordering within timeline
    if (dragData.source === 'timeline' && currentDropIndicator) {
      const fromIndex = timelineIds.findIndex(id => ensureStringId(id) === memoryId);
      const toIndex = timelineIds.findIndex(
        id => ensureStringId(id) === ensureStringId(currentDropIndicator.id)
      );

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const newIds = [...timelineIds];
        newIds.splice(fromIndex, 1);
        const insertIndex = currentDropIndicator.side === 'left' ? toIndex : toIndex + 1;
        const adjustedIndex = fromIndex < toIndex ? insertIndex - 1 : insertIndex;
        newIds.splice(adjustedIndex, 0, memoryId);
        setTimelineIds(newIds);
      }
    }
  };

  // Helper to get library memory count
  const getLibraryMemoryCount = (libraryId) => {
    return getLibraryMemories(libraryId, memories).length;
  };

  // Loading state
  if (memoriesLoading || stateLoading) {
    return (
      <div className="chronology-v2">
        <Header centerContent={<h2 className="header-title">Chronology</h2>} />
        <div className="loading-state">Loading...</div>
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="chronology-v2">
        <Header centerContent={<h2 className="header-title">Chronology</h2>} />

        <div className="chronology-main">
          <Timeline
            memories={timelineMemories}
            dropIndicator={activeDragData ? dropIndicator : null}
          />

          <SidebarWrapper isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}>
            <DroppableSidebarArea isOver={isOverSidebar}>
              <TabbedSidebar
                showSearchToggle={false}
                defaultTabIndex={0}
                // Library filtering props - TabbedSidebar handles Libraries tab internally
                libraries={libraries}
                selectedLibraryId={selectedLibraryId}
                onLibrarySelect={selectLibrary}
                getLibraryMemoryCount={getLibraryMemoryCount}
                onLibraryNavigate={() => window.location.href = '/libraries'}
                tabs={[
                  {
                    label: 'Memories',
                    icon: <Library size={16} />,
                    content: (
                      <SidebarMemoryList
                        memories={sidebarMemories}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                      />
                    )
                  }
                ]}
              />
            </DroppableSidebarArea>
          </SidebarWrapper>
        </div>

        <DragOverlay>
          {activeDragData?.memory && (
            <div className="drag-overlay-card">
              <div className="timeline-card-content-wrapper">
                <div className="timeline-card-title">{activeDragData.memory.title}</div>
                {activeDragData.memory.content && (
                  <div className="timeline-card-content">{stripHtml(activeDragData.memory.content)}</div>
                )}
                {activeDragData.memory.hashtags?.length > 0 && (
                  <div className="timeline-card-hashtags">
                    {activeDragData.memory.hashtags.map((tag, i) => (
                      <span key={i} className="hashtag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
