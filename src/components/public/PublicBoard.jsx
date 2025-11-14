import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { usePublicBoard } from '../../hooks/usePublicBoards';
import { useAuth } from '../../hooks/useAuth';
import { useMemories } from '../../hooks/useMemories';
import Canvas from '../conspiracy-board/Canvas';
import Connections from '../conspiracy-board/Connections';
import StandalonePins from '../conspiracy-board/StandalonePins';
import MemoryCard from '../shared/MemoryCard';
import MemoryPopup from '../shared/MemoryPopup';
import './PublicBoard.css';

// Canvas size constants
const CANVAS_WIDTH = 10000;
const CANVAS_HEIGHT = 8000;
const CANVAS_OFFSET_X = 4500;
const CANVAS_OFFSET_Y = 3000;

function PublicBoard({ boardId, onBack }) {
  const { user } = useAuth();
  const { memories: userMemories } = useMemories(user?.uid);
  const {
    boardData,
    memories: boardMemories,
    connections,
    standalonePins,
    loading,
    error,
    addMemoryToBoard,
    updateMemoryPosition,
    removeMemoryFromBoard,
    addConnection,
    removeConnection,
    addStandalonePin,
    removeStandalonePin
  } = usePublicBoard(boardId);

  // Drag and drop state
  const [activeId, setActiveId] = useState(null);
  const [activeMemoryData, setActiveMemoryData] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [memoryPopup, setMemoryPopup] = useState(null);
  const [showMemorySelector, setShowMemorySelector] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);

  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);

  // Setup drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Handle drag start
  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);

    // Check if dragging from user's archive (sidebar)
    if (active.data.current && !active.data.current.isOnCanvas) {
      setActiveMemoryData(active.data.current);
    } else {
      // Dragging existing memory on canvas
      const memory = boardMemories.find(m => `canvas-${m.id}` === active.id);
      setActiveMemoryData(memory);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (over?.id === 'canvas' || over?.id === 'canvas-container') {
      const dropPosition = {
        x: event.delta.x + (active.rect.current.translated?.left || 0) - panOffset.x + CANVAS_OFFSET_X,
        y: event.delta.y + (active.rect.current.translated?.top || 0) - panOffset.y + CANVAS_OFFSET_Y
      };

      // Check if this is a new memory being added from archive
      if (active.data.current && !active.data.current.isOnCanvas) {
        // Add memory to the board
        await addMemoryToBoard(active.data.current, dropPosition, user?.uid);
      } else {
        // Update existing memory position
        const memoryId = active.id.replace('canvas-', '');
        await updateMemoryPosition(memoryId, dropPosition);
      }
    }

    setActiveId(null);
    setActiveMemoryData(null);
  };

  // Handle pin clicks for connections
  const handlePinClick = async (memoryId) => {
    if (!selectedPin) {
      setSelectedPin(memoryId);
    } else if (selectedPin !== memoryId) {
      // Create connection
      await addConnection(selectedPin, memoryId, user?.uid);
      setSelectedPin(null);
    } else {
      // Clicking same pin again, deselect
      setSelectedPin(null);
    }
  };

  // Handle canvas click
  const handleCanvasClick = (e) => {
    // If clicking on empty canvas, deselect everything
    if (e.target.classList.contains('canvas')) {
      setSelectedPin(null);
      setSelectedConnection(null);
    }
  };

  // Handle memory click to show popup
  const handleMemoryClick = (e, memory) => {
    if (e.target.classList.contains('memory-pin')) return;

    setMemoryPopup({
      memory,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  // Handle panning
  const handleMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (isPanning && panStart) {
      const newOffset = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      };
      setPanOffset(newOffset);
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  // Setup panning event listeners
  useEffect(() => {
    if (isPanning) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isPanning, handleMouseMove, handleMouseUp]);

  // Handle connection removal
  const handleConnectionRemove = async (connectionId) => {
    await removeConnection(connectionId);
    setSelectedConnection(null);
  };

  // Handle memory removal
  const handleMemoryRemove = async (memoryId) => {
    // Remove connections involving this memory
    const relatedConnections = connections.filter(
      conn => conn.from === memoryId || conn.to === memoryId
    );
    for (const conn of relatedConnections) {
      await removeConnection(conn.id);
    }
    // Remove the memory
    await removeMemoryFromBoard(memoryId);
  };

  if (loading) {
    return <div className="public-board-loading">Loading board...</div>;
  }

  if (error) {
    return <div className="public-board-error">Error: {error}</div>;
  }

  if (!boardData) {
    return <div className="public-board-error">Board not found</div>;
  }

  return (
    <div className="public-board-container">
      {/* Header */}
      <div className="public-board-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Boards
        </button>
        <h2>{boardData.title}</h2>
        <div className="board-info">
          <span>{boardMemories.length} memories</span>
          <span>•</span>
          <span>{connections.length} connections</span>
        </div>
      </div>

      {/* Main board area */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board-layout">
          {/* Sidebar with user's memories */}
          <div className="memory-sidebar">
            <h3>Your Memories</h3>
            <button
              className="add-memory-btn"
              onClick={() => setShowMemorySelector(!showMemorySelector)}
            >
              + Add to Board
            </button>
            {showMemorySelector && (
              <div className="memory-list">
                {userMemories.map(memory => (
                  <div
                    key={memory.id}
                    className="sidebar-memory"
                    onClick={() => {
                      // Add memory at center of viewport
                      const centerPosition = {
                        x: -panOffset.x + window.innerWidth / 2 + CANVAS_OFFSET_X,
                        y: -panOffset.y + window.innerHeight / 2 + CANVAS_OFFSET_Y
                      };
                      addMemoryToBoard(memory, centerPosition, user?.uid);
                    }}
                  >
                    <MemoryCard memory={memory} isStackedView={false} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div
            className="canvas-container"
            onMouseDown={handleMouseDown}
            onClick={handleCanvasClick}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              cursor: isPanning ? 'grabbing' : 'default'
            }}
          >
            <svg
              className="connections-svg"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                position: 'absolute',
                left: -CANVAS_OFFSET_X,
                top: -CANVAS_OFFSET_Y,
                pointerEvents: 'none'
              }}
            >
              <Connections
                connections={connections}
                droppedMemories={boardMemories}
                standalonePins={standalonePins}
                selectedConnection={selectedConnection}
                setSelectedConnection={setSelectedConnection}
                panOffset={{ x: 0, y: 0 }}
                canvasOffset={{ x: CANVAS_OFFSET_X, y: CANVAS_OFFSET_Y }}
              />
            </svg>

            <Canvas
              droppedMemories={boardMemories}
              selectedPin={selectedPin}
              onPinClick={handlePinClick}
              isStackedView={false}
              onContextMenu={(e, type, item) => {
                e.preventDefault();
                if (type === 'memory') {
                  if (window.confirm('Remove this memory from the board?')) {
                    handleMemoryRemove(item.id);
                  }
                }
              }}
              onDoubleClick={() => {}}
              onClick={handleMemoryClick}
              connections={connections}
              showOpacityFading={false}
              constellationSelectedNodes={null}
              formatTitleForDisplay={(title) => title}
              inlineEditingMemoryId={null}
              onInlineMemoryUpdate={() => {}}
              onInlineMemoryBlur={() => {}}
              onInlineMemoryEscape={() => {}}
              isConstellationMode={false}
            />

            <StandalonePins
              standalonePins={standalonePins}
              selectedPin={selectedPin}
              setSelectedPin={setSelectedPin}
              panOffset={{ x: 0, y: 0 }}
              canvasOffset={{ x: CANVAS_OFFSET_X, y: CANVAS_OFFSET_Y }}
            />
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeId && activeMemoryData ? (
            <div style={{ opacity: 0.8 }}>
              <MemoryCard memory={activeMemoryData} isStackedView={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Memory popup */}
      {memoryPopup && (
        <MemoryPopup
          memory={memoryPopup.memory}
          position={memoryPopup.position}
          onClose={() => setMemoryPopup(null)}
        />
      )}
    </div>
  );
}

export default PublicBoard;