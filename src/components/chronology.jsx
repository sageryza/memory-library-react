import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useChronologyState } from '../hooks/useChronologyState';
import { useAuth } from '../hooks/useAuth';

const MAX_WIDTH = 250;
const MIN_WIDTH = 60;
const GAP = 0;

export default function Chronology({ memories = [], memoriesLoading }) {
  const { user } = useAuth();
  const { chronologyState, updateChronologyState, loading: chronologyLoading } = useChronologyState(user?.uid);
  const [timeline, setTimeline] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(1);
  const [sidebarMemories, setSidebarMemories] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const timelineRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const lastFocusChangeRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const lastLocalUpdateRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const isLocalChangeRef = useRef(false);
  const stateVersionRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const errorTimeoutRef = useRef(null);

  // Generate unique ID for gaps
  const generateUniqueId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  // Show error message with auto-dismiss
  const showError = (message) => {
    setErrorMessage(message);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
    }, 5000); // Auto-dismiss after 5 seconds
  };

  // Convert Firebase memory format to Chronology format
  const convertMemory = (mem) => ({
    id: mem.id,
    type: 'memory',
    title: mem.title || 'Untitled',
    text: mem.content || '',
    hashtags: mem.hashtags || []
  });

  // Load chronology state and sync with Firebase memories
  useEffect(() => {
    if (memoriesLoading || chronologyLoading) return;

    // Skip Firebase updates if we're in the middle of a local change
    if (isLocalChangeRef.current) {
      return;
    }

    // Check if this is a newer version from Firebase
    const incomingVersion = chronologyState.positions?.version || 0;
    if (hasInitializedRef.current && incomingVersion <= stateVersionRef.current) {
      // Skip if we already have this version or newer
      return;
    }

    try {
      stateVersionRef.current = incomingVersion;
      if (chronologyState.positions?.timelineIds && chronologyState.positions?.sidebarIds) {
        // Restore saved arrangement
        const timelineMemories = chronologyState.positions.timelineIds
          .map(id => memories.find(m => m.id === id))
          .filter(Boolean)
          .map(convertMemory);

        const sidebarMems = chronologyState.positions.sidebarIds
          .map(id => memories.find(m => m.id === id))
          .filter(Boolean)
          .map(convertMemory);

        // Find new memories not in saved state
        const allSavedIds = [...chronologyState.positions.timelineIds, ...chronologyState.positions.sidebarIds];
        const newMemories = memories
          .filter(m => !allSavedIds.includes(m.id))
          .map(convertMemory);

        // Rebuild timeline with gaps and ghosts
        const rebuiltTimeline = [{ id: 'ghost-start', type: 'ghost' }];
        timelineMemories.forEach((mem, idx) => {
          rebuiltTimeline.push(mem);
          if (idx < timelineMemories.length - 1) {
            rebuiltTimeline.push({ id: `gap-${idx}`, type: 'gap' });
          }
        });
        rebuiltTimeline.push({ id: 'ghost-end', type: 'ghost' });

        setTimeline(rebuiltTimeline);
        setSidebarMemories([...sidebarMems, ...newMemories]);
      } else {
        // First time - put all memories in sidebar
        const converted = memories.map(convertMemory);
        setSidebarMemories(converted);
        setTimeline([
          { id: 'ghost-start', type: 'ghost' },
          { id: 'ghost-end', type: 'ghost' }
        ]);
      }
    } catch (e) {
      console.error('Error loading chronology:', e);
      showError('Failed to load chronology arrangement. Using default layout.');
      const converted = memories.map(convertMemory);
      setSidebarMemories(converted);
      setTimeline([
        { id: 'ghost-start', type: 'ghost' },
        { id: 'ghost-end', type: 'ghost' }
      ]);
    }
    hasInitializedRef.current = true;
  }, [memories, memoriesLoading, chronologyState, chronologyLoading]);

  // Save chronology state (timeline arrangement only)
  useEffect(() => {
    const saveState = async () => {
      if (!user?.uid) return;
      if (!hasInitializedRef.current) return; // Don't save before initialization

      try {
        const timelineMemoryIds = timeline
          .filter(item => item.type === 'memory')
          .map(item => item.id);

        const sidebarMemoryIds = sidebarMemories.map(mem => mem.id);

        // Increment version for this local change
        const newVersion = stateVersionRef.current + 1;

        // Set flag to prevent re-loading our own changes
        isLocalChangeRef.current = true;
        lastLocalUpdateRef.current = Date.now();

        await updateChronologyState({
          positions: {
            timelineIds: timelineMemoryIds,
            sidebarIds: sidebarMemoryIds,
            lastUpdated: new Date().toISOString(),
            version: newVersion
          }
        });

        stateVersionRef.current = newVersion;

        // Clear the flag after a short delay to allow Firebase to propagate
        setTimeout(() => {
          isLocalChangeRef.current = false;
        }, 100);
      } catch (e) {
        console.error('Error saving chronology state:', e);
        showError('Failed to save chronology arrangement. Changes may not persist.');
        isLocalChangeRef.current = false;
        // Revert the version since save failed
        stateVersionRef.current = stateVersionRef.current > 0 ? stateVersionRef.current - 1 : 0;
      }
    };

    const timeoutId = setTimeout(saveState, 500);
    return () => clearTimeout(timeoutId);
  }, [timeline, sidebarMemories, updateChronologyState, user?.uid]);

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
  }, [focusedIndex, timeline.length, viewportWidth, sidebarOpen]);

  const { startIndex, endIndex, scales } = getVisibleItemsAndScales();

  // Pre-calculate chunk structure to avoid recreating during render
  const chunkStructure = useMemo(() => {
    const chunks = [];
    let currentChunk = [];
    let currentChunkIds = [];

    timeline.forEach((item, idx) => {
      if (item.type === 'gap') {
        if (currentChunk.length > 0) {
          chunks.push({
            type: 'chunk',
            items: currentChunk,
            ids: currentChunkIds
          });
          currentChunk = [];
          currentChunkIds = [];
        }
        chunks.push({ type: 'gap', item, index: idx });
      } else if (item.type === 'ghost') {
        if (currentChunk.length > 0) {
          chunks.push({
            type: 'chunk',
            items: currentChunk,
            ids: currentChunkIds
          });
          currentChunk = [];
          currentChunkIds = [];
        }
        chunks.push({ type: 'ghost', item, index: idx });
      } else {
        currentChunk.push({ ...item, index: idx });
        currentChunkIds.push(item.id);
      }
    });

    if (currentChunk.length > 0) {
      chunks.push({
        type: 'chunk',
        items: currentChunk,
        ids: currentChunkIds
      });
    }

    return chunks;
  }, [timeline]);

  const handleItemHover = useCallback((index) => {
    if (index !== focusedIndex) {
      setFocusedIndex(index);
    }
  }, [focusedIndex]);
  
  const handleItemLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  const handleDragStart = (e, item, isChunk = false) => {
    setIsDragging(true);
    setDraggedItem({ item, isChunk, fromSidebar: !isChunk && !timeline.some(t => t.id === item.id) });
    e.dataTransfer.effectAllowed = isChunk ? 'move' : 'copy';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleDragOver = (e, item = null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || !item) return;
    
    const itemIndex = timeline.findIndex(t => t.id === item.id);
    if (itemIndex !== -1 && itemIndex !== focusedIndex) {
      setFocusedIndex(itemIndex);
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const side = e.clientX < midpoint ? 'left' : 'right';
    
    setDropTarget({ type: item.type, id: item.id, side });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || !dropTarget) return;

    const newTimeline = [...timeline];
    
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
        
        filteredTimeline.splice(newGapIndex, 1,
          { id: `gap-${generateUniqueId()}-before`, type: 'gap' },
          ...chunk.memories,
          { id: `gap-${generateUniqueId()}-after`, type: 'gap' }
        );
        
        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        
      } else {
        const memory = draggedItem.item;
        const memoryToAdd = { ...memory, type: 'memory' };
        
        newTimeline.splice(gapIndex, 1,
          { id: `gap-${generateUniqueId()}-before`, type: 'gap' },
          memoryToAdd,
          { id: `gap-${generateUniqueId()}-after`, type: 'gap' }
        );
        
        if (draggedItem.fromSidebar) {
          setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
        }
        
        const cleaned = cleanupGaps(newTimeline);
        setTimeline(cleaned);
      }
    }
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-start') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostStartIndex = newTimeline.findIndex(item => item.id === 'ghost-start');
      
      newTimeline.splice(ghostStartIndex + 1, 0,
        memoryToAdd,
        { id: `gap-${generateUniqueId()}`, type: 'gap' }
      );
      
      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }
      
      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
    }
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-end') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostEndIndex = newTimeline.findIndex(item => item.id === 'ghost-end');
      
      newTimeline.splice(ghostEndIndex, 0,
        { id: `gap-${generateUniqueId()}`, type: 'gap' },
        memoryToAdd
      );
      
      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }
      
      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
    }
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
        
        filteredTimeline.splice(adjustedDropPosition, 0, ...chunk.memories);
        
        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        
      } else {
        const memory = draggedItem.item;
        
        if (draggedItem.fromSidebar) {
          const memoryToAdd = { ...memory, type: 'memory' };

          // Direct adjacency - user wants memories side by side (red highlight)
          // Just insert the memory without any gaps
          newTimeline.splice(dropPosition, 0, memoryToAdd);

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
      }
    }
    
    handleDragEnd();
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

  const handleMemoryDoubleClick = (memory) => {
    if (memory.type === 'ghost') return;

    const newTimeline = timeline.filter(item => item.id !== memory.id);
    const cleaned = cleanupGaps(newTimeline);
    setTimeline(cleaned);
    setSidebarMemories(prev => [...prev, memory]);
  };

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
  
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
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
      {/* Error Notification */}
      {errorMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#f44336',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>⚠️</span>
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              marginLeft: '10px',
              fontSize: '18px',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}

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
              {timeline.map((item, timelineIdx) => {
                const scale = scales[timelineIdx] || 0;
                const distance = Math.abs(timelineIdx - focusedIndex);
                const isFocused = timelineIdx === focusedIndex;
                const isVisible = scales[timelineIdx] !== undefined;

                if (item.type === 'gap' || item.type === 'ghost') {
                  const isActive = dropTarget?.type === item.type && dropTarget?.id === item.id;
                  const isBookend = item.type === 'ghost';

                  return (
                    <div
                      key={item.id}
                      className={`ghost-segment ${isBookend ? 'bookend' : ''} ${isFocused ? 'focused' : ''}`}
                      style={{
                        width: isVisible ? `${MAX_WIDTH * scale}px` : '0px',
                        opacity: isVisible ? 1 - Math.min(distance * 0.12, 0.6) : 0,
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
                  const memory = item;
                  const showLeftIndicator = dropTarget?.type === 'memory' && dropTarget?.id === memory.id && dropTarget?.side === 'left';
                  const showRightIndicator = dropTarget?.type === 'memory' && dropTarget?.id === memory.id && dropTarget?.side === 'right';

                  return (
                    <div
                      key={memory.id}
                      className={`timeline-memory ${isFocused ? 'focused' : ''}`}
                      style={{
                        width: isVisible ? `${MAX_WIDTH * scale}px` : '0px',
                        opacity: isVisible ? 1 - Math.min(distance * 0.12, 0.6) : 0,
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
                          <div className="hashtags">
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
              })}
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
                    <div className="hashtags">
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