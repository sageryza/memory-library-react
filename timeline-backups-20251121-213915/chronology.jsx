import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useChronologyState } from '../hooks/useChronologyState';
import { useAuth } from '../hooks/useAuth';
import { ensureStringId } from '../utils/generateId';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import TabbedSidebar from './shared/TabbedSidebar';
import Sidebar from './conspiracy-board/Sidebar';
import Header from './shared/Header';
import useLibraries from '../hooks/useLibraries';
import { LibraryCard } from './archive/LibrarySidebar';
import MemoryCard from './shared/MemoryCard';
import { formatTitleForDisplay } from '../utils/formatTitleForDisplay';
import './shared/Hashtag.css';
import './archive/LibrarySidebar.css';
import '../styles/simplifyView.css';

const MAX_WIDTH = 250;
const MIN_WIDTH = 60;
const GAP = 0;

export default function Chronology({ memories = [], memoriesLoading }) {
  const { user } = useAuth();
  const { chronologyState, updateChronologyState, loading: chronologyLoading } = useChronologyState(user?.uid);
  const {
    libraries,
    loading: librariesLoading,
    addMemoryToLibrary,
    removeMemoryFromLibrary
  } = useLibraries(user?.uid);

  // Timeline contains memories, gaps, AND ghost segments - ALL participate in scaling
  const [timeline, setTimeline] = useState([
    { id: 'ghost-start', type: 'ghost' },
    { id: 'ghost-end', type: 'ghost' }
  ]);

  const [focusedIndex, setFocusedIndex] = useState(1); // Timeline index (not memory index)
  const [sidebarMemories, setSidebarMemories] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const timelineRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const lastFocusChangeRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const saveTimeoutRef = useRef(null);
  const hasLoadedFromFirebaseRef = useRef(false);
  const lastSavedStateRef = useRef(null);
  const initialLoadCompleteRef = useRef(false);
  const processedPositionsRef = useRef(null); // Track which positions we've processed

  // New state for tabbed sidebar
  const [activeTab, setActiveTab] = useState(0);
  const [currentLibrary, setCurrentLibrary] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);

  // Helper function to generate unique IDs for gaps
  const generateUniqueId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  // Convert Firebase memory format to Chronology format
  const convertMemory = (mem) => ({
    id: ensureStringId(mem.id),  // Ensure ID is always a string
    type: 'memory',
    title: mem.title || 'Untitled',
    text: mem.content || '',
    hashtags: mem.hashtags || []
  });

  // Load initial data from Firebase (FIXED - properly tracks what we've processed)
  useEffect(() => {
    // Must have memories loaded
    if (memoriesLoading) {
      console.log('⏸️ Waiting for memories to load');
      return;
    }

    // Wait for chronology to finish loading from Firebase
    if (chronologyLoading) {
      console.log('⏸️ Waiting for chronology to load from Firebase');
      return;
    }

    // Check if we've already processed this exact positions state
    // Only compare the data we care about (timelineIds and sidebarIds)
    const currentTimelineIds = chronologyState.positions?.timelineIds || [];
    const currentSidebarIds = chronologyState.positions?.sidebarIds || [];
    const currentPositionsKey = JSON.stringify({
      timelineIds: currentTimelineIds,
      sidebarIds: currentSidebarIds
    });

    if (processedPositionsRef.current === currentPositionsKey) {
      console.log('⏸️ Already processed this positions state:', currentPositionsKey);
      return;
    }

    // CRITICAL: Check if this data matches what we last saved
    // If it does, it's just our own save echoing back - don't rebuild!
    if (lastSavedStateRef.current === currentPositionsKey) {
      console.log('⏸️ This is our own saved data echoing back, not rebuilding');
      processedPositionsRef.current = currentPositionsKey; // Mark as processed
      return;
    }

    console.log('🆕 New positions detected, will process:', currentPositionsKey);

    console.log('🎯 LOAD EFFECT - Initializing chronology with state:', chronologyState);
    console.log('🎯 Positions available:', chronologyState.positions);
    console.log('🎯 Has been loaded before:', hasLoadedFromFirebaseRef.current);

    // Get positions (normalized - only one path now)
    const timelineIds = chronologyState.positions?.timelineIds || [];
    const sidebarIds = chronologyState.positions?.sidebarIds || [];

    const hasTimelineData = timelineIds.length > 0;
    const hasSidebarData = sidebarIds.length > 0;

    if (hasTimelineData || hasSidebarData) {
      // RESTORE from Firebase
      console.log('✅ RESTORING FROM FIREBASE:', { timelineIds, sidebarIds });

      const timelineMemories = timelineIds
        .map(id => memories.find(m => m.id === id))
        .filter(Boolean)
        .map(convertMemory);

      const sidebarMems = sidebarIds
        .map(id => memories.find(m => m.id === id))
        .filter(Boolean)
        .map(convertMemory);

      // Find new memories not in saved state
      const allSavedIds = [...timelineIds, ...sidebarIds];
      const newMemories = memories
        .filter(m => !allSavedIds.includes(m.id))
        .map(convertMemory);

      // Rebuild timeline with gaps
      const rebuiltTimeline = [{ id: 'ghost-start', type: 'ghost' }];
      timelineMemories.forEach((mem, idx) => {
        rebuiltTimeline.push(mem);
        if (idx < timelineMemories.length - 1) {
          rebuiltTimeline.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
        }
      });
      rebuiltTimeline.push({ id: 'ghost-end', type: 'ghost' });

      setTimeline(rebuiltTimeline);
      setSidebarMemories([...sidebarMems, ...newMemories]);

      const firstMemoryIndex = rebuiltTimeline.findIndex(item => item.type === 'memory');
      setFocusedIndex(firstMemoryIndex !== -1 ? firstMemoryIndex : 0);

      // Store initial state
      lastSavedStateRef.current = JSON.stringify({
        timeline: timelineMemories.map(m => m.id),
        sidebar: [...sidebarMems, ...newMemories].map(m => m.id)
      });
    } else {
      // FIRST TIME - put all memories in sidebar (confirmed no Firebase data)
      console.log('✅ FIRST TIME LOAD - No saved data, putting all memories in sidebar');
      const converted = memories.map(convertMemory);
      setSidebarMemories(converted);
      setTimeline([
        { id: 'ghost-start', type: 'ghost' },
        { id: 'ghost-end', type: 'ghost' }
      ]);
      setFocusedIndex(0);

      lastSavedStateRef.current = JSON.stringify({
        timeline: [],
        sidebar: converted.map(m => m.id)
      });
    }

    // Mark this positions state as processed
    processedPositionsRef.current = currentPositionsKey;

    // Mark as loaded and enable saves after delay
    if (!hasLoadedFromFirebaseRef.current) {
      hasLoadedFromFirebaseRef.current = true;
      setTimeout(() => {
        initialLoadCompleteRef.current = true;
        console.log('✅ Ready to save changes');
      }, 1000);
    }
  }, [memoriesLoading, chronologyLoading, memories.length, chronologyState.positions]);

  // Save to Firebase with debounce (FIXED dependencies and error handling)
  useEffect(() => {
    console.log('🔍 SAVE EFFECT - Running with checks:', {
      hasLoadedFromFirebase: hasLoadedFromFirebaseRef.current,
      userId: user?.uid,
      chronologyLoading,
      initialLoadComplete: initialLoadCompleteRef.current
    });

    // Safety checks
    if (!hasLoadedFromFirebaseRef.current) {
      console.log('⏸️ SAVE BLOCKED: Not loaded from Firebase yet');
      return;
    }
    if (!user?.uid) {
      console.log('⏸️ SAVE BLOCKED: No user ID');
      return;
    }
    if (chronologyLoading) {
      console.log('⏸️ SAVE BLOCKED: Chronology still loading');
      return;
    }
    if (!initialLoadCompleteRef.current) {
      console.log('⏸️ SAVE BLOCKED: Initial load not complete');
      return;
    }

    const timelineMemoryIds = timeline
      .filter(item => item.type === 'memory')
      .map(item => item.id);

    const sidebarMemoryIds = sidebarMemories.map(mem => mem.id);

    // Create state representation for comparison (must match load effect key format!)
    const currentStateKey = JSON.stringify({
      timelineIds: timelineMemoryIds,
      sidebarIds: sidebarMemoryIds
    });

    // Skip if nothing has changed
    if (lastSavedStateRef.current === currentStateKey) {
      return;
    }

    console.log('State changed, scheduling save...');

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for saving (2 seconds after last change for stability)
    saveTimeoutRef.current = setTimeout(async () => {
      console.log('SAVING TO FIREBASE:', {
        timelineIds: timelineMemoryIds,
        sidebarIds: sidebarMemoryIds
      });

      try {
        await updateChronologyState({
          positions: {
            timelineIds: timelineMemoryIds,
            sidebarIds: sidebarMemoryIds,
            lastUpdated: new Date().toISOString()
          }
        });

        console.log('✅ Save completed successfully');
        lastSavedStateRef.current = currentStateKey;
      } catch (error) {
        console.error('❌ Failed to save chronology state:', error);
        console.error('Error details:', error);
        // Don't update lastSavedStateRef so it will retry on next change
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [timeline, sidebarMemories, user?.uid, chronologyLoading, updateChronologyState]);

  // Filter sidebar memories based on selected library
  const filteredSidebarMemories = currentLibrary
    ? sidebarMemories.filter(memory => {
        const library = libraries.find(lib => lib.id === currentLibrary);
        return library?.memoryIds?.includes(memory.id);
      })
    : sidebarMemories;

  // Handle library selection
  const handleLibrarySelect = (libraryId) => {
    if (currentLibrary === libraryId) {
      setCurrentLibrary(null); // Deselect if clicking same library
    } else {
      setCurrentLibrary(libraryId);
      setActiveTab(0); // Switch to Available Memories tab
    }
  };

  // Handle viewport resizing
  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setViewportWidth(window.innerWidth);
      }, 100);
    };

    setViewportWidth(window.innerWidth);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const getVisibleItemsAndScales = useCallback(() => {
    const SIDEBAR_WIDTH = sidebarOpen ? 300 : 0;
    const PADDING = 40;
    const availableWidth = viewportWidth - SIDEBAR_WIDTH - PADDING;

    let usedWidth = MAX_WIDTH;
    const visibleIndices = [focusedIndex];
    const scales = {
      [focusedIndex]: 1.0
    };

    let leftIndex = focusedIndex - 1;
    let rightIndex = focusedIndex + 1;

    for (let distance = 1; distance <= 5; distance++) {
      let scale;
      if (distance === 1) scale = 0.75;
      else if (distance === 2) scale = 0.55;
      else if (distance === 3) scale = 0.4;
      else scale = 0.25;

      const widthNeeded = MAX_WIDTH * scale + GAP;

      if (leftIndex >= 0) {
        if (usedWidth + widthNeeded <= availableWidth) {
          visibleIndices.unshift(leftIndex);
          scales[leftIndex] = scale;
          usedWidth += widthNeeded;
          leftIndex--;
        }
      }

      if (rightIndex < timeline.length) {
        if (usedWidth + widthNeeded <= availableWidth) {
          visibleIndices.push(rightIndex);
          scales[rightIndex] = scale;
          usedWidth += widthNeeded;
          rightIndex++;
        }
      }

      if ((leftIndex < 0 && rightIndex >= timeline.length) ||
          (usedWidth + (MIN_WIDTH * 2) > availableWidth)) {
        break;
      }
    }

    return {
      startIndex: Math.min(...visibleIndices),
      endIndex: Math.max(...visibleIndices) + 1,
      scales
    };
    // Include timeline in dependencies to recalculate when items are reordered
  }, [focusedIndex, timeline, viewportWidth, sidebarOpen]);

  const { startIndex, endIndex, scales } = getVisibleItemsAndScales();

  const handleItemHover = useCallback((index) => {
    // Allow hover changes even when dragging
    if (index !== focusedIndex) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      const now = Date.now();
      const timeSinceLastChange = now - lastFocusChangeRef.current;
      const cooldownPeriod = 200;

      if (timeSinceLastChange < cooldownPeriod) {
        hoverTimeoutRef.current = setTimeout(() => {
          lastFocusChangeRef.current = Date.now();
          setFocusedIndex(index);
        }, cooldownPeriod - timeSinceLastChange + 50);
      } else {
        hoverTimeoutRef.current = setTimeout(() => {
          lastFocusChangeRef.current = Date.now();
          setFocusedIndex(index);
        }, 50);
      }
    }
  }, [focusedIndex]);

  const handleItemLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  // DND Kit handlers for sidebar memories
  const handleDragStart = (event) => {
    const { active } = event;
    setActiveDragId(active.id);
    setIsDragging(true);

    // Check if dragging from sidebar
    const memoryFromSidebar = sidebarMemories.find(m => m.id === active.id);
    if (memoryFromSidebar) {
      setDraggedItem({
        item: memoryFromSidebar,
        isChunk: false,
        fromSidebar: true
      });
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    setIsDragging(false);

    if (over && draggedItem) {
      // Handle drop on timeline
      if (over.id && over.data?.current?.type === 'timeline-drop-zone') {
        handleTimelineDrop(draggedItem.item, over.data.current.position);
      }
    }

    setDraggedItem(null);
    setDropTarget(null);
  };

  // Handle old-style drag for timeline items (will update this later)
  const handleTimelineDragStart = (e, item, isChunk = false) => {
    setIsDragging(true);
    setDraggedItem({ item, isChunk, fromSidebar: false });
    e.dataTransfer.effectAllowed = isChunk ? 'move' : 'copy';
  };

  const handleTimelineDragEnd = () => {
    setIsDragging(false);
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleDragOver = (e, item = null) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || !item) return;

    // Update focus while dragging to show scaling
    const itemIndex = timeline.findIndex(t => t.id === item.id);
    if (itemIndex !== -1 && itemIndex !== focusedIndex) {
      setFocusedIndex(itemIndex);
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const side = e.clientX < midpoint ? 'left' : 'right';

    setDropTarget({ type: item.type, id: item.id, side });
  };

  const cleanupGaps = (timelineArray) => {
    const cleaned = [...timelineArray];

    for (let i = cleaned.length - 1; i > 0; i--) {
      if (cleaned[i].type === 'gap' && cleaned[i - 1].type === 'gap') {
        cleaned.splice(i, 1);
      }
    }

    const ghostStartIdx = cleaned.findIndex(item => item.id === 'ghost-start');
    const ghostEndIdx = cleaned.findIndex(item => item.id === 'ghost-end');

    if (ghostStartIdx !== -1 && cleaned[ghostStartIdx + 1]?.type === 'gap') {
      cleaned.splice(ghostStartIdx + 1, 1);
    }
    if (ghostEndIdx !== -1 && cleaned[ghostEndIdx - 1]?.type === 'gap') {
      cleaned.splice(ghostEndIdx - 1, 1);
    }

    return cleaned;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || !dropTarget) return;

    const newTimeline = [...timeline];
    let droppedMemoryId = null; // Track the dropped memory to focus on it

    // Dropping on a gap
    if (dropTarget.type === 'gap') {
      const gapIndex = newTimeline.findIndex(item => item.id === dropTarget.id);
      if (gapIndex === -1) return;

      if (draggedItem.isChunk) {
        const chunk = draggedItem.item;
        const chunkMemoryIds = chunk.memories.map(m => m.id);
        const filteredTimeline = newTimeline.filter(item =>
          item.type === 'gap' || item.type === 'ghost' || !chunkMemoryIds.includes(item.id)
        );

        const newGapIndex = filteredTimeline.findIndex(item => item.id === dropTarget.id);

        // Check what's before and after the gap
        const itemBefore = filteredTimeline[newGapIndex - 1];
        const itemAfter = filteredTimeline[newGapIndex + 1];

        // Only add gaps where needed (not between memories)
        const replacementItems = [];
        if (itemBefore?.type === 'ghost') {
          // No gap needed before if previous is ghost
          replacementItems.push(...chunk.memories);
        } else if (itemBefore?.type === 'memory') {
          // Add gap between memories
          replacementItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
          replacementItems.push(...chunk.memories);
        } else {
          replacementItems.push(...chunk.memories);
        }

        if (itemAfter?.type === 'memory') {
          // Add gap between memories
          replacementItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
        }

        filteredTimeline.splice(newGapIndex, 1, ...replacementItems);

        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        droppedMemoryId = chunk.memories[0].id; // Focus on first memory of chunk

      } else {
        const memory = draggedItem.item;
        const memoryToAdd = { ...memory, type: 'memory' };

        // Check what's before and after the gap
        const itemBefore = newTimeline[gapIndex - 1];
        const itemAfter = newTimeline[gapIndex + 1];

        // Only add gaps where needed
        const replacementItems = [];
        if (itemBefore?.type === 'ghost') {
          // No gap needed before if previous is ghost
          replacementItems.push(memoryToAdd);
        } else if (itemBefore?.type === 'memory') {
          // Add gap between memories
          replacementItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
          replacementItems.push(memoryToAdd);
        } else {
          replacementItems.push(memoryToAdd);
        }

        if (itemAfter?.type === 'memory') {
          // Add gap between memories
          replacementItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
        }

        newTimeline.splice(gapIndex, 1, ...replacementItems);

        if (draggedItem.fromSidebar) {
          setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
        }

        const cleaned = cleanupGaps(newTimeline);
        setTimeline(cleaned);
        droppedMemoryId = memory.id;

        // Update focus to the dropped memory's position immediately
        const newIndex = cleaned.findIndex(item => item.id === memory.id);
        if (newIndex !== -1) {
          // Force immediate focus update
          requestAnimationFrame(() => {
            setFocusedIndex(newIndex);
            // Also force the hover state to clear
            setDropTarget(null);
          });
        }
      }
    }
    // Dropping on ghost-start
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-start') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostStartIndex = newTimeline.findIndex(item => item.id === 'ghost-start');

      // Check what comes after ghost-start
      const itemAfter = newTimeline[ghostStartIndex + 1];
      const insertItems = [memoryToAdd];

      // Only add gap if next item is a memory
      if (itemAfter?.type === 'memory') {
        insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
      }

      newTimeline.splice(ghostStartIndex + 1, 0, ...insertItems);

      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }

      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
      droppedMemoryId = memory.id;

      // Update focus to the dropped memory's position immediately
      const newIndex = cleaned.findIndex(item => item.id === memory.id);
      if (newIndex !== -1) {
        requestAnimationFrame(() => {
          setFocusedIndex(newIndex);
          setDropTarget(null);
        });
      }
    }
    // Dropping on ghost-end
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-end') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostEndIndex = newTimeline.findIndex(item => item.id === 'ghost-end');

      // Check what comes before ghost-end
      const itemBefore = newTimeline[ghostEndIndex - 1];
      const insertItems = [];

      // Only add gap if previous item is a memory
      if (itemBefore?.type === 'memory') {
        insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
      }
      insertItems.push(memoryToAdd);

      newTimeline.splice(ghostEndIndex, 0, ...insertItems);

      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }

      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
      droppedMemoryId = memory.id;

      // Update focus to the dropped memory's position immediately
      const newIndex = cleaned.findIndex(item => item.id === memory.id);
      if (newIndex !== -1) {
        requestAnimationFrame(() => {
          setFocusedIndex(newIndex);
          setDropTarget(null);
        });
      }
    }
    // Dropping on a regular memory edge
    else if (dropTarget.type === 'memory') {
      const dropMemoryIndex = newTimeline.findIndex(item => item.id === dropTarget.id);
      if (dropMemoryIndex === -1) return;

      const dropPosition = dropTarget.side === 'left' ? dropMemoryIndex : dropMemoryIndex + 1;

      if (draggedItem.isChunk) {
        const chunk = draggedItem.item;
        const chunkMemoryIds = chunk.memories.map(m => m.id);
        const filteredTimeline = newTimeline.filter(item =>
          item.type === 'gap' || item.type === 'ghost' || !chunkMemoryIds.includes(item.id)
        );

        let adjustedDropPosition = dropPosition;
        for (let i = 0; i < dropPosition && i < newTimeline.length; i++) {
          if (chunkMemoryIds.includes(newTimeline[i].id)) {
            adjustedDropPosition--;
          }
        }

        // Check what's before and after the drop position
        const itemBefore = filteredTimeline[adjustedDropPosition - 1];
        const itemAfter = filteredTimeline[adjustedDropPosition];
        const insertItems = [];

        // Add gap before if needed
        if (itemBefore?.type === 'memory' && itemAfter?.type !== 'gap') {
          insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
        }
        insertItems.push(...chunk.memories);
        // Add gap after if needed
        if (itemAfter?.type === 'memory' && itemBefore?.type !== 'gap') {
          insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
        }

        filteredTimeline.splice(adjustedDropPosition, 0, ...insertItems);

        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        droppedMemoryId = chunk.memories[0].id; // Focus on first memory of chunk

        // Update focus immediately
        const newIndex = cleaned.findIndex(item => item.id === droppedMemoryId);
        if (newIndex !== -1) {
          requestAnimationFrame(() => {
            setFocusedIndex(newIndex);
            setDropTarget(null);
          });
        }

      } else {
        const memory = draggedItem.item;

        if (draggedItem.fromSidebar) {
          const memoryToAdd = { ...memory, type: 'memory' };

          // Check what's before and after the drop position
          const itemBefore = newTimeline[dropPosition - 1];
          const itemAfter = newTimeline[dropPosition];
          const insertItems = [];

          // Only add gaps between memories, not between memory and ghost/gap
          if (itemBefore?.type === 'memory' && itemAfter?.type !== 'gap') {
            insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
          }
          insertItems.push(memoryToAdd);
          if (itemAfter?.type === 'memory' && itemBefore?.type !== 'gap') {
            insertItems.push({ id: `gap-${generateUniqueId()}`, type: 'gap' });
          }

          newTimeline.splice(dropPosition, 0, ...insertItems);
          setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
        } else {
          const currentIndex = newTimeline.findIndex(item => item.id === memory.id);
          if (currentIndex === -1) return;

          newTimeline.splice(currentIndex, 1);

          let insertIdx = dropPosition;
          if (dropPosition > currentIndex) {
            insertIdx--;
          }

          newTimeline.splice(insertIdx, 0, memory);
        }

        const cleaned = cleanupGaps(newTimeline);
        setTimeline(cleaned);
        droppedMemoryId = memory.id;

        // Update focus to the dropped memory's position immediately
        const newIndex = cleaned.findIndex(item => item.id === memory.id);
        if (newIndex !== -1) {
          requestAnimationFrame(() => {
            setFocusedIndex(newIndex);
            setDropTarget(null);
          });
        }
      }
    }

    // Clear drag state but wait a frame to let the focus update happen first
    requestAnimationFrame(() => {
      handleDragEnd();
    });
  };

  const handleMemoryDoubleClick = (memory) => {
    if (memory.type === 'ghost') return;

    const newTimeline = timeline.filter(item => item.id !== memory.id);
    const cleaned = cleanupGaps(newTimeline);
    setTimeline(cleaned);
    setSidebarMemories(prev => [...prev, memory]);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft' && focusedIndex > 0) {
        lastFocusChangeRef.current = Date.now();
        setFocusedIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && focusedIndex < timeline.length - 1) {
        lastFocusChangeRef.current = Date.now();
        setFocusedIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [focusedIndex, timeline.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (memoriesLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading memories...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="header-left">
          <h1>Chronology</h1>
        </div>
        <div className="header-right">
          <button className="toggle-sidebar-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? 'Close Panel →' : 'Memory Panel'}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="timeline-area">
          <div className="timeline-container" ref={timelineRef}>
            <div className="timeline-track">
              {(() => {
                const elements = [];
                let currentChunk = [];

                timeline.forEach((item, timelineIdx) => {
                  const scale = scales[timelineIdx] || 0;
                  const distance = Math.abs(timelineIdx - focusedIndex);
                  const isFocused = timelineIdx === focusedIndex;
                  const isVisible = scales[timelineIdx] !== undefined;

                  // Skip rendering items outside visible range
                  if (!isVisible) return;

                  if (item.type === 'gap') {
                    // Finish current chunk
                    if (currentChunk.length > 0) {
                      elements.push(
                        <div key={`chunk-${elements.length}`} className="memory-chunk">
                          {currentChunk}
                        </div>
                      );
                      currentChunk = [];
                    }

                    // Render gap as scaling ghost segment
                    const isActive = dropTarget?.type === 'gap' && dropTarget?.id === item.id;
                    elements.push(
                      <div
                        key={item.id}
                        className={`ghost-segment ${isFocused ? 'focused' : ''}`}
                        style={{
                          width: `${MAX_WIDTH * scale}px`,
                          opacity: 1 - Math.min(distance * 0.12, 0.6),
                          zIndex: 10 - distance
                        }}
                        onMouseEnter={() => handleItemHover(timelineIdx)}
                        onMouseLeave={handleItemLeave}
                        onDragOver={(e) => handleDragOver(e, item)}
                        onDrop={handleDrop}
                      >
                        <div className={`ghost-line ${isActive ? 'active' : ''}`}></div>
                      </div>
                    );
                  } else if (item.type === 'ghost') {
                    // Finish current chunk
                    if (currentChunk.length > 0) {
                      elements.push(
                        <div key={`chunk-${elements.length}`} className="memory-chunk">
                          {currentChunk}
                        </div>
                      );
                      currentChunk = [];
                    }

                    // Render ghost bookend as scaling segment
                    const isActive = dropTarget?.type === 'ghost' && dropTarget?.id === item.id;

                    elements.push(
                      <div
                        key={item.id}
                        className={`ghost-segment bookend ${isFocused ? 'focused' : ''}`}
                        style={{
                          width: `${MAX_WIDTH * scale}px`,
                          opacity: 1 - Math.min(distance * 0.12, 0.6),
                          zIndex: 10 - distance
                        }}
                        onMouseEnter={() => handleItemHover(timelineIdx)}
                        onMouseLeave={handleItemLeave}
                        onDragOver={(e) => handleDragOver(e, item)}
                        onDrop={handleDrop}
                      >
                        <div className={`ghost-line ${isActive ? 'active' : ''}`}></div>
                      </div>
                    );
                  } else {
                    // Add memory to current chunk
                    const memory = item;
                    const showLeftIndicator = dropTarget?.type === 'memory' && dropTarget?.id === memory.id && dropTarget?.side === 'left';
                    const showRightIndicator = dropTarget?.type === 'memory' && dropTarget?.id === memory.id && dropTarget?.side === 'right';

                    currentChunk.push(
                      <div
                        key={memory.id}
                        className={`timeline-memory ${isFocused ? 'focused' : ''}`}
                        style={{
                          width: `${MAX_WIDTH * scale}px`,
                          opacity: 1 - Math.min(distance * 0.12, 0.6),
                          zIndex: 10 - distance,
                          overflow: 'hidden'
                        }}
                        onMouseEnter={() => handleItemHover(timelineIdx)}
                        onMouseLeave={handleItemLeave}
                        onDoubleClick={() => handleMemoryDoubleClick(memory)}
                        onDragOver={(e) => handleDragOver(e, memory)}
                        onDrop={handleDrop}
                      >
                        <div className={`drop-indicator left ${showLeftIndicator ? 'active' : ''}`}></div>
                        <div className={`drop-indicator right ${showRightIndicator ? 'active' : ''}`}></div>
                        <div className="memory-content-wrapper">
                          <div className="memory-card-title">{memory.title}</div>
                          {scale > 0.35 && <div className="memory-card-content">{memory.text}</div>}
                          {scale > 0.25 && memory.hashtags && memory.hashtags.length > 0 && (
                            <div className="hashtag-container">
                              {memory.hashtags.map((tag, idx) => (
                                <span key={idx} className="hashtag">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="memory-timeline-segment"></div>
                      </div>
                    );
                  }
                });

                // Add final chunk if it exists
                if (currentChunk.length > 0) {
                  elements.push(
                    <div key={`chunk-${elements.length}`} className="memory-chunk">
                      {currentChunk}
                    </div>
                  );
                }

                return elements;
              })()}
            </div>
          </div>
        </div>

        <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-header-top">
              <h3>Available Memories</h3>
              <button className="close-sidebar-btn" onClick={() => setSidebarOpen(false)}>×</button>
            </div>
            <div className="memory-count">{sidebarMemories.length} available</div>
            <div className="sidebar-hint">Double-click timeline memories to remove</div>
          </div>

          <div className="sidebar-content">
            {sidebarMemories.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                <p>All memories are on the timeline!</p>
                <p style={{ fontSize: '12px', marginTop: '10px' }}>
                  Double-click any timeline memory to remove it.
                </p>
              </div>
            ) : (
              sidebarMemories.map(memory => (
                <div
                  key={memory.id}
                  className="memory-card-sidebar"
                  draggable
                  onDragStart={(e) => handleDragStart(e, memory, false)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="memory-card-title">{memory.title}</div>
                  <div className="memory-card-content">{memory.text}</div>
                  {memory.hashtags && memory.hashtags.length > 0 && (
                    <div className="hashtag-container">
                      {memory.hashtags.map((tag, idx) => (
                        <span key={idx} className="hashtag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Crimson+Text:wght@400;600&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 0;
          font-family: 'Crimson Text', serif;
        }

        .app-container {
          height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: 'Crimson Text', serif;
          background: #FFFFFF;
          color: #2F4F4F;
          overflow: hidden;
        }

        .app-header {
          background: #faf8e9;
          padding: 15px 30px;
          border-bottom: 1px solid #E0E0E0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          min-height: 70px;
          flex-shrink: 0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .app-header h1 {
          font-size: 24px;
          color: #800020;
          margin: 0;
          font-weight: 600;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .toggle-sidebar-btn {
          background: #800020;
          color: #FFFFFF;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-family: 'Crimson Text', serif;
          font-weight: normal;
          transition: all 0.3s ease;
        }

        .toggle-sidebar-btn:hover {
          background: #A0001C;
        }

        .main-content {
          flex: 1;
          display: flex;
          overflow: hidden;
          position: relative;
        }

        .timeline-area {
          flex: 1;
          background: #FFFFFF;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .timeline-container {
          flex: 1;
          overflow-x: hidden;
          overflow-y: hidden;
          padding: 40px 0;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .timeline-track {
          display: flex;
          align-items: flex-end;
          gap: 0;
          padding-bottom: 40px;
          min-height: 200px;
          width: 100%;
          justify-content: center;
        }

        .ghost-segment {
          height: 180px;
          padding: 8px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: width 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      opacity 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          position: relative;
          flex-shrink: 0;
        }

        .ghost-line {
          position: absolute;
          bottom: -9px;
          left: 0;
          right: 0;
          height: 4px;
          background: #b0b0b0;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .ghost-segment.focused .ghost-line {
          background: rgba(128, 0, 32, 0.5);
          height: 8px;
          box-shadow: 0 4px 12px rgba(128, 0, 32, 0.3);
        }

        .ghost-segment:hover .ghost-line {
          background: rgba(128, 0, 32, 0.3);
          height: 6px;
        }

        .ghost-line.active {
          background: rgba(128, 0, 32, 0.6);
          height: 8px;
          box-shadow: 0 0 10px rgba(128, 0, 32, 0.5);
        }

        .memory-chunk {
          display: flex;
          gap: 0;
          position: relative;
        }

        .timeline-memory {
          background: #faf8e9;
          border: 1px solid #e8e6d5;
          border-radius: 6px;
          padding: 12px;
          position: relative;
          cursor: pointer;
          transition: width 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      opacity 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      box-shadow 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          height: 180px;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }

        .timeline-memory:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-color: #d8d6c5;
          z-index: 100;
        }

        .memory-content-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .memory-card-title {
          font-size: 14px;
          font-weight: 600;
          color: #2F4F4F;
          margin-bottom: 8px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .memory-card-content {
          font-size: 11px;
          color: #666;
          line-height: 1.4;
          margin-bottom: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }

        .hashtags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: auto;
        }

        .hashtag {
          font-family: 'Courier Prime', monospace;
          font-size: 10px;
          color: #800020;
          background: rgba(220, 20, 60, 0.1);
          padding: 2px 6px;
          border-radius: 10px;
          white-space: nowrap;
          transition: background 0.15s ease;
        }

        .hashtag:hover {
          background: rgba(220, 20, 60, 0.2);
        }

        .memory-timeline-segment {
          position: absolute;
          bottom: -20px;
          left: 0;
          right: 0;
          height: 4px;
          background: #b0b0b0;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .drop-indicator {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 4px;
          background: transparent;
          transition: all 0.2s ease;
          pointer-events: none;
          z-index: 200;
        }

        .drop-indicator.left {
          left: -2px;
          border-radius: 4px 0 0 4px;
        }

        .drop-indicator.right {
          right: -2px;
          border-radius: 0 4px 4px 0;
        }

        .drop-indicator.active {
          background: linear-gradient(180deg, #800020, #A0001C);
          box-shadow: 0 0 10px rgba(128, 0, 32, 0.5);
          animation: pulse 0.8s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        .sidebar {
          width: 300px;
          background: #FFFFFF;
          border-left: 1px solid #E0E0E0;
          display: flex;
          flex-direction: column;
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          transform: translateX(100%);
          transition: transform 0.3s ease;
          z-index: 50;
        }

        .sidebar.open {
          transform: translateX(0);
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid #E0E0E0;
          background: #FAFAFA;
        }

        .sidebar-header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 5px;
        }

        .sidebar-header h3 {
          font-size: 16px;
          color: #800020;
          margin-bottom: 5px;
          font-weight: 600;
        }

        .close-sidebar-btn {
          background: none;
          border: none;
          padding: 4px 8px;
          cursor: pointer;
          color: #800020;
          transition: all 0.3s ease;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          line-height: 1;
        }

        .close-sidebar-btn:hover {
          background: rgba(128, 0, 32, 0.1);
          color: #A0001C;
        }

        .memory-count {
          font-family: 'Courier Prime', monospace;
          font-size: 12px;
          color: #666;
        }

        .sidebar-hint {
          font-family: 'Courier Prime', monospace;
          font-size: 10px;
          color: #999;
          font-style: italic;
          margin-top: 5px;
        }

        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
        }

        .memory-card-sidebar {
          background: #faf8e9;
          border: 1px solid #e8e6d5;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
          cursor: move;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .memory-card-sidebar:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          border-color: #d8d6c5;
        }

        .memory-card-sidebar:active {
          transform: scale(0.98);
        }

        .memory-card-sidebar .memory-card-title {
          margin-bottom: 6px;
        }

        .memory-card-sidebar .memory-card-content {
          font-size: 12px;
          color: #666;
          line-height: 1.4;
          margin-bottom: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .sidebar-content::-webkit-scrollbar {
          width: 6px;
        }

        .sidebar-content::-webkit-scrollbar-track {
          background: #e8e6d5;
        }

        .sidebar-content::-webkit-scrollbar-thumb {
          background: #c8c6b5;
          border-radius: 3px;
        }

        .sidebar-content::-webkit-scrollbar-thumb:hover {
          background: #a8a695;
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 280px;
          }
        }
      `}</style>
    </div>
  );
}