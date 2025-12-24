import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import Canvas from '../conspiracy-board/Canvas';
import Connections from '../conspiracy-board/Connections';
import StandalonePins from '../conspiracy-board/StandalonePins';
import MemoryCard from '../shared/MemoryCard';
import MemoryPopup from '../shared/MemoryPopup';
import { ArrowLeft } from 'lucide-react';
import './SharedBoard.css';

// Canvas size constants
const CANVAS_WIDTH = 10000;
const CANVAS_HEIGHT = 8000;
const CANVAS_OFFSET_X = 4500;
const CANVAS_OFFSET_Y = 3000;

export default function SharedBoardView({ sharedBoard, updateSharedBoard, recordMemoryView, recordAction }) {
  const {
    name,
    sharedBy,
    sharedWith,
    droppedMemories: initialMemories = [],
    connections: initialConnections = [],
    standalonePins: initialPins = []
  } = sharedBoard;

  // Local state for board content
  const [droppedMemories, setDroppedMemories] = useState(initialMemories);
  const [connections, setConnections] = useState(initialConnections);
  const [standalonePins, setStandalonePins] = useState(initialPins);

  // Sync with Firebase updates
  useEffect(() => {
    setDroppedMemories(sharedBoard.droppedMemories || []);
    setConnections(sharedBoard.connections || []);
    setStandalonePins(sharedBoard.standalonePins || []);
  }, [sharedBoard]);

  // Drag and drop state
  const [activeId, setActiveId] = useState(null);
  const [activeMemoryData, setActiveMemoryData] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [memoryPopup, setMemoryPopup] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);

  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);

  // Debounced save
  const saveTimeoutRef = useRef(null);
  const saveToFirebase = useCallback((updates) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      updateSharedBoard(updates);
    }, 1000);
  }, [updateSharedBoard]);

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

    const memory = droppedMemories.find(m => `canvas-${m.id}` === active.id);
    setActiveMemoryData(memory);
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over?.id === 'canvas' || over?.id === 'canvas-container') {
      const memoryId = active.id.replace('canvas-', '');
      const memory = droppedMemories.find(m => String(m.id) === String(memoryId));

      if (memory) {
        const newX = memory.x + event.delta.x;
        const newY = memory.y + event.delta.y;

        const updatedMemories = droppedMemories.map(m =>
          String(m.id) === String(memoryId)
            ? { ...m, x: newX, y: newY }
            : m
        );

        setDroppedMemories(updatedMemories);
        saveToFirebase({ droppedMemories: updatedMemories });
      }
    }

    setActiveId(null);
    setActiveMemoryData(null);
  };

  // Handle pin clicks for connections
  const handlePinClick = (memoryId) => {
    if (!selectedPin) {
      setSelectedPin(memoryId);
    } else if (selectedPin !== memoryId) {
      // Create connection
      const newConnection = {
        id: `conn-${Date.now()}`,
        from: selectedPin,
        to: memoryId
      };
      const updatedConnections = [...connections, newConnection];
      setConnections(updatedConnections);
      saveToFirebase({ connections: updatedConnections });

      // Record the connection action
      if (recordAction) {
        const fromMemory = droppedMemories.find(m => String(m.id) === String(selectedPin));
        const toMemory = droppedMemories.find(m => String(m.id) === String(memoryId));
        recordAction('connection_made', {
          fromMemoryTitle: fromMemory?.title || 'Unknown',
          toMemoryTitle: toMemory?.title || 'Unknown'
        });
      }

      setSelectedPin(null);
    } else {
      // Clicking same pin again, deselect
      setSelectedPin(null);
    }
  };

  // Handle canvas click
  const handleCanvasClick = (e) => {
    if (e.target.classList.contains('canvas')) {
      setSelectedPin(null);
      setSelectedConnection(null);
    }
  };

  // Handle memory click to show popup
  const handleMemoryClick = (e, memory) => {
    if (e.target.classList.contains('memory-pin')) return;

    // Record that this memory was viewed
    if (recordMemoryView) {
      recordMemoryView(memory.id, memory.title);
    }

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
  const handleConnectionClick = (connectionId) => {
    setSelectedConnection(connectionId);
  };

  const handleRemoveConnection = (connectionId) => {
    const updatedConnections = connections.filter(c => c.id !== connectionId);
    setConnections(updatedConnections);
    saveToFirebase({ connections: updatedConnections });
    setSelectedConnection(null);
  };

  const sharerName = sharedBy?.firstName || 'Someone';
  const recipientName = sharedWith?.name || 'you';

  return (
    <div className="shared-board-view">
      {/* Header */}
      <div className="shared-board-header">
        <div className="header-left">
          <a href="/" className="back-link">
            <ArrowLeft size={20} />
            Memory Library
          </a>
        </div>
        <div className="header-center">
          <h2>{name || 'Shared Board'}</h2>
          <span className="shared-by">
            Shared by {sharerName} with {recipientName}
          </span>
        </div>
        <div className="header-right">
          <span className="board-stats">
            {droppedMemories.length} memories • {connections.length} connections
          </span>
        </div>
      </div>

      {/* Main board area */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="shared-canvas-container canvas-container"
          onMouseDown={handleMouseDown}
          onClick={handleCanvasClick}
          style={{
            cursor: isPanning ? 'grabbing' : 'default'
          }}
        >
          <div
            className="pan-container"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: '0 0',
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              position: 'absolute',
              left: `-${CANVAS_OFFSET_X}px`,
              top: `-${CANVAS_OFFSET_Y}px`
            }}
          >
            <Canvas
              droppedMemories={droppedMemories}
              selectedPin={selectedPin}
              onPinClick={handlePinClick}
              isStackedView={false}
              isPublicBoard={true}
              onContextMenu={(e) => e.preventDefault()}
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
              onPinClick={handlePinClick}
              onUpdatePosition={() => {}}
              onContextMenu={(e) => e.preventDefault()}
              isPlacingPin={false}
              placementPosition={null}
              showAllInsights={false}
              constellationSelectedNodes={null}
              panOffset={panOffset}
            />

            <Connections
              connections={connections}
              droppedMemories={droppedMemories}
              standalonePins={standalonePins}
              activeTransform={null}
              onConnectionClick={() => {}}
              onConnectionDelete={() => {}}
              onConnectionContextMenu={(e) => e.preventDefault()}
              showOpacityFading={false}
              isStackedView={false}
              showAllInsights={false}
              selectedPin={selectedPin}
              cursorPosition={null}
              constellationSelectedNodes={null}
              stringsInFront={true}
              isDragging={false}
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

      {/* Help hint */}
      <div className="pan-hint">
        Alt + drag or middle-click to pan
      </div>
    </div>
  );
}
