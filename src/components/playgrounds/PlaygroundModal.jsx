import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePlaygrounds } from '../../hooks/usePlaygrounds';
import useSimplifyView from '../../hooks/useSimplifyView';
import { useConfirm } from '../../contexts/ConfirmContext';
import { calculateCanvasDimensions } from '../../utils/playgroundUtils';
import PlaygroundMemoryCard from './PlaygroundMemoryCard';
import AddPlaygroundMemoryModal from './AddPlaygroundMemoryModal';
import './PlaygroundModal.css';

export default function PlaygroundModal({ isOpen, onClose, playgroundId, userId }) {
  const {
    playgrounds,
    getPlaygroundMemories,
    addMemoryToPlayground,
    updatePlaygroundMemory,
    deletePlaygroundMemory,
    copyMemoryToArchive,
    copyAllMemoriesToArchive,
    updateCentralHashtag,
    autoDetectCentralHashtag,
    removeCentralHashtag
  } = usePlaygrounds(userId);

  const { processInputTitle } = useSimplifyView();

  const [playground, setPlayground] = useState(null);
  const [memories, setMemories] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [memoryContextMenu, setMemoryContextMenu] = useState(null);
  const [draggingMemory, setDraggingMemory] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [inlineEditingMemoryId, setInlineEditingMemoryId] = useState(null);

  const { confirm } = useConfirm();
  const canvasRef = useRef(null);
  const modalContentRef = useRef(null);
  const dragElementRef = useRef(null);
  const dragStartPosRef = useRef(null);
  const debounceTimeoutRef = useRef(null);

  // Get the current playground and reset pan offset
  useEffect(() => {
    if (playgroundId && playgrounds.length > 0) {
      const pg = playgrounds.find(p => p.id === playgroundId);
      setPlayground(pg);
      setPanOffset({ x: 0, y: 0 }); // Reset pan when playground changes
    }
  }, [playgroundId, playgrounds]);

  // Listen to memories for this playground
  useEffect(() => {
    if (!playgroundId) return;

    const unsubscribe = getPlaygroundMemories(playgroundId, (memoriesData) => {
      setMemories(memoriesData);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [playgroundId, getPlaygroundMemories]);

  // Calculate canvas size based on modal size
  useEffect(() => {
    if (isOpen && modalContentRef.current) {
      const modalWidth = modalContentRef.current.offsetWidth;
      const modalHeight = modalContentRef.current.offsetHeight - 120; // Account for header/controls

      const dimensions = calculateCanvasDimensions(modalWidth, modalHeight, 1.5);
      setCanvasSize(dimensions);
    }
  }, [isOpen]);

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingMemory || !canvasRef.current || !dragElementRef.current) return;

      // Prevent default to avoid text selection
      e.preventDefault();

      // Calculate new position
      const deltaX = e.clientX - dragOffset.x;
      const deltaY = e.clientY - dragOffset.y;

      // Update position using CSS transform for smooth movement (no re-renders)
      dragElementRef.current.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    };

    const handleMouseUp = () => {
      if (draggingMemory && dragElementRef.current && dragStartPosRef.current) {
        // Get current transform values
        const transformMatch = dragElementRef.current.style.transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        const deltaX = transformMatch ? parseFloat(transformMatch[1]) : 0;
        const deltaY = transformMatch ? parseFloat(transformMatch[2]) : 0;

        const finalX = dragStartPosRef.current.x + deltaX;
        const finalY = dragStartPosRef.current.y + deltaY;

        // Constrain to canvas bounds
        const maxX = canvasSize.width - 200;
        const maxY = canvasSize.height - 150;
        const constrainedX = Math.max(0, Math.min(finalX, maxX));
        const constrainedY = Math.max(0, Math.min(finalY, maxY));

        // Update position in state first
        setMemories(prev => prev.map(m =>
          m.id === draggingMemory.id
            ? { ...m, position: { x: constrainedX, y: constrainedY } }
            : m
        ));

        // Reset transform after state update
        dragElementRef.current.style.transform = '';

        // Save to Firebase
        updatePlaygroundMemory(draggingMemory.id, {
          position: { x: constrainedX, y: constrainedY }
        });

        setDraggingMemory(null);
        dragElementRef.current = null;
        dragStartPosRef.current = null;
      }
    };

    if (draggingMemory) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMemory, dragOffset, canvasSize, updatePlaygroundMemory]);

  // Close context menus when clicking anywhere
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setMemoryContextMenu(null);
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleMouseDown = (e, memory) => {
    if (e.button !== 0) return; // Only left click
    if (!memory.position) return; // Safety check

    // Store reference to the dragging element
    dragElementRef.current = e.currentTarget;

    // Store the starting position
    dragStartPosRef.current = { ...memory.position };

    // Set drag offset to current mouse position
    setDragOffset({
      x: e.clientX,
      y: e.clientY
    });

    setDraggingMemory(memory);
  };

  const handleMemoryContextMenu = (e, memory) => {
    e.preventDefault();
    e.stopPropagation();

    setMemoryContextMenu({
      x: e.clientX,
      y: e.clientY,
      memory
    });
  };

  const handleHashtagContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleAddMemory = async (memoryData) => {
    try {
      await addMemoryToPlayground(playgroundId, memoryData, memories, canvasSize);
    } catch (error) {
      console.error('Error adding memory:', error);
      alert('Failed to add memory');
    }
  };

  const handleEditMemory = (memory) => {
    setEditingMemory(memory);
    setShowAddModal(true);
    setMemoryContextMenu(null);
  };

  const handleUpdateMemory = async (memoryData) => {
    try {
      await updatePlaygroundMemory(memoryData.id, memoryData);
      setEditingMemory(null);
    } catch (error) {
      console.error('Error updating memory:', error);
      alert('Failed to update memory');
    }
  };

  const handleDeleteMemory = async (memory) => {
    const confirmed = await confirm({
      title: 'Delete Memory',
      message: 'Delete this memory?',
      confirmText: 'Delete',
      danger: true
    });

    if (confirmed) {
      try {
        await deletePlaygroundMemory(memory.id);
        setMemoryContextMenu(null);
      } catch (error) {
        console.error('Error deleting memory:', error);
        alert('Failed to delete memory');
      }
    }
  };

  const handleCopyToArchive = async (memory) => {
    try {
      await copyMemoryToArchive(memory.id, memories);
      setMemoryContextMenu(null);
      alert('Memory copied to Archive!');
    } catch (error) {
      console.error('Error copying to archive:', error);
      alert('Failed to copy memory');
    }
  };

  const handleCopyAllToArchive = async () => {
    const confirmed = await confirm({
      title: 'Copy All to Archive',
      message: 'Copy all memories to Archive? They will remain in this playground.',
      confirmText: 'Copy All'
    });

    if (confirmed) {
      try {
        await copyAllMemoriesToArchive(playgroundId, memories);
        alert('All memories copied to Archive!');
      } catch (error) {
        console.error('Error copying all to archive:', error);
        alert('Failed to copy memories');
      }
    }
  };

  const handleAutoDetectHashtag = async () => {
    try {
      const detected = await autoDetectCentralHashtag(playgroundId, memories);
      if (detected) {
        alert(`Central hashtag set to: ${detected}`);
      } else {
        alert('No hashtags found in memories');
      }
      setContextMenu(null);
    } catch (error) {
      console.error('Error auto-detecting hashtag:', error);
      alert('Failed to auto-detect hashtag');
    }
  };

  const handleRemoveHashtag = async () => {
    try {
      await removeCentralHashtag(playgroundId);
      setContextMenu(null);
    } catch (error) {
      console.error('Error removing hashtag:', error);
      alert('Failed to remove hashtag');
    }
  };

  const handleChangeHashtag = () => {
    const newHashtag = prompt('Enter new central hashtag (with #):');
    if (newHashtag && newHashtag.startsWith('#')) {
      updateCentralHashtag(playgroundId, newHashtag);
    }
    setContextMenu(null);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Canvas panning handlers
  const handleCanvasPanStart = (e) => {
    // Only pan if clicking directly on the canvas container or canvas (not on cards)
    if (e.target.classList.contains('playground-canvas-container') ||
        e.target.classList.contains('playground-canvas') ||
        e.target.classList.contains('central-hashtag')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleCanvasPanMove = (e) => {
    if (!isPanning) return;

    // Mark that we actually panned (to distinguish from simple clicks)
    didPanRef.current = true;

    const newX = e.clientX - panStart.x;
    const newY = e.clientY - panStart.y;

    // Constrain panning so canvas doesn't go too far off-screen
    const maxPanX = canvasSize.width - 200;
    const maxPanY = canvasSize.height - 200;

    setPanOffset({
      x: Math.max(-maxPanX, Math.min(100, newX)),
      y: Math.max(-maxPanY, Math.min(100, newY))
    });
  };

  const handleCanvasPanEnd = () => {
    setIsPanning(false);
  };

  // Calculate position on canvas from click event
  const getCanvasPosition = (e) => {
    if (!canvasRef.current) return null;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top
    };
  };

  // Track if we actually panned (moved the mouse while holding down)
  const didPanRef = useRef(false);
  // Track if we're currently creating a memory (to prevent rapid clicks)
  const isCreatingMemoryRef = useRef(false);

  // Create inline memory at click position
  const handleCanvasClick = async (e) => {
    // Only create memory if clicking directly on canvas (not on cards or hashtag)
    if (!e.target.classList.contains('playground-canvas')) return;

    // Don't create if we actually panned (moved the canvas)
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }

    // Prevent rapid clicks from creating multiple memories
    if (isCreatingMemoryRef.current) return;

    // If already inline editing, save that memory first
    if (inlineEditingMemoryId) {
      const memory = memories.find(m => m.id === inlineEditingMemoryId);
      if (memory) {
        handleInlineMemoryBlur(inlineEditingMemoryId, memory.title || '');
      }
      return;
    }

    const position = getCanvasPosition(e);
    if (!position) return;

    isCreatingMemoryRef.current = true;

    try {
      // Create memory data
      const memoryData = {
        title: '',
        content: '',
        hashtags: [],
        timestamp: new Date().toISOString()
      };

      // Add to playground (this saves to Firebase and returns the new memory)
      const newMemoryId = await addMemoryToPlayground(playgroundId, memoryData, memories, canvasSize, position);

      // Set as inline editing
      if (newMemoryId) {
        setInlineEditingMemoryId(newMemoryId);
      }
    } catch (error) {
      console.error('Failed to create memory:', error);
    } finally {
      isCreatingMemoryRef.current = false;
    }
  };

  // Inline editing handlers
  const handleInlineMemoryUpdate = useCallback((memoryId, newTitle) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Update local state immediately for responsive UI
    setMemories(prev => prev.map(m =>
      m.id === memoryId ? { ...m, title: newTitle } : m
    ));

    // Debounce the Firebase update
    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const titleWithCommas = newTitle.replace(/\n/g, ', ');
        const processedTitle = processInputTitle(titleWithCommas);
        await updatePlaygroundMemory(memoryId, { title: processedTitle });
      } catch (error) {
        console.error('Failed to auto-save memory update:', error);
      }
    }, 1000);
  }, [updatePlaygroundMemory, processInputTitle]);

  const handleInlineMemoryBlur = useCallback(async (memoryId, finalTitle) => {
    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    setInlineEditingMemoryId(null);

    // If blank, delete the memory
    if (!finalTitle || !finalTitle.trim()) {
      try {
        await deletePlaygroundMemory(memoryId);
      } catch (error) {
        console.error('Failed to delete empty memory:', error);
      }
      return;
    }

    // Save final title
    const titleWithCommas = finalTitle.replace(/\n/g, ', ');
    const processedTitle = processInputTitle(titleWithCommas);

    try {
      await updatePlaygroundMemory(memoryId, { title: processedTitle });
    } catch (error) {
      console.error('Failed to update memory:', error);
    }
  }, [updatePlaygroundMemory, deletePlaygroundMemory, processInputTitle]);

  const handleInlineMemoryEscape = useCallback(async (memoryId) => {
    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    setInlineEditingMemoryId(null);

    // Delete the memory
    try {
      await deletePlaygroundMemory(memoryId);
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  }, [deletePlaygroundMemory]);

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setEditingMemory(null);
  };

  if (!isOpen) return null;

  return (
    <div className="playground-modal-overlay" onClick={handleOverlayClick}>
      <div className="playground-modal-content" ref={modalContentRef}>
        <div className="playground-header">
          <h2>{playground?.name || 'Playground'}</h2>
          <div className="playground-header-controls">
            <button
              className="header-icon-btn"
              onClick={() => setShowAddModal(true)}
              title="Add Memory"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1 .5.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1-.5-.5h-5a.5.5 0 0 1 0-1h5a.5.5 0 0 1 .5-.5v-5A.5.5 0 0 1 8 2z"/>
              </svg>
            </button>
            <button
              className="header-icon-btn"
              onClick={handleCopyAllToArchive}
              title="Add All to Archive"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
              </svg>
            </button>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div
          className={`playground-canvas-container ${isPanning ? 'panning' : ''}`}
          onMouseDown={handleCanvasPanStart}
          onMouseMove={handleCanvasPanMove}
          onMouseUp={handleCanvasPanEnd}
          onMouseLeave={handleCanvasPanEnd}
        >
          <div
            className="playground-canvas"
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`
            }}
          >
            {playground?.centralHashtag && (
              <div
                className="central-hashtag"
                onContextMenu={handleHashtagContextMenu}
              >
                {playground.centralHashtag}
              </div>
            )}

            {memories.map(memory => (
              <PlaygroundMemoryCard
                key={memory.id}
                memory={memory}
                onMouseDown={handleMouseDown}
                onContextMenu={handleMemoryContextMenu}
                isDragging={draggingMemory?.id === memory.id}
                isInlineEditing={inlineEditingMemoryId === memory.id}
                onInlineUpdate={handleInlineMemoryUpdate}
                onInlineBlur={handleInlineMemoryBlur}
                onInlineEscape={handleInlineMemoryEscape}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Central Hashtag Context Menu */}
      {contextMenu && (
        <div
          className="playground-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleAutoDetectHashtag}>
            Auto-detect from memories
          </div>
          <div className="context-menu-item" onClick={handleChangeHashtag}>
            Change hashtag
          </div>
          <div className="context-menu-item" onClick={handleRemoveHashtag}>
            Remove central hashtag
          </div>
        </div>
      )}

      {/* Memory Context Menu */}
      {memoryContextMenu && (
        <div
          className="playground-context-menu"
          style={{ top: memoryContextMenu.y, left: memoryContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => handleEditMemory(memoryContextMenu.memory)}>
            Edit
          </div>
          <div className="context-menu-item" onClick={() => handleDeleteMemory(memoryContextMenu.memory)}>
            Delete
          </div>
          <div className="context-menu-item" onClick={() => handleCopyToArchive(memoryContextMenu.memory)}>
            Copy to Archive
          </div>
        </div>
      )}

      {/* Add/Edit Memory Modal */}
      <AddPlaygroundMemoryModal
        isOpen={showAddModal}
        onClose={handleCloseAddModal}
        onSave={editingMemory ? handleUpdateMemory : handleAddMemory}
        centralHashtag={playground?.centralHashtag}
        editingMemory={editingMemory}
      />
    </div>
  );
}
