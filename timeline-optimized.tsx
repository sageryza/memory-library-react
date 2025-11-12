import React, { useState, useRef, useCallback, useEffect } from 'react';

const MAX_WIDTH = 250;
const MIN_WIDTH = 60;
const GAP = 0;

const Timeline = () => {
  // Timeline contains memories, gaps, AND ghost segments - ALL participate in scaling
  const [timeline, setTimeline] = useState([
    { id: 'ghost-start', type: 'ghost' },
    { id: '1', type: 'memory', title: 'First Memory', text: 'This is the first memory in the timeline', hashtags: ['#beginning'] },
    { id: '2', type: 'memory', title: 'Second Memory', text: 'Another important moment', hashtags: ['#milestone'] },
    { id: 'gap-1', type: 'gap' },
    { id: '3', type: 'memory', title: 'Third Memory', text: 'The journey continues here', hashtags: ['#progress'] },
    { id: '4', type: 'memory', title: 'Fourth Memory', text: 'Getting closer to the present', hashtags: ['#recent'] },
    { id: '5', type: 'memory', title: 'Fifth Memory', text: 'Almost at today', hashtags: ['#current'] },
    { id: 'gap-2', type: 'gap' },
    { id: '6', type: 'memory', title: 'Sixth Memory', text: 'Latest updates and thoughts', hashtags: ['#latest'] },
    { id: '7', type: 'memory', title: 'Seventh Memory', text: 'The most recent memory', hashtags: ['#now'] },
    { id: '8', type: 'memory', title: 'Eighth Memory', text: 'Moving forward with confidence', hashtags: ['#momentum'] },
    { id: 'gap-3', type: 'gap' },
    { id: '9', type: 'memory', title: 'Ninth Memory', text: 'Reflecting on the journey', hashtags: ['#reflection'] },
    { id: '10', type: 'memory', title: 'Tenth Memory', text: 'Building on past experiences', hashtags: ['#growth'] },
    { id: '11', type: 'memory', title: 'Eleventh Memory', text: 'Discovering new perspectives', hashtags: ['#insight'] },
    { id: 'gap-4', type: 'gap' },
    { id: '12', type: 'memory', title: 'Twelfth Memory', text: 'Embracing change and adaptation', hashtags: ['#change'] },
    { id: '13', type: 'memory', title: 'Thirteenth Memory', text: 'Finding strength in challenges', hashtags: ['#resilience'] },
    { id: '14', type: 'memory', title: 'Fourteenth Memory', text: 'Celebrating small victories', hashtags: ['#success'] },
    { id: 'gap-5', type: 'gap' },
    { id: '15', type: 'memory', title: 'Fifteenth Memory', text: 'Learning from setbacks', hashtags: ['#lessons'] },
    { id: '16', type: 'memory', title: 'Sixteenth Memory', text: 'Connecting with others deeply', hashtags: ['#connection'] },
    { id: '17', type: 'memory', title: 'Seventeenth Memory', text: 'Pursuing passion projects', hashtags: ['#passion'] },
    { id: '18', type: 'memory', title: 'Eighteenth Memory', text: 'Breaking through barriers', hashtags: ['#breakthrough'] },
    { id: 'gap-6', type: 'gap' },
    { id: '19', type: 'memory', title: 'Nineteenth Memory', text: 'Achieving long-term goals', hashtags: ['#achievement'] },
    { id: '20', type: 'memory', title: 'Twentieth Memory', text: 'Looking toward the future', hashtags: ['#future'] },
    { id: 'ghost-end', type: 'ghost' }
  ]);
  
  const [focusedIndex, setFocusedIndex] = useState(1); // Timeline index (not memory index)
  const [sidebarMemories, setSidebarMemories] = useState([
    { id: 's1', type: 'memory', title: 'Sidebar Memory 1', text: 'Drag me to timeline', hashtags: ['#unused'] },
    { id: 's2', type: 'memory', title: 'Sidebar Memory 2', text: 'Ready to be placed', hashtags: ['#available'] },
    { id: 's3', type: 'memory', title: 'Sidebar Memory 3', text: 'Another memory to add', hashtags: ['#pending'] }
  ]);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const timelineRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const lastFocusChangeRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1200);

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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || !dropTarget) return;

    const newTimeline = [...timeline];
    
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
        
        filteredTimeline.splice(newGapIndex, 1, 
          { id: `gap-${Date.now()}-before`, type: 'gap' },
          ...chunk.memories,
          { id: `gap-${Date.now()}-after`, type: 'gap' }
        );
        
        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        
      } else {
        const memory = draggedItem.item;
        const memoryToAdd = { ...memory, type: 'memory' };
        
        newTimeline.splice(gapIndex, 1, 
          { id: `gap-${Date.now()}-before`, type: 'gap' },
          memoryToAdd,
          { id: `gap-${Date.now()}-after`, type: 'gap' }
        );
        
        if (draggedItem.fromSidebar) {
          setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
        }
        
        const cleaned = cleanupGaps(newTimeline);
        setTimeline(cleaned);
      }
    }
    // Dropping on ghost-start
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-start') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostStartIndex = newTimeline.findIndex(item => item.id === 'ghost-start');
      
      newTimeline.splice(ghostStartIndex + 1, 0, 
        memoryToAdd,
        { id: `gap-${Date.now()}`, type: 'gap' }
      );
      
      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }
      
      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
    }
    // Dropping on ghost-end
    else if (dropTarget.type === 'ghost' && dropTarget.id === 'ghost-end') {
      const memory = draggedItem.item;
      const memoryToAdd = { ...memory, type: 'memory' };
      const ghostEndIndex = newTimeline.findIndex(item => item.id === 'ghost-end');
      
      newTimeline.splice(ghostEndIndex, 0, 
        { id: `gap-${Date.now()}`, type: 'gap' },
        memoryToAdd
      );
      
      if (draggedItem.fromSidebar) {
        setSidebarMemories(prev => prev.filter(m => m.id !== memory.id));
      }
      
      const cleaned = cleanupGaps(newTimeline);
      setTimeline(cleaned);
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
        
        filteredTimeline.splice(adjustedDropPosition, 0, ...chunk.memories);
        
        const cleaned = cleanupGaps(filteredTimeline);
        setTimeline(cleaned);
        
      } else {
        const memory = draggedItem.item;
        
        if (draggedItem.fromSidebar) {
          const memoryToAdd = { ...memory, type: 'memory' };
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

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="header-left">
          <a href="#" className="back-btn">
            <svg width="36" height="36" viewBox="0 0 619.47 633.59">
              <path fill="currentColor" d="M436.47,117.63c.14.14.37.13.51,0,.06-.06.1-.15.1-.24l.06-78.83c0-.22.02-.44.07-.65l.71-3.13c.04-.16.1-.31.18-.46,2.55-4.58,6.52-6.87,11.91-6.86,31.31.03,49.73.05,55.25.06,5.33,0,9.95,4.21,11.35,9.01.25.87.38,4.34.38,10.41.02,59.81.02,108.32,0,145.55,0,.32.13.63.36.86,30.19,29.72,62.34,61.5,96.45,95.35,5.14,5.11,6.79,10.61,4.94,16.51-.1.32-.22.63-.37.92-2.41,4.83-6.7,7.26-12.85,7.28-15.81.05-31.51.05-47.09,0-.24,0-.43.19-.43.42-.02,77.51.02,178.67.13,303.48,0,7.53-.47,11.48-6.56,14.81-1.41.77-3.68,1.18-6.81,1.22-18.39.25-33.8.32-46.22.21-22.88-.2-34.53.12-53.11-.3-.36,0-.64-.29-.64-.65-.03-63.85-.01-131.44.05-202.78,0-10.06-.49-17.57-1.49-22.52-3.25-16.05-11.06-29.55-23.44-40.48-15.87-14.03-34.2-20.21-54.97-18.54-16.46,1.31-30.78,7.36-42.97,18.15-9.67,8.56-16.56,18.57-20.66,30.04-1.75,4.89-2.99,10.01-3.72,15.37-.57,4.17-.86,9.44-.86,15.82,0,82.98.01,151.31.01,204.99,0,.4-.32.72-.71.72h0c-20.03-.04-30.86-.05-32.5-.04-19.02.13-29.86.2-32.51.19-34.79-.17-86.96-.22-156.5-.16-7.55,0-12.08-3.7-13.6-11.13-.01-.07-.02-.15-.02-.22l-.03-307.94c0-.35-.29-.64-.64-.64-15.57.06-30.81.06-45.72,0-3.24-.02-5.87-.57-7.88-1.64-6.36-3.4-8.24-10.85-5.22-17.31.87-1.84,2.78-4.21,5.75-7.11,100.36-98,153.31-149.72,158.84-155.15,33.37-32.79,74.68-73.29,123.93-121.49,5.23-5.12,9.01-8.15,11.35-9.10,5.55-2.26,11.08-2.15,16.61.32,2.22.99,5.56,3.72,10.03,8.18,34.24,34.13,56.45,56.15,66.63,66.06,14.55,14.16,28.53,27.98,41.92,41.45Z"></path>
            </svg>
          </a>
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
                          zIndex: 10 - distance,
                          background: isActive ? 'transparent' : 'transparent'
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
                    // NO drop indicators on ghost segments - only pink highlight on line
                    const isActive = dropTarget?.type === 'ghost' && dropTarget?.id === item.id;
                    
                    elements.push(
                      <div
                        key={item.id}
                        className={`ghost-segment bookend ${isFocused ? 'focused' : ''}`}
                        style={{
                          width: `${MAX_WIDTH * scale}px`,
                          opacity: 1 - Math.min(distance * 0.12, 0.6),
                          zIndex: 10 - distance,
                          background: 'transparent'
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
                          zIndex: 10 - distance
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
                          {scale > 0.25 && (
                            <div className="hashtags">
                              {memory.hashtags.map(tag => (
                                <span key={tag} className="hashtag">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {isFocused && <div className="focus-indicator">Current Focus</div>}
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
              <button className="close-sidebar-btn" onClick={() => setSidebarOpen(false)}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"></path>
                </svg>
              </button>
            </div>
            <div className="memory-count">{sidebarMemories.length} available</div>
            <div className="sidebar-hint">Double-click timeline memories to remove</div>
          </div>
          
          <div className="sidebar-content">
            {sidebarMemories.map(memory => (
              <div
                key={memory.id}
                className="memory-card-sidebar"
                draggable
                onDragStart={(e) => handleDragStart(e, memory, false)}
                onDragEnd={handleDragEnd}
              >
                <div className="memory-card-title">{memory.title}</div>
                <div className="memory-card-content">{memory.text}</div>
                <div className="hashtags">
                  {memory.hashtags.map(tag => (
                    <span key={tag} className="hashtag">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
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
          gap: 20px;
        }

        .back-btn {
          background: none;
          border: none;
          padding: 5px 8px;
          cursor: pointer;
          color: #800020;
          transition: all 0.3s ease;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .back-btn:hover {
          color: #A0001C;
          transform: scale(1.05);
        }

        .app-header h1 {
          font-size: 24px;
          color: #800020;
          margin: 0;
          font-weight: normal;
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
                      opacity 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                      box-shadow 0.2s ease,
                      transform 0.2s ease;
          will-change: width, opacity, transform;
          transform: translateZ(0);
          position: relative;
          flex-shrink: 0;
          backface-visibility: hidden;
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

        .ghost-segment.active {
          background: rgba(128, 0, 32, 0.05);
        }

        .ghost-segment.active .ghost-line {
          background: rgba(128, 0, 32, 0.6);
          height: 8px;
          box-shadow: 0 0 10px rgba(128, 0, 32, 0.5);
        }

        .memory-chunk {
          display: flex;
          gap: 0;
          position: relative;
          transition: all 0.3s ease;
          border: 2px solid rgba(128, 0, 32, 0.2);
          background: rgba(128, 0, 32, 0.03);
          padding: 8px;
          border-radius: 10px;
        }

        .memory-chunk:hover {
          border-color: rgba(128, 0, 32, 0.4);
          background: rgba(128, 0, 32, 0.06);
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
                      box-shadow 0.2s ease,
                      transform 0.2s ease;
          will-change: width, opacity, transform;
          transform: translateZ(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          height: 180px;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          backface-visibility: hidden;
        }

        .timeline-memory:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-color: #d8d6c5;
          z-index: 100;
        }

        .timeline-memory.focused {
          /* Only size changes when focused - no color/shadow/transform changes */
        }

        .memory-content-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .memory-card-title {
          font-size: 14px;
          font-weight: normal;
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
          background: rgba(0, 0, 0, 0.06);
          color: #666;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          transition: background 0.15s ease;
        }

        .hashtag:hover {
          background: rgba(0, 0, 0, 0.1);
        }

        .focus-indicator {
          display: none; /* Hidden - focus is shown by size only */
          position: absolute;
          bottom: -25px;
          left: 50%;
          transform: translateX(-50%);
          background: #2F4F4F;
          color: white;
          padding: 4px 12px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          white-space: nowrap;
          animation: fadeInUp 0.2s ease;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .memory-timeline-segment {
          position: absolute;
          bottom: -20px;
          left: 0;
          right: 0;
          height: 4px;
          background: #b0b0b0;
          border-radius: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
          font-weight: normal;
        }

        .close-sidebar-btn {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: #800020;
          transition: all 0.3s ease;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-sidebar-btn:hover {
          background: rgba(128, 0, 32, 0.1);
          color: #A0001C;
          transform: scale(1.1);
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
          will-change: transform;
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

          .timeline-memory {
            min-width: 120px;
          }
        }
      `}</style>
    </div>
  );
};

export default Timeline;