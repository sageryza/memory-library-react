import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plus, Minus, Edit2, Filter, Check, Tag, Trash2, CheckSquare, Library, Pencil, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MasonryLayout from 'masonry-layout';
import { DndContext, DragOverlay, pointerWithin, closestCenter } from '@dnd-kit/core';
import useLibraries from '../../hooks/useLibraries';
import useSimplifyView from '../../hooks/useSimplifyView';
import { usePlaygrounds } from '../../hooks/usePlaygrounds';
import { getLockedMemoryIds } from '../../utils/getLockedMemoryIds';
import LibrarySidebar, { LibraryCard } from './LibrarySidebar';
import MemoryModal from '../shared/MemoryModal';
import AdvancedSearch from '../shared/AdvancedSearch';
import ArchiveMemoryCard from './ArchiveMemoryCard';
import PlaygroundModal from '../playgrounds/PlaygroundModal';
import Header from '../shared/Header';
import LibraryIcon from '../shared/LibraryIcon';
import TabbedSidebar from '../shared/TabbedSidebar';
import SidebarContainer from '../shared/Sidebar';
import ToolRail from '../shared/ToolRail';
import ContextMenu from '../shared/ContextMenu';
import { useConfirm } from '../../contexts/ConfirmContext';
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
  // Default the sidebar closed on small screens, where it opens as an overlay
  // drawer instead of a layout-squeezing panel.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [draggedMemoryIds, setDraggedMemoryIds] = useState([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [filteredByAdvanced, setFilteredByAdvanced] = useState(null);
  // Boolean hashtag filtering: array of { tag, operator } objects
  // First tag has no operator (nothing to combine with), subsequent tags have 'AND' or 'OR'
  const [selectedHashtags, setSelectedHashtags] = useState([]);
  const [currentLibrary, setCurrentLibrary] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [memoryContextMenu, setMemoryContextMenu] = useState(null);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [currentPlaygroundId, setCurrentPlaygroundId] = useState(null);
  const [dragOverLibraryId, setDragOverLibraryId] = useState(null);
  const [hashtagModalMode, setHashtagModalMode] = useState(null); // 'add' | 'remove' | null
  const [hashtagDropdownOpen, setHashtagDropdownOpen] = useState(false);
  const [newHashtagInput, setNewHashtagInput] = useState('');

  // Masonry ref and instance
  const masonryContainerRef = useRef(null);
  const masonryInstanceRef = useRef(null);

  // On phones the JS masonry yields a single column anyway, but still absolutely
  // positions every card and re-lays-out on each resize (the mobile address bar
  // showing/hiding fires it) — so cards visibly jump around. Below this width we
  // skip masonry entirely and let CSS stack the cards in a stable column.
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Libraries hook
  const {
    libraries,
    loading: librariesLoading,
    createLibrary,
    updateLibrary,
    addMemoryToLibrary,
    getLibraryMemories
  } = useLibraries(userId);

  // Playgrounds hook
  const { createPlayground } = usePlaygrounds(userId);

  // Confirm dialog hook
  const { confirm } = useConfirm();

  // Simplify view hook
  const {
    isSimplified,
    toggleSimplify,
    processInputTitle,
    formatTitleForDisplay,
  } = useSimplifyView();

  // Navigation hook
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle library URL parameter (from Libraries page "Enter" action)
  useEffect(() => {
    const libraryId = searchParams.get('library');
    if (libraryId && libraries.length > 0) {
      const library = libraries.find(lib => lib.id === libraryId);
      if (library) {
        setCurrentLibrary(library);
        setSelectedHashtags([]);
        setSearchQuery('');
        // Clear the URL param after applying
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, libraries, setSearchParams]);

  // Filter memories
  useEffect(() => {
    // Use advanced search results if available (check for null specifically)
    if (filteredByAdvanced !== null) {
      setFilteredMemories(filteredByAdvanced);
      return;
    }

    let filtered = [...memories];

    // Apply locked library filtering
    // Only filter out locked memories when NOT viewing any specific library
    // When viewing a library (locked or unlocked), show all its memories
    if (!currentLibrary) {
      const lockedMemoryIds = getLockedMemoryIds(libraries, memories);
      if (lockedMemoryIds.size > 0) {
        filtered = filtered.filter(memory => !lockedMemoryIds.has(String(memory.id)));
      }
    }

    // If viewing a specific library (including locked ones), filter to only that library's memories
    if (currentLibrary) {
      const libraryMemories = getLibraryMemories(currentLibrary.id, memories);
      const libraryMemoryIds = new Set(libraryMemories.map(m => String(m.id)));
      filtered = filtered.filter(memory => libraryMemoryIds.has(String(memory.id)));
    }


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
  }, [searchQuery, memories, filteredByAdvanced, selectedHashtags, libraries, currentLibrary]);

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

  // Handle right-click on memory card
  const handleMemoryContextMenu = (e, memory) => {
    e.preventDefault();
    setMemoryContextMenu({
      x: e.clientX,
      y: e.clientY,
      memory
    });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClick);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClick);
      };
    }
  }, [contextMenu]);

  // Close hashtag dropdown on outside click
  useEffect(() => {
    if (hashtagDropdownOpen) {
      const handleClick = () => setHashtagDropdownOpen(false);
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClick);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClick);
      };
    }
  }, [hashtagDropdownOpen]);

  // Initialize masonry layout (only once)
  useEffect(() => {
    return () => {
      // Cleanup on unmount only
      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.destroy();
        masonryInstanceRef.current = null;
      }
    };
  }, []);

  // Calculate optimal column width to fill container
  const calculateColumnWidth = useCallback(() => {
    if (!masonryContainerRef.current) return 280;

    // Get container's padding
    const style = window.getComputedStyle(masonryContainerRef.current);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;

    // Content width is offsetWidth minus padding
    const contentWidth = masonryContainerRef.current.offsetWidth - paddingLeft - paddingRight;

    const gutter = 15;
    const minColumnWidth = 250;
    const maxColumnWidth = 350;

    // Calculate how many columns fit
    const columns = Math.max(1, Math.floor((contentWidth + gutter) / (minColumnWidth + gutter)));

    // Calculate column width to fill space evenly
    const columnWidth = Math.floor((contentWidth - (gutter * (columns - 1))) / columns);

    return Math.min(maxColumnWidth, Math.max(minColumnWidth, columnWidth));
  }, []);

  // Recalculate masonry when sidebar toggles or container resizes
  useEffect(() => {
    if (!masonryContainerRef.current || isSimplified || isMobile) return;

    const initMasonry = () => {
      if (!masonryContainerRef.current) return;

      const columnWidth = calculateColumnWidth();

      // Update sizer width
      const sizer = masonryContainerRef.current.querySelector('.masonry-sizer');
      if (sizer) {
        sizer.style.width = `${columnWidth}px`;
      }

      // Update all item widths
      const items = masonryContainerRef.current.querySelectorAll('.memory-item');
      items.forEach(item => {
        item.style.width = `${columnWidth}px`;
      });

      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.destroy();
      }

      masonryInstanceRef.current = new MasonryLayout(masonryContainerRef.current, {
        itemSelector: '.memory-item',
        columnWidth: '.masonry-sizer',
        gutter: 15,
        transitionDuration: '0.2s'
      });
    };

    // Small delay to let CSS transitions complete
    const timeoutId = setTimeout(initMasonry, 150);

    // Also observe for window resize
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      setTimeout(initMasonry, 100);
    });

    resizeObserver.observe(masonryContainerRef.current);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isSimplified, isMobile, calculateColumnWidth, sidebarCollapsed]);

  // Update masonry when items or view mode changes
  useEffect(() => {
    // Only initialize for non-simplified, non-mobile view
    if (isSimplified || isMobile || !masonryContainerRef.current) {
      // Destroy masonry when switching to simplified/mobile (stable CSS column)
      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.destroy();
        masonryInstanceRef.current = null;
      }
      return;
    }

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (!masonryContainerRef.current) return;

      const columnWidth = calculateColumnWidth();

      // Update sizer width
      const sizer = masonryContainerRef.current.querySelector('.masonry-sizer');
      if (sizer) {
        sizer.style.width = `${columnWidth}px`;
      }

      // Update all item widths
      const items = masonryContainerRef.current.querySelectorAll('.memory-item');
      items.forEach(item => {
        item.style.width = `${columnWidth}px`;
      });

      // Initialize masonry if not already done
      if (!masonryInstanceRef.current) {
        masonryInstanceRef.current = new MasonryLayout(masonryContainerRef.current, {
          itemSelector: '.memory-item',
          columnWidth: '.masonry-sizer',
          gutter: 15,
          transitionDuration: '0.2s'
        });
      } else {
        // Re-layout when items change
        masonryInstanceRef.current.reloadItems();
        masonryInstanceRef.current.layout();
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [filteredMemories, isSimplified, isMobile, calculateColumnWidth]);

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

    const confirmed = await confirm({
      title: 'Delete Memories',
      message: `Delete ${selectedIds.size} selected ${selectedIds.size === 1 ? 'memory' : 'memories'}?`,
      confirmText: 'Delete',
      danger: true
    });

    if (!confirmed) return;
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
  };

  // Bulk hashtag management
  const handleBulkAddHashtag = async (hashtag) => {
    if (!hashtag.trim()) return;

    const normalized = hashtag.trim().startsWith('#')
      ? hashtag.trim().toLowerCase()
      : `#${hashtag.trim().toLowerCase()}`;

    try {
      for (const id of selectedIds) {
        const memory = memories.find(m => m.id === id);
        if (memory && !memory.hashtags?.includes(normalized)) {
          await updateMemory(id, {
            hashtags: [...(memory.hashtags || []), normalized]
          });
        }
      }
      setHashtagModalMode(null);
      setNewHashtagInput('');
    } catch (error) {
      console.error('Error adding hashtag to memories:', error);
      alert('Failed to add hashtag to some memories.');
    }
  };

  const handleBulkRemoveHashtag = async (hashtag) => {
    try {
      for (const id of selectedIds) {
        const memory = memories.find(m => m.id === id);
        if (memory?.hashtags?.includes(hashtag)) {
          await updateMemory(id, {
            hashtags: memory.hashtags.filter(t => t !== hashtag)
          });
        }
      }
      setHashtagModalMode(null);
    } catch (error) {
      console.error('Error removing hashtag from memories:', error);
      alert('Failed to remove hashtag from some memories.');
    }
  };

  const getSelectedMemoriesHashtags = () => {
    const tags = new Set();
    for (const id of selectedIds) {
      const memory = memories.find(m => m.id === id);
      memory?.hashtags?.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
  };

  // Library sidebar functions
  const getLibraryMemoryCount = (libraryId) => {
    const libraryMemories = getLibraryMemories(libraryId, memories);
    return libraryMemories.length;
  };

  const handleMemoryDropToLibrary = async (libraryId, memoryIds) => {
    // Use passed memoryIds instead of state to avoid stale state issues
    if (!memoryIds || memoryIds.length === 0) return;

    console.log('Dropping memories to library:', { libraryId, memoryIds });

    try {
      // Get the library and its current memory IDs
      const library = libraries.find(lib => lib.id === libraryId);
      if (!library) {
        console.error('Library not found:', libraryId);
        return;
      }

      const currentIds = library.manualMemoryIds || [];
      // Filter out IDs that are already in the library and remove duplicates
      const uniqueNewIds = [...new Set(memoryIds)]; // Remove duplicates from dragged IDs
      const newIds = uniqueNewIds.filter(id => !currentIds.includes(id));

      console.log('Library update details:', {
        currentCount: currentIds.length,
        draggedCount: memoryIds.length,
        uniqueDraggedCount: uniqueNewIds.length,
        newCount: newIds.length
      });

      if (newIds.length === 0) {
        console.log('All selected memories are already in this library');
        return;
      }

      // Update the library with all new IDs at once
      const updatedIds = [...currentIds, ...newIds];
      await updateLibrary(libraryId, { manualMemoryIds: updatedIds });

      console.log(`Successfully added ${newIds.length} memory(ies) to library`);
    } catch (error) {
      console.error('Error adding memories to library:', error);
    }
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Drag & Drop handlers for @dnd-kit
  const handleDragStart = (event) => {
    const { active } = event;
    const memoryId = active.id;

    // Set dragged memory IDs (use selected IDs if in select mode)
    let idsToSet;
    if (selectMode && selectedIds.has(memoryId)) {
      idsToSet = Array.from(selectedIds);
    } else {
      idsToSet = [memoryId];
    }

    console.log('Starting drag with memories:', {
      draggedId: memoryId,
      selectMode,
      selectedCount: selectedIds.size,
      totalDragging: idsToSet.length,
      ids: idsToSet
    });

    setDraggedMemoryIds(idsToSet);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && over.id.startsWith('library-')) {
      // Extract library ID from the droppable ID
      const libraryId = over.id.replace('library-', '');
      // Pass the current draggedMemoryIds directly to avoid stale state
      handleMemoryDropToLibrary(libraryId, draggedMemoryIds);

      // Clear selection after successful drop if in select mode
      if (selectMode && draggedMemoryIds.length > 1) {
        setSelectedIds(new Set());
      }
    }

    // Clear dragged memory IDs after drop
    setDraggedMemoryIds([]);
    setDragOverLibraryId(null);
  };

  const handleDragOver = (event) => {
    const { over } = event;

    if (over && over.id.startsWith('library-')) {
      const libraryId = over.id.replace('library-', '');
      setDragOverLibraryId(libraryId);
    } else {
      setDragOverLibraryId(null);
    }
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
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className="app-container">
        <div className="main-content-area">
          {/* Header */}
        <Header
        centerContent={
          selectedHashtags.length > 0 ? (
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
          ) : currentLibrary ? (
            <div
              className="current-library-header"
              onClick={handleClearFilter}
              style={{ cursor: 'pointer' }}
            >
              {currentLibrary.name}
            </div>
          ) : (
            <div className="current-library-header">Library</div>
          )
        }
        rightContent={
          <>
            <div className="search-section">
              <div className="search-input-container">
                <input
                  type="text"
                  className={searchQuery ? 'with-clear-btn' : ''}
                  placeholder="Search"
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
                title={isSimplified ? "Narrative View" : "Intuitive View"}
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
              <button className="toolbar-btn" onClick={() => setShowCreateModal(true)} title="Add Memory">
                <svg width="16" height="16" viewBox="0 -1 24 25" fill="none">
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
                <>
                  <div className="tag-dropdown-container">
                    <button
                      className="toolbar-btn"
                      onClick={() => setHashtagDropdownOpen(!hashtagDropdownOpen)}
                      title="Manage Tags"
                    >
                      <Tag size={16} /> Tag
                    </button>
                    {hashtagDropdownOpen && (
                      <div className="tag-dropdown-menu">
                        <div
                          className="tag-dropdown-item"
                          onClick={() => {
                            setHashtagModalMode('add');
                            setHashtagDropdownOpen(false);
                          }}
                        >
                          <Plus size={14} /> Add hashtag
                        </div>
                        <div
                          className="tag-dropdown-item"
                          onClick={() => {
                            setHashtagModalMode('remove');
                            setHashtagDropdownOpen(false);
                          }}
                        >
                          <Minus size={14} /> Remove hashtag
                        </div>
                      </div>
                    )}
                  </div>
                  <button className="toolbar-btn active" onClick={handleBulkDelete}>
                    <Trash2 size={16} /> Delete ({selectedIds.size})
                  </button>
                </>
              )}
            </div>
          </>
        }
      />

      {/* Main Layout - Content + Sidebar */}
      <div className="archive-main-layout">
        {/* Main Content */}
        <div className="archive-content-area">
          <ToolRail
            toolGroups={[
              [
                {
                  icon: <Plus size={20} />,
                  label: 'Add Memory',
                  onClick: () => setShowCreateModal(true)
                }
              ]
            ]}
          />
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
                  onView={setViewingMemory}
                  onHashtagClick={handleHashtagClick}
                  isSelected={selectedIds.has(memory.id)}
                  onSelect={toggleSelection}
                  selectMode={selectMode}
                  isSimplified={isSimplified}
                  formatTitleForDisplay={formatTitleForDisplay}
                  userId={userId}
                  onContextMenu={handleMemoryContextMenu}
                />
              ))}
            </div>
          ) : (
            <div
              ref={masonryContainerRef}
              className={`memories-container masonry-grid ${isMobile ? 'no-masonry' : ''} ${selectMode ? 'select-mode' : ''}`}
            >
              <div className="masonry-sizer"></div>
              {filteredMemories.map(memory => (
                <ArchiveMemoryCard
                  key={memory.id}
                  memory={memory}
                  onView={setViewingMemory}
                  onHashtagClick={handleHashtagClick}
                  isSelected={selectedIds.has(memory.id)}
                  onSelect={toggleSelection}
                  selectMode={selectMode}
                  isSimplified={isSimplified}
                  formatTitleForDisplay={formatTitleForDisplay}
                  userId={userId}
                  onContextMenu={handleMemoryContextMenu}
                />
              ))}
            </div>
          )}
        </div>
        </div>
        </div>

        {/* Backdrop behind the mobile drawer sidebar (hidden on desktop via CSS) */}
        {!sidebarCollapsed && (
          <div className="sidebar-backdrop" onClick={() => setSidebarCollapsed(true)} />
        )}

        {/* Tabbed Sidebar */}
        <SidebarContainer isOpen={!sidebarCollapsed} onToggle={toggleSidebarCollapse}>
          <TabbedSidebar
            showSearchToggle={false}
            defaultTabIndex={0}
            tabs={[
              {
                label: 'Libraries',
                icon: <LibraryIcon size={16} color="currentColor" />,
                onNavigate: () => navigate('/libraries'),
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
                            onClick={() => {
                              // Toggle library selection
                              if (currentLibrary?.id === library.id) {
                                setCurrentLibrary(null); // Deselect if clicking the same library
                              } else {
                                setCurrentLibrary(library); // Select the library
                                setSelectedHashtags([]); // Clear hashtag filters
                                setSearchQuery(''); // Clear search
                              }
                            }}
                            isActive={currentLibrary?.id === library.id}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              },
              {
                label: 'Tags',
                icon: <Tag size={16} />,
                content: (
                  <div className="sidebar-content">
                    {getAllHashtags().length > 0 ? (
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
        </SidebarContainer>

      {/* Modals */}
      <MemoryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleSaveMemory}
        editingMemory={null}
        isSimplified={isSimplified}
      />

      {/* View Memory Modal */}
      <MemoryModal
        isOpen={!!viewingMemory}
        onClose={() => setViewingMemory(null)}
        onSave={handleSaveMemory}
        editingMemory={viewingMemory}
        isSimplified={isSimplified}
        viewMode={true}
      />

      {/* Edit Memory Modal */}
      <MemoryModal
        isOpen={!!editingMemory}
        onClose={() => {
          setEditingMemory(null);
        }}
        onSave={handleSaveMemory}
        editingMemory={editingMemory}
        isSimplified={isSimplified}
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

      {/* Memory Context Menu */}
      {memoryContextMenu && (
        <ContextMenu
          x={memoryContextMenu.x}
          y={memoryContextMenu.y}
          items={[
            {
              label: 'View Memory',
              icon: <Eye size={16} />,
              onClick: () => {
                setViewingMemory(memoryContextMenu.memory);
                setMemoryContextMenu(null);
              }
            },
            {
              label: 'Edit Memory',
              icon: <Pencil size={16} />,
              onClick: () => {
                setEditingMemory(memoryContextMenu.memory);
                setMemoryContextMenu(null);
              }
            },
            {
              label: 'Delete Memory',
              icon: <Trash2 size={16} />,
              onClick: async () => {
                const memory = memoryContextMenu.memory;
                setMemoryContextMenu(null);
                // Strip HTML tags from title for display
                const plainTitle = (memory.title || 'Untitled').replace(/<[^>]*>/g, ' ').trim();
                const confirmed = await confirm({
                  title: 'Delete Memory',
                  message: `Are you sure you want to delete "${plainTitle}"?`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                  danger: true
                });
                if (confirmed) {
                  deleteMemory(memory.id);
                }
              }
            }
          ]}
          onClose={() => setMemoryContextMenu(null)}
        />
      )}

      {/* Bulk Hashtag Modal */}
      {hashtagModalMode && (
        <div className="hashtag-modal-overlay" onClick={() => {
          setHashtagModalMode(null);
          setNewHashtagInput('');
        }}>
          <div className="hashtag-modal" onClick={(e) => e.stopPropagation()}>
            {hashtagModalMode === 'add' ? (
              <>
                <h3>Add Hashtag</h3>
                <p className="hashtag-modal-subtitle">
                  Add to {selectedIds.size} selected {selectedIds.size === 1 ? 'memory' : 'memories'}
                </p>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleBulkAddHashtag(newHashtagInput);
                }}>
                  <input
                    type="text"
                    value={newHashtagInput}
                    onChange={(e) => setNewHashtagInput(e.target.value)}
                    placeholder="Enter hashtag..."
                    autoFocus
                    className="hashtag-input"
                  />
                  <div className="hashtag-modal-actions">
                    <button
                      type="button"
                      className="hashtag-modal-btn cancel"
                      onClick={() => {
                        setHashtagModalMode(null);
                        setNewHashtagInput('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="hashtag-modal-btn confirm"
                      disabled={!newHashtagInput.trim()}
                    >
                      Add
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3>Remove Hashtag</h3>
                <p className="hashtag-modal-subtitle">
                  Remove from {selectedIds.size} selected {selectedIds.size === 1 ? 'memory' : 'memories'}
                </p>
                <div className="hashtag-list">
                  {getSelectedMemoriesHashtags().length === 0 ? (
                    <p className="no-hashtags">No hashtags in selected memories</p>
                  ) : (
                    getSelectedMemoriesHashtags().map((tag) => (
                      <button
                        key={tag}
                        className="hashtag-remove-item"
                        onClick={() => handleBulkRemoveHashtag(tag)}
                      >
                        <span className="hashtag-tag">{tag}</span>
                        <X size={14} />
                      </button>
                    ))
                  )}
                </div>
                <div className="hashtag-modal-actions">
                  <button
                    type="button"
                    className="hashtag-modal-btn cancel"
                    onClick={() => setHashtagModalMode(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Drag Overlay - renders outside overflow:hidden containers */}
      <DragOverlay>
        {draggedMemoryIds.length > 0 && (() => {
          const draggedMemory = memories.find(m => m.id === draggedMemoryIds[0]);
          const title = draggedMemory?.title || 'Memory';
          // Strip HTML tags for plain text display
          const plainTitle = title.replace(/<[^>]*>/g, ' ').trim();
          const displayTitle = plainTitle.length > 40 ? plainTitle.substring(0, 40) + '...' : plainTitle;

          return (
            <div style={{
              background: '#faf8e9',
              border: '1px solid #d9bbc2',
              borderRadius: '8px',
              padding: '16px 20px',
              boxShadow: '0 8px 32px rgba(128, 0, 32, 0.3)',
              cursor: 'grabbing',
              maxWidth: '280px',
              fontFamily: 'Crimson Text, serif'
            }}>
              <div style={{
                fontSize: '15px',
                color: '#2F4F4F',
                lineHeight: 1.3
              }}>
                {displayTitle}
              </div>
              {draggedMemoryIds.length > 1 && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#800020',
                  fontWeight: 'bold'
                }}>
                  +{draggedMemoryIds.length - 1} more
                </div>
              )}
            </div>
          );
        })()}
      </DragOverlay>

    </div>
    </DndContext>
  );
}