import React, { useState, useEffect } from 'react';
import { Search, X, Plus, Edit2, Filter, Check, Tag, Trash2, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Masonry from 'react-masonry-css';
import useLibraries from '../../hooks/useLibraries';
import useSimplifyView from '../../hooks/useSimplifyView';
import { usePlaygrounds } from '../../hooks/usePlaygrounds';
import LibrarySidebar, { LibraryCard } from './LibrarySidebar';
import MemoryModal from '../shared/MemoryModal';
import AdvancedSearch from '../shared/AdvancedSearch';
import ArchiveMemoryCard from './ArchiveMemoryCard';
import PlaygroundModal from '../playgrounds/PlaygroundModal';
import Header from '../shared/Header';
import LibraryIcon from '../shared/LibraryIcon';
import TabbedSidebar from '../shared/TabbedSidebar';
import './LibrarySidebar.css';
import './styles/Archive.css';
import './styles/MemoryCard.css';
import './styles/Constellation.css';
import '../shared/Hashtag.css';
import '../../styles/simplifyView.css';

// Main App Component
export default function Archive({ memories = [], memoriesLoading, addMemory, updateMemory, deleteMemory, userId }) {
  const [filteredMemories, setFilteredMemories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingMemory, setViewingMemory] = useState(null);
  const [editingMemory, setEditingMemory] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draggedMemoryIds, setDraggedMemoryIds] = useState([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [filteredByAdvanced, setFilteredByAdvanced] = useState(null);
  // Boolean hashtag filtering: array of { tag, operator } objects
  // First tag has no operator (nothing to combine with), subsequent tags have 'AND' or 'OR'
  const [selectedHashtags, setSelectedHashtags] = useState([]);
  const [currentLibrary, setCurrentLibrary] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [currentPlaygroundId, setCurrentPlaygroundId] = useState(null);
  const [dragOverLibraryId, setDragOverLibraryId] = useState(null);
  const [tagsExpanded, setTagsExpanded] = useState(true);

  // Libraries hook
  const {
    libraries,
    loading: librariesLoading,
    createLibrary,
    addMemoryToLibrary,
    getLibraryMemories
  } = useLibraries(userId);

  // Playgrounds hook
  const { createPlayground } = usePlaygrounds(userId);

  // Simplify view hook
  const {
    isSimplified,
    toggleSimplify,
    processInputTitle,
    formatTitleForDisplay,
  } = useSimplifyView();

  // Filter memories
  useEffect(() => {
    // Use advanced search results if available (check for null specifically)
    if (filteredByAdvanced !== null) {
      setFilteredMemories(filteredByAdvanced);
      return;
    }

    let filtered = [...memories];

    // Apply hashtag boolean filtering
    if (selectedHashtags.length > 0) {
      filtered = filtered.filter(memory => {
        if (!memory.hashtags || memory.hashtags.length === 0) {
          return false; // No hashtags means it can't match
        }

        // Normalize memory hashtags (ensure they start with #)
        const memoryTags = memory.hashtags.map(tag =>
          tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`
        );

        // Process groups of tags connected by the same operator
        // Start with the first tag (which has no operator)
        let currentResult = memoryTags.includes(selectedHashtags[0].tag.toLowerCase());

        for (let i = 1; i < selectedHashtags.length; i++) {
          const { tag, operator } = selectedHashtags[i];
          const hasTag = memoryTags.includes(tag.toLowerCase());

          if (operator === 'AND') {
            currentResult = currentResult && hasTag;
          } else if (operator === 'OR') {
            currentResult = currentResult || hasTag;
          }
        }

        return currentResult;
      });
    }

    // Apply text search filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(memory => {
        const titleMatch = (memory.title || '').toLowerCase().includes(query);
        const contentMatch = (memory.content || '').toLowerCase().includes(query);
        const hashtagMatch = memory.hashtags?.some(tag =>
          tag.toLowerCase().includes(query.replace('#', ''))
        );
        return titleMatch || contentMatch || hashtagMatch;
      });
    }

    setFilteredMemories(filtered);
  }, [searchQuery, memories, filteredByAdvanced, selectedHashtags]);

  const handleSaveMemory = async (memories, isEditing) => {
    try {
      if (isEditing) {
        // Editing existing memory
        const memory = memories[0]; // Only one memory when editing
        // Extract ID separately from the memory data
        const { id: memoryId, ...memoryData } = memory;
        // Process title: convert commas to bullets
        const processedMemory = {
          ...memoryData,
          title: processInputTitle(memory.title)
        };
        await updateMemory(memoryId, processedMemory);
        setEditingMemory(null);
        setViewingMemory(null);
      } else {
        // Creating new memory/memories
        for (const memory of memories) {
          // Remove any 'id' field to prevent duplicate IDs
          const { id, ...memoryWithoutId } = memory;
          // Process title: convert commas to bullets
          const processedMemory = {
            ...memoryWithoutId,
            title: processInputTitle(memory.title)
          };
          await addMemory(processedMemory);
        }
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Error saving memory:', error);
      throw error; // Re-throw to let modal know save failed
    }
  };

  const handleHashtagClick = (hashtag) => {
    // Ensure hashtag starts with #
    const normalizedTag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;

    // Check if hashtag is already selected
    if (selectedHashtags.some(h => h.tag === normalizedTag)) {
      return; // Don't add duplicates
    }

    // Add hashtag with default 'AND' operator (for all tags except the first)
    setSelectedHashtags(prev => [
      ...prev,
      { tag: normalizedTag, operator: prev.length === 0 ? null : 'AND' }
    ]);

    setCurrentLibrary(null); // Clear library filter when hashtag is selected
    setSearchQuery(''); // Clear search query when using hashtag filters
  };

  const handleToggleOperator = (index) => {
    // Toggle between AND and OR for a specific hashtag
    setSelectedHashtags(prev => prev.map((h, i) =>
      i === index
        ? { ...h, operator: h.operator === 'AND' ? 'OR' : 'AND' }
        : h
    ));
  };

  const handleRemoveHashtag = (index) => {
    setSelectedHashtags(prev => {
      const newTags = prev.filter((_, i) => i !== index);
      // If we removed the first tag, the new first tag should have no operator
      if (newTags.length > 0 && index === 0) {
        newTags[0] = { ...newTags[0], operator: null };
      }
      return newTags;
    });
  };

  const handleClearFilter = () => {
    setSelectedHashtags([]);
    setCurrentLibrary(null);
    setSearchQuery('');
  };

  // Extract all unique hashtags with counts
  const getAllHashtags = () => {
    const hashtagMap = new Map();

    memories.forEach(memory => {
      if (memory.hashtags && Array.isArray(memory.hashtags)) {
        memory.hashtags.forEach(tag => {
          // Normalize hashtag (ensure it starts with #)
          const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
          const count = hashtagMap.get(normalizedTag) || 0;
          hashtagMap.set(normalizedTag, count + 1);
        });
      }
    });

    // Convert to array and sort by count (descending)
    return Array.from(hashtagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  };

  // Calculate font sizes for tag cloud based on frequency
  const getFontSize = (count, allHashtags) => {
    if (allHashtags.length === 0) return 13;

    const counts = allHashtags.map(h => h.count);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);

    // Font size range: 11px (smallest) to 18px (largest)
    const minSize = 11;
    const maxSize = 18;

    // If all tags have same count, use middle size
    if (minCount === maxCount) return 13;

    // Linear scaling based on count
    const ratio = (count - minCount) / (maxCount - minCount);
    return Math.round(minSize + (ratio * (maxSize - minSize)));
  };

  const handleContextMenuAction = (action) => {
    if (!contextMenu) return;

    if (action === 'view-as-board') {
      // Navigate to conspiracy board with hashtag filter and auto-scatter
      window.location.href = `/?hashtag=${encodeURIComponent(contextMenu.hashtag)}&scatter=true`;
    } else if (action === 'view-in-boards') {
      // Navigate to conspiracy board with hashtag filter in sidebar only
      window.location.href = `/?hashtag=${encodeURIComponent(contextMenu.hashtag)}`;
    }
    setContextMenu(null);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleEditFromView = (memory) => {
    setViewingMemory(null);
    setEditingMemory(memory);
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (window.confirm(`Delete ${selectedIds.size} selected memories?`)) {
      try {
        // Use Promise.allSettled to attempt all deletions regardless of individual failures
        const deleteResults = await Promise.allSettled(
          Array.from(selectedIds).map(id =>
            deleteMemory(id)
              .then(() => ({ id, success: true }))
              .catch(error => ({ id, success: false, error }))
          )
        );

        // Separate successful and failed deletions
        const successfulDeletions = [];
        const failedDeletions = [];

        deleteResults.forEach((result) => {
          // Get the memory ID from the result, not by index!
          const memoryId = result.value.id;
          if (result.status === 'fulfilled' && result.value.success) {
            successfulDeletions.push(memoryId);
          } else {
            failedDeletions.push(memoryId);
            console.error(`Failed to delete memory ${memoryId}:`, result.reason || result.value?.error);
          }
        });

        // Update selection to only include failed items
        if (failedDeletions.length > 0) {
          setSelectedIds(new Set(failedDeletions));

          // Show detailed error message
          const message = `Successfully deleted ${successfulDeletions.length} of ${selectedIds.size} memories.\n\n` +
                         `${failedDeletions.length} memories could not be deleted. They remain selected so you can try again.`;
          alert(message);
        } else {
          // All deletions successful
          setSelectedIds(new Set());
          setSelectMode(false);
        }

      } catch (error) {
        console.error('Unexpected error during bulk delete:', error);
        alert('An unexpected error occurred. Please try again.');
      }
    }
  };

  // Library sidebar functions
  const getLibraryMemoryCount = (libraryId) => {
    const libraryMemories = getLibraryMemories(libraryId, memories);
    return libraryMemories.length;
  };

  const handleMemoryDropToLibrary = async (libraryId) => {
    if (draggedMemoryIds.length === 0) return;

    try {
      for (const memoryId of draggedMemoryIds) {
        await addMemoryToLibrary(libraryId, memoryId);
      }
      setDraggedMemoryIds([]);
      alert(`Added ${draggedMemoryIds.length} memory(ies) to library`);
    } catch (error) {
      console.error('Error adding memories to library:', error);
      alert('Failed to add memories to library');
    }
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Drag & Drop handlers
  const handleDragStart = (memoryId) => {
    // Set dragged memory IDs (use selected IDs if in select mode)
    if (selectMode && selectedIds.has(memoryId)) {
      setDraggedMemoryIds(Array.from(selectedIds));
    } else {
      setDraggedMemoryIds([memoryId]);
    }
  };

  const handleDragEnd = () => {
    // Don't clear draggedMemoryIds here - wait for drop to complete
  };

  const handleOpenPlayground = async () => {
    try {
      const newPlayground = await createPlayground({
        name: 'Playground',
        centralHashtag: null,
        description: ''
      });
      setCurrentPlaygroundId(newPlayground.id);
      setPlaygroundOpen(true);
    } catch (error) {
      console.error('Error creating playground:', error);
      alert('Failed to create playground');
    }
  };

  if (memoriesLoading || librariesLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading memories...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        title="Library"
        centerContent={
          (selectedHashtags.length > 0 || currentLibrary) && (
            <>
              {selectedHashtags.length > 0 && (
                <div className="hashtag-filters-display">
                  {selectedHashtags.map((hashtagObj, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && hashtagObj.operator && (
                        <button
                          className="operator-toggle"
                          onClick={() => handleToggleOperator(index)}
                          title={`Click to toggle to ${hashtagObj.operator === 'AND' ? 'OR' : 'AND'}`}
                        >
                          {hashtagObj.operator === 'AND' ? '+' : 'OR'}
                        </button>
                      )}
                      <div
                        className="hashtag-pill"
                        onClick={() => handleRemoveHashtag(index)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            hashtag: hashtagObj.tag
                          });
                        }}
                      >
                        {hashtagObj.tag}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {currentLibrary && (
                <div className="current-library-header">
                  <span onClick={handleClearFilter} style={{ cursor: 'pointer' }}>
                    📚 Library: {currentLibrary.name}
                  </span>
                </div>
              )}
            </>
          )
        }
        rightContent={
          <>
            <div className="search-section">
              <div className="search-input-container">
                <input
                  type="text"
                  className={searchQuery ? 'with-clear-btn' : ''}
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  className={`advanced-search-btn ${searchQuery ? 'with-clear' : ''}`}
                  onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                  title="Advanced search"
                >
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </button>
                {searchQuery && (
                  <button
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={16} />
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
                    setSearchQuery('') // Clear regular search when using advanced
                  }
                }}
                onSaveAsLibrary={async (name, searchLogic) => {
                  await createLibrary({
                    name,
                    description: 'Library created from advanced search',
                    searchLogic,
                    isLocked: false
                  })
                }}
              />
            </div>

            <div className="toolbar-buttons">
              <button
                className="toolbar-btn"
                onClick={handleOpenPlayground}
                title="Playground"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                  <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
                </svg>
              </button>
              <button
                className={`toolbar-btn ${isSimplified ? 'active' : ''}`}
                onClick={toggleSimplify}
                title={isSimplified ? "Normal View" : "Simplified View"}
              >
                {isSimplified ? (
                  // When simplified, show "normal view" icon (grid)
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M1 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2zM1 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7zM1 12a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2z"/>
                  </svg>
                ) : (
                  // When normal, show "simplified view" icon (card with lines)
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13zM1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5V5H1V3.5zM1 6h14v6.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V6z"/>
                    <path d="M2 8.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z"/>
                  </svg>
                )}
              </button>
              <Link to="/libraries" className="toolbar-btn" title="Libraries">
                <LibraryIcon size={16} />
              </Link>
              <button className="toolbar-btn" onClick={() => setShowCreateModal(true)} title="Add Memory">
                <svg width="24" height="24" viewBox="0 -1 24 25" fill="none">
                  {/* Plus sign - longer, moved towards bottom left, thicker */}
                  <line x1="6" y1="10" x2="6" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="0" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  {/* Outer Polaroid frame - narrower sides, moved down 2px */}
                  <rect x="6.5" y="1.5" width="14" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/>
                  {/* Inner square photo area - smaller for more visible border, moved down 2px */}
                  <rect x="9" y="4" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/>
                </svg>
              </button>
              <button
                className={`toolbar-btn ${selectMode ? 'active' : ''}`}
                onClick={toggleSelectMode}
                title="Select Multiple"
              >
                <CheckSquare size={16} />
              </button>
              {selectMode && selectedIds.size > 0 && (
                <button className="toolbar-btn active" onClick={handleBulkDelete}>
                  <Trash2 size={16} /> Delete ({selectedIds.size})
                </button>
              )}
            </div>
          </>
        }
      />

      {/* Main Layout - Content + Sidebar */}
      <div className="archive-main-layout">
        {/* Main Content */}
        <div className="archive-content-area">
          {filteredMemories.length === 0 ? (
            <div className="empty-state">
              <h3>No Memories Found</h3>
              <p>{memories.length === 0 ? 'Start by creating your first memory!' : 'Try adjusting your search filters.'}</p>
              {memories.length === 0 && (
                <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                  Create Memory
                </button>
              )}
            </div>
          ) : isSimplified ? (
            <div className={`memories-container simplify-grid ${selectMode ? 'select-mode' : ''}`}>
              {filteredMemories.map(memory => (
                <ArchiveMemoryCard
                  key={memory.id}
                  memory={memory}
                  onView={setEditingMemory}
                  onHashtagClick={handleHashtagClick}
                  isSelected={selectedIds.has(memory.id)}
                  onSelect={toggleSelection}
                  selectMode={selectMode}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isSimplified={isSimplified}
                  formatTitleForDisplay={formatTitleForDisplay}
                  userId={userId}
                />
              ))}
            </div>
          ) : (
            <Masonry
              breakpointCols={{
                default: 5,
                1600: 4,
                1200: 3,
                768: 2,
                480: 1
              }}
              className={`memories-container ${selectMode ? 'select-mode' : ''}`}
              columnClassName="masonry-column"
            >
              {filteredMemories.map(memory => (
                <ArchiveMemoryCard
                  key={memory.id}
                  memory={memory}
                  onView={setEditingMemory}
                  onHashtagClick={handleHashtagClick}
                  isSelected={selectedIds.has(memory.id)}
                  onSelect={toggleSelection}
                  selectMode={selectMode}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isSimplified={isSimplified}
                  formatTitleForDisplay={formatTitleForDisplay}
                  userId={userId}
                />
              ))}
            </Masonry>
          )}
        </div>

        {/* Tabbed Sidebar */}
        <div className={`sidebar-wrapper ${sidebarCollapsed ? 'closed' : ''}`}>
          <button
            className="sidebar-toggle-tab"
            onClick={toggleSidebarCollapse}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>

          <TabbedSidebar
            showSearchToggle={false}
            defaultTabIndex={0}
            tabs={[
              {
                label: 'Libraries',
                content: (
                  <div className="sidebar-content">
                    <div className="sidebar-libraries-grid">
                      {libraries.length === 0 ? (
                        <div className="empty-state">
                          <p>No libraries yet</p>
                        </div>
                      ) : (
                        libraries.map(library => (
                          <LibraryCard
                            key={library.id}
                            library={library}
                            memoryCount={getLibraryMemoryCount(library.id)}
                            onDrop={(libraryId) => {
                              handleMemoryDropToLibrary(libraryId);
                              setDragOverLibraryId(null);
                            }}
                            onDragOver={(libraryId) => setDragOverLibraryId(libraryId)}
                            onDragLeave={() => setDragOverLibraryId(null)}
                            isDragOver={dragOverLibraryId === library.id}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              },
              {
                label: 'Tags',
                content: (
                  <div className="sidebar-content">
                    {getAllHashtags().length > 0 ? (
                      <div className="sidebar-section">
                        <div
                          className="sidebar-section-header"
                          onClick={() => setTagsExpanded(!tagsExpanded)}
                        >
                          <h3>All Tags</h3>
                          <span className="expand-icon">{tagsExpanded ? '−' : '+'}</span>
                        </div>
                        {tagsExpanded && (
                          <div className="sidebar-tags-cloud">
                            {getAllHashtags().map(({ tag, count }) => {
                              const isSelected = selectedHashtags.some(h => h.tag === tag);
                              const fontSize = getFontSize(count, getAllHashtags());
                              return (
                                <button
                                  key={tag}
                                  className={`hashtag clickable tag-cloud ${isSelected ? 'selected' : ''}`}
                                  onClick={() => handleHashtagClick(tag)}
                                  title={`${count} ${count === 1 ? 'memory' : 'memories'}`}
                                  style={{ fontSize: `${fontSize}px` }}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <p>No tags yet</p>
                      </div>
                    )}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      {/* Modals */}
      <MemoryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleSaveMemory}
        editingMemory={null}
      />

      <MemoryModal
        isOpen={!!editingMemory}
        onClose={() => {
          setEditingMemory(null);
          setViewingMemory(null);
        }}
        onSave={handleSaveMemory}
        editingMemory={editingMemory}
      />

      {/* Playground Modal */}
      {playgroundOpen && currentPlaygroundId && (
        <PlaygroundModal
          isOpen={playgroundOpen}
          onClose={() => setPlaygroundOpen(false)}
          playgroundId={currentPlaygroundId}
          userId={userId}
        />
      )}

      {/* Hashtag Context Menu */}
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
            onClick={() => handleContextMenuAction('view-as-board')}
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
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 2h12v12H2V2z"/>
              <path d="M3 3h10v2H3zm0 4h10v6H3z"/>
            </svg>
            View as Board
          </div>
          <div
            className="hashtag-context-item"
            onClick={() => handleContextMenuAction('view-in-boards')}
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
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 2.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 6a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 6zM3 9.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z"/>
            </svg>
            View in Boards
          </div>
        </div>
      )}
    </div>
  );
}