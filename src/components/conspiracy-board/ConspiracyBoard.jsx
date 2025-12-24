import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor, useDroppable } from '@dnd-kit/core'
import { Library, Grid3x3, Eye, EyeOff, Trash2, Lightbulb, Pin, MapPin, Star, Flag, X, Pencil, Undo2, Plus, SquarePlus, Copy, BookOpen, Map, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Share2 } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { useConfirm } from '../../contexts/ConfirmContext'
import Sidebar from './Sidebar'
import SidebarContainer from '../shared/Sidebar'
import Canvas from './Canvas'
import Connections from './Connections'
import DragConnections from './DragConnections'
import StandalonePins from './StandalonePins'
import VennDiagramModal from './VennDiagramModal'
import MemoryModal from '../shared/MemoryModal'
import SettingsModal from '../shared/SettingsModal'
import RecentlyDeletedModal from '../shared/RecentlyDeletedModal'
import ConstellationSidebar from './ConstellationSidebar'
import PinEditModal from './PinEditModal'
import Modal from '../shared/Modal'
import PinGrid from './PinGrid'
import ShareBoardModal from './ShareBoardModal'
import ContextMenu from '../shared/ContextMenu'
import MemoryPopup from '../shared/MemoryPopup'
import MemoryCard from '../shared/MemoryCard'
import UserAvatar from '../shared/UserAvatar'
import Dropdown from '../shared/Dropdown'
import Header from '../shared/Header'
import LibraryIcon from '../shared/LibraryIcon'
import TabbedSidebar from '../shared/TabbedSidebar'
import ToolRail from '../shared/ToolRail'
import { AddMemoryIcon, PlaygroundIcon } from '../icons'
import useBoardState from '../../hooks/useBoardState'
import useAuth from '../../hooks/useAuth'
import { useUserProfile } from '../../hooks/useUserProfile'
import useSavedBoards from '../../hooks/useSavedBoards'
import useSimplifyView from '../../hooks/useSimplifyView'
import useLibraries from '../../hooks/useLibraries'
import useLibraryFilter from '../../hooks/useLibraryFilter'
import { usePlaygrounds } from '../../hooks/usePlaygrounds'
import { useSharedBoardTracking } from '../../hooks/useSharedBoardTracking'
import PlaygroundModal from '../playgrounds/PlaygroundModal'
import { normalizeId, compareIds, findById } from '../../utils/idUtils'
import { generatePinId, generateLocalId, ensureStringId } from '../../utils/generateId'
import { CARD_WIDTH, CARD_HEIGHT } from './constants'
import { getLockedMemoryIds } from '../../utils/getLockedMemoryIds'
import '../../App.css'
import './ConspiracyBoard.css'
import '../../styles/simplifyView.css'
import '../archive/LibrarySidebar.css'

// Canvas size constants for infinite panning
// Canvas needs to be large enough to cover all pannable area for dnd-kit collision detection
const CANVAS_WIDTH = 10000   // ~7 viewports wide (allows ~±3 viewports from center)
const CANVAS_HEIGHT = 8000   // ~9 viewports tall (allows ~±3 viewports from center)
const CANVAS_OFFSET_X = 4500 // X offset to center the canvas
const CANVAS_OFFSET_Y = 3000 // Y offset to center the canvas

// Helper function to generate unique board names with timestamps
const generateBoardName = () => {
  const now = new Date()
  const options = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }
  const timestamp = now.toLocaleString('en-US', options)
  return `Untitled Board - ${timestamp}`
}

function ConspiracyBoard({
  memories = [],
  memoriesLoading,
  addMemory,
  updateMemory,
  deleteMemory,
  deletedMemories = [],
  restoreMemory,
  permanentlyDeleteMemory,
  emptyTrash
}) {
  const [activeId, setActiveId] = useState(null)
  const [activeMemoryData, setActiveMemoryData] = useState(null)
  const [activeTransform, setActiveTransform] = useState(null)
  const [optimisticPositions, setOptimisticPositions] = useState({})
  const [optimisticPinPositions, setOptimisticPinPositions] = useState({})
  const [selectedPin, setSelectedPin] = useState(null)
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [showVennModal, setShowVennModal] = useState(false)
  const [showAddMemoryModal, setShowAddMemoryModal] = useState(false)
  const [editingMemory, setEditingMemory] = useState(null)
  const [viewMode, setViewMode] = useState(false)
  const [showOpacityFading, setShowOpacityFading] = useState(false)
  const [showAllInsights, setShowAllInsights] = useState(false)
  const [stringsInFront, setStringsInFront] = useState(true) // Default: strings appear in front of cards
  const [isPlacingPin, setIsPlacingPin] = useState(false)
  const [pinPlacementPosition, setPinPlacementPosition] = useState(null)
  const [isPlacingConstellation, setIsPlacingConstellation] = useState(false)
  const [placingConstellationData, setPlacingConstellationData] = useState(null)
  const [constellationPlacementPosition, setConstellationPlacementPosition] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [memoryPopup, setMemoryPopup] = useState(null)
  const [isConstellationMode, setIsConstellationMode] = useState(false)
  const [constellationSelectedNodes, setConstellationSelectedNodes] = useState(null)
  const [editingPin, setEditingPin] = useState(null)
  const [showSaveBoardModal, setShowSaveBoardModal] = useState(false)
  const [showLoadBoardModal, setShowLoadBoardModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [boardNameInput, setBoardNameInput] = useState('')
  const [openDropdown, setOpenDropdown] = useState(null) // Track which dropdown is currently open
  const [isEditingBoardName, setIsEditingBoardName] = useState(false)
  const [editingBoardNameValue, setEditingBoardNameValue] = useState('')
  // Get saved board name from localStorage or use null initially
  const [activeBoardName, setActiveBoardName] = useState(() => {
    return localStorage.getItem('activeBoardName') || null
  })
  const [cursorPosition, setCursorPosition] = useState(null)
  // Sidebar starts closed on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    return !isMobile
  })
  const [sidebarSearchTerm, setSidebarSearchTerm] = useState('')
  const [sidebarAdvancedFiltered, setSidebarAdvancedFiltered] = useState(null)
  const [inlineEditingMemoryId, setInlineEditingMemoryId] = useState(null)
  const [contextMenuPosition, setContextMenuPosition] = useState(null)
  const [playgroundOpen, setPlaygroundOpen] = useState(false)
  const [currentPlaygroundId, setCurrentPlaygroundId] = useState(null)
  const [dragOverLibraryId, setDragOverLibraryId] = useState(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [isDraggingMinimap, setIsDraggingMinimap] = useState(false)
  const [minimapDragStart, setMinimapDragStart] = useState(null)
  const minimapDragJustEnded = useRef(false)
  const [gridVisibleForPin, setGridVisibleForPin] = useState(null) // Pin ID for which grid is visible
  const [showExpandArrow, setShowExpandArrow] = useState({ left: false, right: false, up: false, down: false })
  const [showZoomIndicator, setShowZoomIndicator] = useState(false) // Show zoom level briefly on change

  // Dynamic canvas bounds - starts at 2x viewport, expandable by half viewport increments
  // Store as { width, height, offsetX, offsetY } where offset is distance from left/top edge to origin
  const [canvasBounds, setCanvasBounds] = useState(() => {
    // Try to restore from sessionStorage first
    const savedBounds = sessionStorage.getItem('boardCanvasBounds')
    if (savedBounds) {
      try {
        return JSON.parse(savedBounds)
      } catch (e) {
        console.warn('Failed to parse saved canvas bounds:', e)
      }
    }
    // Default to 2x viewport (half screen pan in each direction)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    return {
      width: viewportWidth * 2,
      height: viewportHeight * 2,
      offsetX: viewportWidth,  // Origin is centered
      offsetY: viewportHeight
    }
  })

  // Hooks
  const { confirm } = useConfirm()

  // Pan state - Initialize from sessionStorage to prevent flash on reload
  // CRITICAL: This prevents the "jump to 0,0" issue on page reload
  // The initialization function runs ONCE on mount, before first render
  const [panOffset, setPanOffset] = useState(() => {
    // SessionStorage provides instant restoration within the same browser session
    // This is faster than waiting for Firebase data to load
    const savedPan = sessionStorage.getItem('boardPanOffset')
    if (savedPan) {
      try {
        const parsed = JSON.parse(savedPan)
        console.log('🔄 Restored pan offset from sessionStorage:', parsed)
        return parsed  // Use saved position immediately
      } catch (e) {
        console.warn('Failed to parse saved pan offset:', e)
      }
    }
    return { x: 0, y: 0 }  // Only use 0,0 if no saved position exists
  })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState(null)
  const [smoothPan, setSmoothPan] = useState(false) // Enable smooth transition for programmatic panning

  // Zoom state - Start at 75% on mobile, 100% on desktop
  const [zoomLevel, setZoomLevel] = useState(() => {
    const savedZoom = sessionStorage.getItem('boardZoomLevel')
    if (savedZoom) {
      const parsed = parseFloat(savedZoom)
      // Valid zoom levels: 10%, 25%, 50%, 75%, 100%
      if ([0.1, 0.25, 0.5, 0.75, 1.0].includes(parsed)) {
        return parsed
      }
    }
    // Default to 75% on mobile (touch devices), 100% on desktop
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    return isMobile ? 0.75 : 1.0
  })

  // Track cleanup function for event listeners
  const cleanupRef = useRef(null)

  // Touch/pinch zoom tracking
  const pinchStartRef = useRef(null) // { distance, zoom } when pinch started
  const lastTouchRef = useRef(null) // Track last touch position for single-finger pan
  const zoomLevelRef = useRef(zoomLevel) // Keep current zoom level in ref for native listeners
  const panOffsetRef = useRef(panOffset) // Keep current pan offset in ref for native listeners

  // Long-press for context menu on mobile
  const longPressTimerRef = useRef(null)
  const longPressTouchRef = useRef(null) // { x, y, type, data } - track touch start position and context

  // Track if we've loaded the initial pan offset to prevent multiple updates causing flash
  const hasLoadedInitialPanOffset = useRef(false)

  // Debounce timer for saving pan offset from wheel events
  const panSaveTimeoutRef = useRef(null)

  // Timer for keeping expand arrows visible
  const expandArrowTimeoutRef = useRef(null)

  // Undo/Redo system
  const MAX_UNDO_STATES = 50
  const [undoHistory, setUndoHistory] = useState([])
  const [redoHistory, setRedoHistory] = useState([])

  // Get current user
  const { user, loading: authLoading } = useAuth()
  const { profile } = useUserProfile(user)

  // Use saved boards hook
  const { savedBoards, saveBoard, loadBoard, deleteBoard, renameBoard } = useSavedBoards(user?.uid, authLoading)

  // Simplify view hook
  const {
    isSimplified,
    toggleSimplify,
    processInputTitle,
    formatTitleForDisplay,
  } = useSimplifyView()

  // Playgrounds hook
  const { createPlayground } = usePlaygrounds(user?.uid)

  // Libraries hook
  const {
    libraries,
    loading: librariesLoading,
    createLibrary,
    addMemoryToLibrary,
    getLibraryMemories
  } = useLibraries(user?.uid)

  // Library filter hook for sidebar
  const {
    selectedLibraryId,
    filteredMemories: libraryFilteredMemories,
    selectLibrary,
    clearFilter: clearLibraryFilter
  } = useLibraryFilter(libraries, memories, getLibraryMemories, librariesLoading, user?.uid)

  // Apply locked library filtering
  // Only filter out locked memories when NOT viewing any specific library
  const sidebarMemories = useMemo(() => {
    if (selectedLibraryId) {
      // When viewing a library, show all its memories (already filtered by useLibraryFilter)
      return libraryFilteredMemories;
    }
    // When not viewing a library, filter out locked memories
    const lockedMemoryIds = getLockedMemoryIds(libraries, memories);
    if (lockedMemoryIds.size === 0) return libraryFilteredMemories;
    return libraryFilteredMemories.filter(memory => !lockedMemoryIds.has(String(memory.id)));
  }, [selectedLibraryId, libraryFilteredMemories, libraries, memories]);

  // Make canvas-container droppable
  const { setNodeRef: setContainerRef } = useDroppable({
    id: 'canvas-container',
  })

  // Use Firebase for board state
  const {
    boardState,
    loading: boardStateLoading,
    error: boardStateError,
    updateBoardState
  } = useBoardState(user?.uid, authLoading)

  const { droppedMemories = [], connections = [], standalonePins = [], panOffset: savedPanOffset = { x: 0, y: 0 } } = boardState || {}

  // Track activity on imported shared boards
  const {
    trackMemoryView,
    trackMemoryMoved,
    trackMemoryEdited,
    trackMemoryRemoved,
    trackConnectionMade,
    trackConnectionDeleted,
    trackConnectionInsightEdited,
    trackPinCreated,
    trackPinMoved,
    trackPinEdited,
    trackPinDeleted
  } = useSharedBoardTracking(boardState?.importedFrom)

  // Clear optimistic positions only on mount (to clean up after page reload)
  useEffect(() => {
    setOptimisticPositions({})
    setOptimisticPinPositions({})
  }, [])

  // Keep refs updated for native event listeners
  useEffect(() => {
    zoomLevelRef.current = zoomLevel
  }, [zoomLevel])

  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])

  // CRITICAL: Controlled sessionStorage saving - prevents conflicts
  // This function is ONLY called on user interaction (drag, wheel, reset)
  // Never call this when loading data from Firebase to avoid circular updates
  const savePanOffsetToSession = useCallback((offset) => {
    sessionStorage.setItem('boardPanOffset', JSON.stringify(offset))
    console.log('💾 Saved pan offset to sessionStorage:', offset)
  }, [])

  // Save canvas bounds to sessionStorage
  const saveCanvasBoundsToSession = useCallback((bounds) => {
    sessionStorage.setItem('boardCanvasBounds', JSON.stringify(bounds))
  }, [])

  // Calculate canvas bounds that fit all existing content
  const calculateBoundsForContent = useCallback((memories, pins, currentBounds) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Start with default 2x viewport bounds
    let minX = -viewportWidth   // Left edge relative to origin
    let maxX = viewportWidth    // Right edge relative to origin
    let minY = -viewportHeight  // Top edge relative to origin
    let maxY = viewportHeight   // Bottom edge relative to origin

    // Check all memories - positions are in large canvas coords
    // Origin (panOffset=0) is at CANVAS_OFFSET_X, CANVAS_OFFSET_Y in large canvas
    memories.forEach(memory => {
      const relX = memory.x - CANVAS_OFFSET_X  // Position relative to origin
      const relY = memory.y - CANVAS_OFFSET_Y
      minX = Math.min(minX, relX - 100)  // Add padding
      maxX = Math.max(maxX, relX + 100)
      minY = Math.min(minY, relY - 100)
      maxY = Math.max(maxY, relY + 100)
    })

    // Check all pins
    pins.forEach(pin => {
      const relX = pin.x - CANVAS_OFFSET_X
      const relY = pin.y - CANVAS_OFFSET_Y
      minX = Math.min(minX, relX - 50)
      maxX = Math.max(maxX, relX + 50)
      minY = Math.min(minY, relY - 50)
      maxY = Math.max(maxY, relY + 50)
    })

    // Calculate bounds that contain all content
    const width = maxX - minX
    const height = maxY - minY
    const offsetX = -minX  // Distance from left edge to origin

    const offsetY = -minY  // Distance from top edge to origin

    return { width, height, offsetX, offsetY }
  }, [])

  // Expand canvas in a specific direction by half viewport
  const expandCanvas = useCallback((direction) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const halfWidth = viewportWidth / 2
    const halfHeight = viewportHeight / 2

    setCanvasBounds(prev => {
      let newBounds = { ...prev }

      switch (direction) {
        case 'left':
          newBounds.width += halfWidth
          newBounds.offsetX += halfWidth // Push origin right to maintain positions
          break
        case 'right':
          newBounds.width += halfWidth
          break
        case 'up':
          newBounds.height += halfHeight
          newBounds.offsetY += halfHeight // Push origin down to maintain positions
          break
        case 'down':
          newBounds.height += halfHeight
          break
      }

      saveCanvasBoundsToSession(newBounds)
      return newBounds
    })
  }, [])

  // Firebase sync logic - handles loading saved positions from database
  // CRITICAL: This runs AFTER sessionStorage initialization to handle cross-device sync
  useEffect(() => {
    // Only run once after Firebase finishes loading to avoid multiple updates
    if (!boardStateLoading && savedPanOffset && !hasLoadedInitialPanOffset.current) {
      // Compare Firebase value with current sessionStorage value
      // This handles cases where user opens app in new tab/device
      const sessionPan = sessionStorage.getItem('boardPanOffset')
      let currentPan = { x: 0, y: 0 }
      if (sessionPan) {
        try {
          currentPan = JSON.parse(sessionPan)
        } catch (e) {}
      }

      // IMPORTANT: Use threshold (>1) to avoid conflicts from rounding differences
      // Without this, Firebase and sessionStorage can fight over tiny differences
      const isDifferent = Math.abs(savedPanOffset.x - currentPan.x) > 1 ||
                         Math.abs(savedPanOffset.y - currentPan.y) > 1

      if (isDifferent) {
        // Only update if Firebase has significantly different data
        // This happens when opening in new tab or after clearing sessionStorage
        console.log('🔵 Loaded different pan offset from Firebase:', savedPanOffset, 'vs current:', currentPan)
        setPanOffset(savedPanOffset)
        // Note: We don't call savePanOffsetToSession here to avoid circular updates
      }
      hasLoadedInitialPanOffset.current = true
    }
  }, [savedPanOffset?.x, savedPanOffset?.y, boardStateLoading])

  // Adjust canvas bounds on initial load to fit existing content
  const hasAdjustedInitialBounds = useRef(false)
  useEffect(() => {
    if (!boardStateLoading && !hasAdjustedInitialBounds.current && droppedMemories.length > 0) {
      const contentBounds = calculateBoundsForContent(droppedMemories, standalonePins, canvasBounds)

      // Only expand if content is outside current bounds
      if (contentBounds.width > canvasBounds.width ||
          contentBounds.height > canvasBounds.height ||
          contentBounds.offsetX > canvasBounds.offsetX ||
          contentBounds.offsetY > canvasBounds.offsetY) {
        const expandedBounds = {
          width: Math.max(canvasBounds.width, contentBounds.width),
          height: Math.max(canvasBounds.height, contentBounds.height),
          offsetX: Math.max(canvasBounds.offsetX, contentBounds.offsetX),
          offsetY: Math.max(canvasBounds.offsetY, contentBounds.offsetY)
        }
        setCanvasBounds(expandedBounds)
        saveCanvasBoundsToSession(expandedBounds)
      }
      hasAdjustedInitialBounds.current = true
    }
  }, [boardStateLoading, droppedMemories, standalonePins, canvasBounds, calculateBoundsForContent, saveCanvasBoundsToSession])

  // Save activeBoardName to localStorage whenever it changes
  useEffect(() => {
    if (activeBoardName) {
      localStorage.setItem('activeBoardName', activeBoardName)
    }
  }, [activeBoardName])

  // Cleanup pan save timeout on unmount
  useEffect(() => {
    return () => {
      if (panSaveTimeoutRef.current) {
        clearTimeout(panSaveTimeoutRef.current)
      }
    }
  }, [])

  // On component mount, check for existing boards and use the most recent untitled one
  useEffect(() => {
    if (savedBoards.length > 0) {
      const savedName = localStorage.getItem('activeBoardName')

      // Check if the saved name exists in the board list
      if (savedName) {
        const boardExists = savedBoards.some(board => board.id === savedName)
        if (boardExists) {
          // Board exists, keep using it
          if (!activeBoardName) {
            setActiveBoardName(savedName)
          }
          return
        }
      }

      // If no active board name yet, try to find an existing untitled board
      if (!activeBoardName) {
        // Look for the most recent untitled board to reuse
        const untitledBoards = savedBoards.filter(board =>
          board.id && board.id.startsWith('Untitled Board')
        )

        if (untitledBoards.length > 0) {
          // Use the most recent untitled board instead of creating a new one
          const mostRecentBoard = untitledBoards[0]
          setActiveBoardName(mostRecentBoard.id)

          // Load its data
          const boardData = loadBoard(mostRecentBoard.id)
          if (boardData) {
            updateBoardState(boardData)
          }
        } else {
          // No existing untitled boards, create a new one
          setActiveBoardName(generateBoardName())
        }
      }
    } else if (savedBoards.length === 0 && !activeBoardName) {
      // No boards exist at all, create the first one
      setActiveBoardName(generateBoardName())
    }
  }, [savedBoards]) // Only run when savedBoards changes

  // Auto-save to active board when board state changes
  useEffect(() => {
    if (activeBoardName && boardState && user?.uid) {
      // Debounce the auto-save to avoid too many writes
      const timeoutId = setTimeout(() => {
        saveBoard(activeBoardName, boardState).catch(error => {
          console.error('Auto-save failed:', error)
        })
      }, 1000)

      return () => clearTimeout(timeoutId)
    }
  }, [boardState, activeBoardName, user?.uid, saveBoard])

  // Keyboard shortcut for adding memory (Shift+N)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if Shift+N is pressed
      if (e.shiftKey && e.key === 'N') {
        // Don't trigger if user is typing in an input or textarea
        const activeElement = document.activeElement
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable
        )

        if (!isTyping) {
          e.preventDefault()
          handleAddMemory()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Coordinate conversion helpers (accounts for canvas offset, pan, and zoom)
  // With transformOrigin: '0 0', the math is:
  //   screenPos = canvasPos * zoom + panOffset - CANVAS_OFFSET
  const screenToCanvas = useCallback((screenX, screenY) => {
    return {
      x: (screenX + CANVAS_OFFSET_X - panOffset.x) / zoomLevel,
      y: (screenY + CANVAS_OFFSET_Y - panOffset.y) / zoomLevel
    }
  }, [panOffset, zoomLevel])

  const canvasToScreen = useCallback((canvasX, canvasY) => {
    return {
      x: canvasX * zoomLevel + panOffset.x - CANVAS_OFFSET_X,
      y: canvasY * zoomLevel + panOffset.y - CANVAS_OFFSET_Y
    }
  }, [panOffset, zoomLevel])

  // Zoom to viewport center - adjusts panOffset to keep center point stable
  const zoomToCenter = useCallback((newZoom) => {
    // Get viewport dimensions (account for sidebar if open)
    const sidebarWidth = document.querySelector('.sidebar-container.open') ? 400 : 0
    const viewportWidth = window.innerWidth - sidebarWidth
    const viewportHeight = window.innerHeight

    // Calculate viewport center in canvas coordinates (using current zoom)
    const centerCanvasX = (viewportWidth / 2 + CANVAS_OFFSET_X - panOffset.x) / zoomLevel
    const centerCanvasY = (viewportHeight / 2 + CANVAS_OFFSET_Y - panOffset.y) / zoomLevel

    // Calculate new panOffset to keep the same canvas point at viewport center
    const newPanX = viewportWidth / 2 - centerCanvasX * newZoom + CANVAS_OFFSET_X
    const newPanY = viewportHeight / 2 - centerCanvasY * newZoom + CANVAS_OFFSET_Y

    // Clamp to pan bounds using dynamic canvas bounds
    const maxPanX = canvasBounds.offsetX
    const maxPanY = canvasBounds.offsetY
    const clampedOffset = {
      x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newPanY))
    }

    setZoomLevel(newZoom)
    setPanOffset(clampedOffset)
    sessionStorage.setItem('boardZoomLevel', newZoom.toString())
    savePanOffsetToSession(clampedOffset)

    console.log('🔍 Zoom to center:', newZoom, 'pan:', clampedOffset)
  }, [panOffset, zoomLevel, savePanOffsetToSession, canvasBounds])

  // Apply optimistic position updates for smooth dragging
  const displayMemories = droppedMemories.map(memory => {
    // Ensure ID is normalized for object key lookup
    const normalizedId = ensureStringId(memory.id)
    if (optimisticPositions[normalizedId]) {
      return { ...memory, ...optimisticPositions[normalizedId] }
    }
    return memory
  })

  // Apply optimistic position updates for standalone pins
  const displayStandalonePins = standalonePins.map(pin => {
    // Ensure ID is normalized for object key lookup
    const normalizedId = ensureStringId(pin.id)
    if (optimisticPinPositions[normalizedId]) {
      return { ...pin, ...optimisticPinPositions[normalizedId] }
    }
    return pin
  })


  // Save state for undo
  const saveStateForUndo = useCallback((actionDescription = 'Action') => {
    const state = {
      droppedMemories: JSON.parse(JSON.stringify(droppedMemories)),
      connections: JSON.parse(JSON.stringify(connections)),
      standalonePins: JSON.parse(JSON.stringify(standalonePins)),
      timestamp: Date.now(),
      description: actionDescription
    }

    setUndoHistory(prev => {
      const newHistory = [...prev, state]
      // Limit history size
      if (newHistory.length > MAX_UNDO_STATES) {
        newHistory.shift()
      }
      return newHistory
    })

    // Clear redo history when a new action is performed
    setRedoHistory([])
  }, [droppedMemories, connections, standalonePins, MAX_UNDO_STATES])

  // Perform undo
  const performUndo = useCallback(() => {
    if (undoHistory.length === 0) {
      return
    }

    // Save current state to redo history before undoing
    const currentState = {
      droppedMemories: JSON.parse(JSON.stringify(droppedMemories)),
      connections: JSON.parse(JSON.stringify(connections)),
      standalonePins: JSON.parse(JSON.stringify(standalonePins)),
      timestamp: Date.now(),
      description: 'Redo point'
    }

    setRedoHistory(prev => {
      const newHistory = [...prev, currentState]
      // Limit redo history size
      if (newHistory.length > MAX_UNDO_STATES) {
        newHistory.shift()
      }
      return newHistory
    })

    const previousState = undoHistory[undoHistory.length - 1]

    // Restore the previous state, preserving current pan position
    updateBoardState({
      droppedMemories: previousState.droppedMemories,
      connections: previousState.connections,
      standalonePins: previousState.standalonePins,
      panOffset: panOffset
    })

    // Remove this state from history
    setUndoHistory(prev => prev.slice(0, -1))
  }, [undoHistory, droppedMemories, connections, standalonePins, updateBoardState, panOffset, MAX_UNDO_STATES])

  // Perform redo
  const performRedo = useCallback(() => {
    if (redoHistory.length === 0) {
      return
    }

    // Save current state to undo history before redoing
    const currentState = {
      droppedMemories: JSON.parse(JSON.stringify(droppedMemories)),
      connections: JSON.parse(JSON.stringify(connections)),
      standalonePins: JSON.parse(JSON.stringify(standalonePins)),
      timestamp: Date.now(),
      description: 'Undo point'
    }

    setUndoHistory(prev => {
      const newHistory = [...prev, currentState]
      // Limit undo history size
      if (newHistory.length > MAX_UNDO_STATES) {
        newHistory.shift()
      }
      return newHistory
    })

    const nextState = redoHistory[redoHistory.length - 1]

    // Restore the next state, preserving current pan position
    updateBoardState({
      droppedMemories: nextState.droppedMemories,
      connections: nextState.connections,
      standalonePins: nextState.standalonePins,
      panOffset: panOffset
    })

    // Remove this state from redo history
    setRedoHistory(prev => prev.slice(0, -1))
  }, [redoHistory, droppedMemories, connections, standalonePins, updateBoardState, panOffset, MAX_UNDO_STATES])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms hold before drag starts (helps distinguish from scrolling)
        tolerance: 5, // 5px movement tolerance during delay
      },
    })
  )

  const handleDragStart = (event) => {
    if (isConstellationMode) return // Prevent dragging in constellation mode
    setActiveId(event.active.id)
    // Store the memory data directly from the drag event
    const memoryData = event.active.data?.current || event.active.data
    // Only set activeMemoryData if it's not a standalone pin
    if (!memoryData?.isStandalonePin) {
      setActiveMemoryData(memoryData)
    }
    setActiveTransform(null)
  }

  const handleDragMove = (event) => {
    if (isConstellationMode) return // Prevent dragging in constellation mode
    const { active, delta } = event
    if (active) {
      setActiveTransform({ id: active.id, delta })
    }
  }

const handleDragEnd = (event) => {
  if (isConstellationMode) return // Prevent dragging in constellation mode
  const { active, over, delta } = event

  setActiveId(null)
  setActiveMemoryData(null)
  setActiveTransform(null)

  // Check for memory data in both active.data.current and active.data
  const memoryData = active.data?.current || active.data

  // If dropping on canvas from sidebar (allow drops anywhere in the pan area)
  // Accept drops even when over is null (outside original viewport but within pan area)
  if (!memoryData?.isOnCanvas && !memoryData?.isStandalonePin && memoryData) {
    if (!memoryData || !memoryData.id) {
      console.error('No valid memory data found for dragged item')
      return
    }

    // Get the canvas-container rect (the visible viewport)
    const containerRect = document.querySelector('.canvas-container').getBoundingClientRect()
    // Calculate mouse position relative to container
    const screenX = active.rect?.current?.translated?.left - containerRect.left || 100
    const screenY = active.rect?.current?.translated?.top - containerRect.top || 100
    // Convert screen coordinates to canvas coordinates
    const canvasPos = screenToCanvas(screenX, screenY)

    const newDroppedMemory = {
      ...memoryData,
      x: canvasPos.x,
      y: canvasPos.y
    }

    if (!droppedMemories.find(m => compareIds(m.id, memoryData.id))) {
      saveStateForUndo('Drop memory on canvas')
      updateBoardState({
        ...boardState,
        droppedMemories: [...droppedMemories, newDroppedMemory]
      })

      // Update memory's board provenance
      if (activeBoardName) {
        const originalMemory = memories.find(m => compareIds(m.id, memoryData.id))
        const currentBoardIds = originalMemory?.boardIds || []
        const updates = {}

        // Set sourceBoardId if not already set (first board wins)
        if (!originalMemory?.sourceBoardId) {
          updates.sourceBoardId = activeBoardName
        }

        // Add to boardIds if not already present
        if (!currentBoardIds.includes(activeBoardName)) {
          updates.boardIds = [...currentBoardIds, activeBoardName]
        }

        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          updateMemory(memoryData.id, updates).catch(error => {
            console.error('Failed to update memory board provenance:', error)
          })
        }
      }
    }
  }
  // If moving memory within canvas
  else if (memoryData?.isOnCanvas && delta) {
    const memory = droppedMemories.find(m => compareIds(m.id, memoryData.id))
    if (memory) {
      const newX = memory.x + delta.x
      const newY = memory.y + delta.y

      // Set optimistic position immediately for smooth transition
      // Normalize ID for object key
      const normalizedId = ensureStringId(memoryData.id)
      setOptimisticPositions(prev => ({
        ...prev,
        [normalizedId]: { x: newX, y: newY }
      }))

      saveStateForUndo('Move memory')
      updateBoardState({
        ...boardState,
        droppedMemories: droppedMemories.map(m => {
          if (compareIds(m.id, memoryData.id)) {
            return { ...m, x: newX, y: newY }
          }
          return m
        })
      })

      // Track memory movement on imported shared boards
      if (trackMemoryMoved) {
        trackMemoryMoved(memory.title)
      }

      // Clear optimistic position after update completes
      // Using requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOptimisticPositions(prev => {
            const newPositions = { ...prev }
            delete newPositions[normalizedId]
            return newPositions
          })
        })
      })
    }
  }
  // If moving standalone pin
  else if (memoryData?.isStandalonePin && delta) {
    const pin = standalonePins.find(p => compareIds(p.id, memoryData.id))
    if (pin) {
      const newX = pin.x + delta.x
      const newY = pin.y + delta.y

      // Set optimistic position immediately for smooth transition
      // Normalize ID for object key
      const normalizedPinId = ensureStringId(memoryData.id)
      setOptimisticPinPositions(prev => ({
        ...prev,
        [normalizedPinId]: { x: newX, y: newY }
      }))

      saveStateForUndo('Move pin')
      updateBoardState({
        ...boardState,
        standalonePins: standalonePins.map(p => {
          if (compareIds(p.id, memoryData.id)) {
            return { ...p, x: newX, y: newY }
          }
          return p
        })
      })

      // Track pin movement on imported shared boards
      if (trackPinMoved) {
        trackPinMoved(pin.text)
      }

      // Clear optimistic position after update completes
      // Using requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOptimisticPinPositions(prev => {
            const newPositions = { ...prev }
            delete newPositions[normalizedPinId]
            return newPositions
          })
        })
      })
    }
  }
}

  // Helper function to find connected network for constellation selection
  const findConnectedNetwork = useCallback((startId) => {
    const network = new Set([normalizeId(startId)])
    const toProcess = [normalizeId(startId)]

    while (toProcess.length > 0) {
      const current = toProcess.pop()

      connections.forEach(conn => {
        const normalizedFrom = normalizeId(conn.from)
        const normalizedTo = normalizeId(conn.to)

        if (normalizedFrom === current && !network.has(normalizedTo)) {
          network.add(normalizedTo)
          toProcess.push(normalizedTo)
        }
        if (normalizedTo === current && !network.has(normalizedFrom)) {
          network.add(normalizedFrom)
          toProcess.push(normalizedFrom)
        }
      })
    }

    return network
  }, [connections])

  // Pin click handler for connections
  const handlePinClick = useCallback((memoryId) => {
    // In constellation mode (but not during placement), select the connected network instead
    if (isConstellationMode && !isPlacingConstellation) {
      const network = findConnectedNetwork(memoryId)
      setConstellationSelectedNodes(network)
      return
    }

    if (!selectedPin) {
      // Check if this is a standalone pin with connections
      const pin = standalonePins.find(p => compareIds(p.id, memoryId))
      const hasConnections = connections.some(conn =>
        compareIds(conn.from, memoryId) || compareIds(conn.to, memoryId)
      )

      if (pin && hasConnections) {
        // Open edit dialog for standalone pin with connections
        setEditingPin(pin)
        return
      }

      // First pin selected
      setSelectedPin(memoryId)
      // Blur any focused element to remove blue outline
      if (document.activeElement) {
        document.activeElement.blur()
      }
    } else if (compareIds(selectedPin, memoryId)) {
      // Deselect if clicking same pin
      setSelectedPin(null)
      setCursorPosition(null)
    } else {
      // Second pin selected - create connection
      const existingConnection = connections.find(
        conn => (compareIds(conn.from, selectedPin) && compareIds(conn.to, memoryId)) ||
                (compareIds(conn.from, memoryId) && compareIds(conn.to, selectedPin))
      )

      if (!existingConnection) {
        saveStateForUndo('Create connection')
        updateBoardState({
          ...boardState,
          connections: [...connections, {
            from: selectedPin,
            to: memoryId,
            timestamp: Date.now(),
            insight: ''
          }]
        })

        // Track connection on imported shared boards
        if (trackConnectionMade) {
          const fromMemory = droppedMemories.find(m => compareIds(m.id, selectedPin))
          const toMemory = droppedMemories.find(m => compareIds(m.id, memoryId))
          trackConnectionMade(fromMemory?.title, toMemory?.title)
        }
      }
      setSelectedPin(null)
      setCursorPosition(null)
    }
  }, [selectedPin, connections, boardState, updateBoardState, saveStateForUndo, standalonePins, isConstellationMode, findConnectedNetwork, setConstellationSelectedNodes, isPlacingConstellation, trackConnectionMade, droppedMemories])

  // Pin description save handler
  const handleSavePinDescription = useCallback((pinId, description) => {
    const pin = standalonePins.find(p => compareIds(p.id, pinId))
    const updatedPins = standalonePins.map(p =>
      compareIds(p.id, pinId) ? { ...p, description } : p
    )

    updateBoardState({
      ...boardState,
      standalonePins: updatedPins
    })

    // Track pin editing on imported shared boards
    if (trackPinEdited && pin) {
      trackPinEdited(pin.text)
    }
  }, [standalonePins, boardState, updateBoardState, trackPinEdited])

  // Connection handlers
  const handleConnectionClick = (connection) => {
    // Don't open modal if user is currently creating a new connection
    // When selectedPin exists, user is in "connection creation mode" (dashed line showing)
    // Clicking existing connections should be ignored until they complete or cancel
    if (selectedPin) {
      return; // Ignore clicks on connections while placing a new connection
    }

    // In constellation mode, select the connected network instead
    if (isConstellationMode) {
      const network = findConnectedNetwork(connection.from)
      setConstellationSelectedNodes(network)
      return
    }
    setSelectedConnection(connection)
    setShowVennModal(true)
  }

  const handleConnectionContextMenu = (e, connection) => {
    handleContextMenu(e, 'connection', connection)
  }

  const handleConnectionDelete = (connection) => {
    if (isConstellationMode) return // Prevent deletion in constellation mode
    saveStateForUndo('Delete connection')
    updateBoardState({
      ...boardState,
      connections: connections.filter(
        conn => !(compareIds(conn.from, connection.from) && compareIds(conn.to, connection.to))
      )
    })

    // Track connection deletion on imported shared boards
    if (trackConnectionDeleted) {
      const fromMemory = droppedMemories.find(m => compareIds(m.id, connection.from))
      const toMemory = droppedMemories.find(m => compareIds(m.id, connection.to))
      trackConnectionDeleted(fromMemory?.title, toMemory?.title)
    }
  }

  // Board management handlers
  const handleSaveBoard = async () => {
    // TODO: Replace native alert() with custom Dialog component
    if (!boardNameInput.trim()) {
      alert('Please enter a board name')
      return
    }

    try {
      // Include canvasBounds when saving the board
      await saveBoard(boardNameInput.trim(), { ...boardState, canvasBounds })
      setActiveBoardName(boardNameInput.trim())
      setBoardNameInput('')
      setShowSaveBoardModal(false)
      setOpenDropdown(null)
    } catch (error) {
      console.error('Error saving board:', error)
      // TODO: Replace native alert() with custom Dialog component
      alert('Failed to save board. Please try again.')
    }
  }

  const handleLoadBoardClick = (boardId) => {
    // Only save current board if we're loading a different board
    if (boardState && activeBoardName && activeBoardName !== boardId && user?.uid) {
      // Include canvasBounds when auto-saving the current board
      saveBoard(activeBoardName, { ...boardState, canvasBounds }).catch(error => {
        console.error('Failed to save current board before loading:', error)
      })
    }

    const boardData = loadBoard(boardId)
    if (boardData) {
      updateBoardState(boardData)

      // Calculate bounds that fit all existing content
      const memories = boardData.droppedMemories || []
      const pins = boardData.standalonePins || []
      const contentBounds = calculateBoundsForContent(memories, pins, null)

      // Use saved bounds if they exist and are large enough, otherwise use content bounds
      let finalBounds
      if (boardData.canvasBounds) {
        // Merge saved bounds with content bounds (take the larger of each dimension)
        finalBounds = {
          width: Math.max(boardData.canvasBounds.width, contentBounds.width),
          height: Math.max(boardData.canvasBounds.height, contentBounds.height),
          offsetX: Math.max(boardData.canvasBounds.offsetX, contentBounds.offsetX),
          offsetY: Math.max(boardData.canvasBounds.offsetY, contentBounds.offsetY)
        }
      } else {
        finalBounds = contentBounds
      }

      setCanvasBounds(finalBounds)
      saveCanvasBoundsToSession(finalBounds)
      setActiveBoardName(boardId)
      setShowLoadBoardModal(false)
      setOpenDropdown(null)
    }
  }

  const handleDeleteBoard = async (boardId) => {
    const confirmed = await confirm({
      title: 'Delete Board',
      message: 'Delete this saved board?',
      confirmText: 'Delete',
      danger: true
    })

    if (confirmed) {
      try {
        await deleteBoard(boardId)
      } catch (error) {
        console.error('Error deleting board:', error)
        alert('Failed to delete board. Please try again.')
      }
    }
  }

  const handleNewBoard = () => {
    // Auto-save current board before creating a new one
    if (boardState && activeBoardName && user?.uid) {
      saveBoard(activeBoardName, boardState).catch(error => {
        console.error('Failed to save current board before creating new:', error)
      })
    }

    // Create new board with auto-generated name
    const newBoardName = generateBoardName()
    updateBoardState({
      droppedMemories: [],
      connections: [],
      standalonePins: []
    })
    setActiveBoardName(newBoardName)
    setOpenDropdown(null)
  }

  // Board name editing handlers
  const handleStartEditingBoardName = () => {
    // Only allow editing if there's an active named board (not default "Conspiracy")
    if (activeBoardName && !activeBoardName.startsWith('Untitled Board')) {
      setEditingBoardNameValue(activeBoardName)
      setIsEditingBoardName(true)
    }
  }

  const handleSaveBoardName = async () => {
    const newName = editingBoardNameValue.trim()
    if (!newName || newName === activeBoardName) {
      setIsEditingBoardName(false)
      return
    }

    try {
      await renameBoard(activeBoardName, newName)
      setActiveBoardName(newName)
      localStorage.setItem('activeBoardName', newName)
    } catch (error) {
      console.error('Failed to rename board:', error)
    }
    setIsEditingBoardName(false)
  }

  const handleBoardNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveBoardName()
    } else if (e.key === 'Escape') {
      setIsEditingBoardName(false)
    }
  }

  // Constellation management handlers
  const handleLoadConstellation = (constellation) => {
    if (!constellation) return

    // Start placement mode with constellation data
    setPlacingConstellationData(constellation)
    setIsPlacingConstellation(true)
  }

  const handleSaveInsight = (connection, insight) => {
    // Update the connection with the insight and timestamp in Firebase
    const updatedConnections = connections.map(conn => {
      if (compareIds(conn.from, connection.from) && compareIds(conn.to, connection.to)) {
        return {
          ...conn,
          insight: insight,
          timestamp: conn.timestamp || Date.now() // Preserve existing timestamp or create new one
        }
      }
      return conn
    })

    updateBoardState({
      ...boardState,
      connections: updatedConnections
    })

    // Track connection insight editing on imported shared boards
    if (trackConnectionInsightEdited) {
      const fromMemory = droppedMemories.find(m => compareIds(m.id, connection.from))
      const toMemory = droppedMemories.find(m => compareIds(m.id, connection.to))
      trackConnectionInsightEdited(fromMemory?.title, toMemory?.title)
    }
  }

  // Randomly place a single memory on canvas
  const randomlyPlaceMemory = useCallback((memory) => {
    const MEMORY_WIDTH = 200
    const MEMORY_HEIGHT = 120
    const MARGIN = 20
    const EDGE_MARGIN = 50

    // Get visible viewport dimensions (not the entire canvas)
    const container = document.querySelector('.canvas-container')
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const usableWidth = containerRect.width - (2 * EDGE_MARGIN) - MEMORY_WIDTH
    const usableHeight = containerRect.height - (2 * EDGE_MARGIN) - MEMORY_HEIGHT

    // Track placed memories for collision detection
    const placedMemories = droppedMemories.map(m => ({
      x: m.x,
      y: m.y,
      width: MEMORY_WIDTH,
      height: MEMORY_HEIGHT
    }))

    // Function to check collision
    const hasCollision = (newMemory, existing) => {
      return existing.some(ex =>
        newMemory.x < ex.x + ex.width + MARGIN &&
        newMemory.x + newMemory.width + MARGIN > ex.x &&
        newMemory.y < ex.y + ex.height + MARGIN &&
        newMemory.y + newMemory.height + MARGIN > ex.y
      )
    }

    // Try to find a position
    const MAX_ATTEMPTS = 50
    let placed = false

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Generate random position within visible viewport
      const screenX = EDGE_MARGIN + Math.random() * Math.max(0, usableWidth)
      const screenY = EDGE_MARGIN + Math.random() * Math.max(0, usableHeight)

      // Convert viewport coordinates to canvas coordinates
      const canvasPos = screenToCanvas(screenX, screenY)

      const newMemory = {
        x: canvasPos.x,
        y: canvasPos.y,
        width: MEMORY_WIDTH,
        height: MEMORY_HEIGHT
      }

      if (!hasCollision(newMemory, placedMemories)) {
        saveStateForUndo('Randomly place memory')
        updateBoardState({
          ...boardState,
          droppedMemories: [...droppedMemories, {
            ...memory,
            x: canvasPos.x,
            y: canvasPos.y
          }]
        })

        // Update memory's board provenance
        if (activeBoardName) {
          const currentBoardIds = memory?.boardIds || []
          const updates = {}

          // Set sourceBoardId if not already set (first board wins)
          if (!memory?.sourceBoardId) {
            updates.sourceBoardId = activeBoardName
          }

          // Add to boardIds if not already present
          if (!currentBoardIds.includes(activeBoardName)) {
            updates.boardIds = [...currentBoardIds, activeBoardName]
          }

          if (Object.keys(updates).length > 0) {
            updateMemory(memory.id, updates).catch(error => {
              console.error('Failed to update memory board provenance:', error)
            })
          }
        }

        placed = true
        break
      }
    }

    if (!placed) {
      alert('Canvas is too crowded. Try manually placing or clearing some space.')
    }
  }, [droppedMemories, boardState, updateBoardState, saveStateForUndo, screenToCanvas, activeBoardName, updateMemory])

  // Scatter Memories functionality
  const scatterMemories = useCallback(() => {
    // Get memories that are not yet on canvas
    const droppedIds = new Set(droppedMemories.map(m => normalizeId(m.id)))
    const availableMemories = memories.filter(m => !droppedIds.has(normalizeId(m.id)))

    if (availableMemories.length === 0) {
      alert('No memories available to scatter')
      return
    }

    const MEMORY_WIDTH = 200
    const MEMORY_HEIGHT = 120
    const MARGIN = 20
    const EDGE_MARGIN = 50

    // Get canvas dimensions
    const canvas = document.querySelector('.canvas')
    if (!canvas) return

    const canvasRect = canvas.getBoundingClientRect()
    const usableWidth = canvasRect.width - (2 * EDGE_MARGIN) - MEMORY_WIDTH
    const usableHeight = canvasRect.height - (2 * EDGE_MARGIN) - MEMORY_HEIGHT

    // Track placed memories for collision detection
    const placedMemories = [...droppedMemories.map(m => ({
      x: m.x,
      y: m.y,
      width: MEMORY_WIDTH,
      height: MEMORY_HEIGHT
    }))]

    const newDroppedMemories = []

    // Function to check collision
    const hasCollision = (newMemory, existing) => {
      return existing.some(ex =>
        newMemory.x < ex.x + ex.width + MARGIN &&
        newMemory.x + newMemory.width + MARGIN > ex.x &&
        newMemory.y < ex.y + ex.height + MARGIN &&
        newMemory.y + newMemory.height + MARGIN > ex.y
      )
    }

    // Place each available memory
    availableMemories.forEach(memory => {
      const MAX_ATTEMPTS = 50
      let placed = false

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const x = EDGE_MARGIN + Math.random() * Math.max(0, usableWidth)
        const y = EDGE_MARGIN + Math.random() * Math.max(0, usableHeight)

        const newMemory = {
          x,
          y,
          width: MEMORY_WIDTH,
          height: MEMORY_HEIGHT
        }

        if (!hasCollision(newMemory, placedMemories)) {
          newDroppedMemories.push({
            ...memory,
            x,
            y
          })
          placedMemories.push(newMemory)
          placed = true
          break
        }
      }

      if (!placed) {
        // Memory couldn't be placed due to space constraints
      }
    })

    // Update board state
    if (newDroppedMemories.length > 0) {
      saveStateForUndo('Scatter memories')
      updateBoardState({
        ...boardState,
        droppedMemories: [...droppedMemories, ...newDroppedMemories]
      })

      // Update board provenance for all scattered memories
      if (activeBoardName) {
        newDroppedMemories.forEach(memory => {
          const currentBoardIds = memory?.boardIds || []
          const updates = {}

          // Set sourceBoardId if not already set (first board wins)
          if (!memory?.sourceBoardId) {
            updates.sourceBoardId = activeBoardName
          }

          // Add to boardIds if not already present
          if (!currentBoardIds.includes(activeBoardName)) {
            updates.boardIds = [...currentBoardIds, activeBoardName]
          }

          if (Object.keys(updates).length > 0) {
            updateMemory(memory.id, updates).catch(error => {
              console.error('Failed to update memory board provenance:', error)
            })
          }
        })
      }
    }
  }, [memories, droppedMemories, boardState, updateBoardState, saveStateForUndo, activeBoardName, updateMemory])

  // Add Memory Modal handlers
  const handleAddMemory = () => {
    setEditingMemory(null)
    setShowAddMemoryModal(true)
  }

  const handleOpenPlayground = async () => {
    try {
      const newPlayground = await createPlayground({
        name: 'Playground',
        centralHashtag: null,
        description: ''
      })
      setCurrentPlaygroundId(newPlayground.id)
      setPlaygroundOpen(true)
    } catch (error) {
      console.error('Error creating playground:', error)
      alert('Failed to create playground')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleAddMemoryAtPosition = async (position) => {
    if (!position) return

    try {
      // Create memory data (without canvas-specific properties)
      const memoryData = {
        title: '',
        content: '',
        hashtags: [],
        timestamp: new Date().toISOString(),
        dateTime: new Date().toLocaleDateString(),
        // Board provenance: track which board this memory was created on
        sourceBoardId: activeBoardName || null,
        boardIds: activeBoardName ? [activeBoardName] : []
      }

      // Save to Firebase immediately to get proper ID (like normal memories)
      const firebaseId = await addMemory(memoryData)

      // Create the canvas memory with Firebase ID and position
      // Adjust x position for stacked view: Canvas.jsx adds +130px when rendering stacked cards
      // (to keep pin in same place), so we subtract 130px here to compensate
      const newMemory = {
        ...memoryData,
        id: firebaseId,
        x: isSimplified ? position.x - 130 : position.x,
        y: position.y
      }

      // Add to board state
      updateBoardState({
        ...boardState,
        droppedMemories: [...droppedMemories, newMemory]
      })

      // Set as inline editing
      setInlineEditingMemoryId(firebaseId)
    } catch (error) {
      console.error('Failed to create memory:', error)
      alert('Failed to create memory. Please try again.')
    }
  }

  // Inline editing handlers
  const debounceTimeoutRef = useRef(null)

  const handleInlineMemoryUpdate = useCallback((memoryId, newTitle) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // Update local state immediately for responsive UI
    updateBoardState({
      ...boardState,
      droppedMemories: droppedMemories.map(m =>
        compareIds(m.id, memoryId) ? { ...m, title: newTitle } : m
      )
    })

    // Debounce the Firebase update
    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        // Convert newlines to commas for bullet conversion
        const titleWithCommas = newTitle.replace(/\n/g, ', ')
        const processedTitle = processInputTitle(titleWithCommas)

        // Auto-save to Firebase
        await updateMemory(memoryId, {
          title: processedTitle
        })
      } catch (error) {
        console.error('Failed to auto-save memory update:', error)
      }
    }, 1000) // 1 second debounce for Firebase updates
  }, [boardState, droppedMemories, updateBoardState, updateMemory, processInputTitle])

  const handleInlineMemoryBlur = useCallback(async (memoryId, finalTitle) => {
    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    setInlineEditingMemoryId(null)

    // Find the memory
    const memory = droppedMemories.find(m => compareIds(m.id, memoryId))
    if (!memory) return

    // If blank, delete the memory from both Firebase and canvas
    if (!finalTitle.trim()) {
      try {
        await deleteMemory(memoryId)
        updateBoardState({
          ...boardState,
          droppedMemories: droppedMemories.filter(m => !compareIds(m.id, memoryId))
        })
      } catch (error) {
        console.error('Failed to delete empty memory:', error)
      }
      return
    }

    // Convert newlines to commas for bullet conversion
    const titleWithCommas = finalTitle.replace(/\n/g, ', ')
    const processedTitle = processInputTitle(titleWithCommas)

    try {
      // Update existing memory in Firebase (not create new one)
      await updateMemory(memoryId, {
        title: processedTitle,
        content: memory.content || '',
        hashtags: memory.hashtags || [],
        timestamp: memory.timestamp
      })

      // Update local state with processed title
      updateBoardState({
        ...boardState,
        droppedMemories: droppedMemories.map(m =>
          compareIds(m.id, memoryId) ? { ...m, title: processedTitle } : m
        )
      })
    } catch (error) {
      console.error('Failed to update inline memory:', error)
      alert('Failed to update memory. Please try again.')
    }
  }, [boardState, droppedMemories, updateBoardState, updateMemory, deleteMemory, processInputTitle])

  const handleInlineMemoryEscape = useCallback((memoryId) => {
    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    setInlineEditingMemoryId(null)

    // Delete the memory
    updateBoardState({
      ...boardState,
      droppedMemories: droppedMemories.filter(m => !compareIds(m.id, memoryId))
    })
  }, [boardState, droppedMemories, updateBoardState])

  const handleViewMemory = (memory) => {
    setEditingMemory(memory)
    setViewMode(true)
    setShowAddMemoryModal(true)
  }

  const handleDoubleClickMemory = (memoryId) => {
    const memory = droppedMemories.find(m => compareIds(m.id, memoryId))
    if (memory) {
      handleViewMemory(memory)
    }
  }

  const handleEditMemory = async (memory) => {
    if (isConstellationMode) return // Prevent editing in constellation mode
    // All memories now have Firebase IDs from creation, so just open the modal
    setEditingMemory(memory)
    setViewMode(false)
    setShowAddMemoryModal(true)
  }

  const handleSaveMemories = async (newMemories, isEdit) => {
    try {
      if (isEdit && editingMemory) {
        // Update existing memory in Firestore
        // Strip canvas-specific properties (x, y, id, isOnCanvas) before updating
        const { id, x, y, isOnCanvas, ...updates } = newMemories[0]

        // Clean up the updates to only include valid memory fields
        const cleanUpdates = {
          content: String(updates.content || ''),
          title: processInputTitle(String(updates.title || '')),
          hashtags: Array.isArray(updates.hashtags) ? updates.hashtags.map(tag => String(tag)) : [],
          additionalContext: String(updates.additionalContext || ''),
          breadcrumbs: Array.isArray(updates.breadcrumbs) ? updates.breadcrumbs.filter(crumb => crumb.trim()) : []
          // Remove dateTime from updates - let Firebase handle timestamps
        }

        // Ensure ID is a string (Firebase requires string IDs)
        const memoryId = String(id)

        await updateMemory(memoryId, cleanUpdates)

        // Also update the memory in droppedMemories if it's on the canvas
        const droppedMemory = droppedMemories.find(m => String(m.id) === memoryId)
        if (droppedMemory) {
          updateBoardState({
            ...boardState,
            droppedMemories: droppedMemories.map(m =>
              String(m.id) === memoryId ? { ...m, ...cleanUpdates } : m
            )
          })

          // Track memory editing on imported shared boards
          if (trackMemoryEdited) {
            trackMemoryEdited(cleanUpdates.title || droppedMemory.title)
          }
        }

        // Close modal after successful edit
        setEditingMemory(null)
        setShowAddMemoryModal(false)
      } else {
        // Add new memories to Firestore
        for (const memory of newMemories) {
          // Remove any canvas-specific properties before saving
          const { x, y, isOnCanvas, ...memoryData } = memory
          // Process title: convert commas to bullets
          // Ensure breadcrumbs are properly handled
          const processedMemory = {
            ...memoryData,
            title: processInputTitle(memoryData.title || ''),
            breadcrumbs: Array.isArray(memoryData.breadcrumbs) ?
                        memoryData.breadcrumbs.filter(crumb => crumb && crumb.trim()) : [],
            // Board provenance: track which board this memory was created on
            sourceBoardId: activeBoardName || null,
            boardIds: activeBoardName ? [activeBoardName] : []
          }
          await addMemory(processedMemory)
        }

        // Close modal after successful create
        setShowAddMemoryModal(false)
      }
    } catch (error) {
      console.error('Error saving memory:', error)
      alert('Failed to save memory. Please try again.')
      throw error // Re-throw so modal knows it failed
    }
  }

  // Library helper functions
  const getLibraryMemoryCount = (libraryId) => {
    const libraryMemories = getLibraryMemories(libraryId, memories)
    return libraryMemories.length
  }

  const handleMemoryDropToLibrary = async (libraryId, memoryIds) => {
    if (!memoryIds || memoryIds.length === 0) return

    try {
      for (const memoryId of memoryIds) {
        await addMemoryToLibrary(libraryId, String(memoryId))
      }
    } catch (error) {
      console.error('Error adding memories to library:', error)
      alert('Failed to add memories to library')
    }
  }

  // Standalone Pin handlers
  const handleStartPlacingPin = () => {
    setIsPlacingPin(true)
    setPinPlacementPosition(null)
  }

  const handlePlacePinAtPosition = useCallback((canvasPos) => {
    // Create new standalone pin at the specified position
    const newPin = {
      id: generatePinId(),
      x: canvasPos.x - 10, // Center the pin (pin is 20px wide)
      y: canvasPos.y - 10,
      description: ''
    }

    saveStateForUndo('Create standalone pin')
    updateBoardState({
      ...boardState,
      standalonePins: [...standalonePins, newPin]
    })

    // Track pin creation on imported shared boards
    if (trackPinCreated) {
      trackPinCreated('New pin')
    }
  }, [boardState, standalonePins, updateBoardState, saveStateForUndo, trackPinCreated])

  const handleCanvasMouseMove = useCallback((e) => {
    if (isPlacingPin) {
      const containerRect = document.querySelector('.canvas-container').getBoundingClientRect()
      // Get mouse position relative to container, then convert to canvas coordinates
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const canvasPos = screenToCanvas(screenX, screenY)
      setPinPlacementPosition(canvasPos)
    }

    if (isPlacingConstellation) {
      const containerRect = document.querySelector('.canvas-container').getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const canvasPos = screenToCanvas(screenX, screenY)
      setConstellationPlacementPosition(canvasPos)
    }
  }, [isPlacingPin, isPlacingConstellation, screenToCanvas])

  const handleCanvasClick = useCallback((e) => {
    // Handle constellation placement
    if (isPlacingConstellation && constellationPlacementPosition && placingConstellationData) {
      const containerRect = document.querySelector('.canvas-container').getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const clickPos = screenToCanvas(screenX, screenY)

      // Calculate constellation bounding box
      const allItems = [
        ...(placingConstellationData.memories || []),
        ...(placingConstellationData.pins || [])
      ]

      if (allItems.length > 0) {
        const minX = Math.min(...allItems.map(item => item.x))
        const maxX = Math.max(...allItems.map(item => item.x + (item.width || 280)))
        const minY = Math.min(...allItems.map(item => item.y))
        const maxY = Math.max(...allItems.map(item => item.y + (item.height || 150)))

        // Calculate center of constellation
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Calculate offset to align center with click position
        const offsetX = clickPos.x - centerX
        const offsetY = clickPos.y - centerY

        // Create ID mapping for items that already exist on the board
        // This ensures connections point to the newly placed items, not existing ones
        const idMapping = new Map()

        // Check which memories already exist and need new IDs
        const offsetMemories = (placingConstellationData.memories || []).map(mem => {
          const existsOnBoard = droppedMemories.some(m => compareIds(m.id, mem.id))
          if (existsOnBoard) {
            const newId = generateLocalId()
            idMapping.set(normalizeId(mem.id), newId)
            return {
              ...mem,
              id: newId,
              x: mem.x + offsetX,
              y: mem.y + offsetY
            }
          }
          return {
            ...mem,
            x: mem.x + offsetX,
            y: mem.y + offsetY
          }
        })

        // Check which pins already exist and need new IDs
        const offsetPins = (placingConstellationData.pins || []).map(pin => {
          const existsOnBoard = standalonePins.some(p => compareIds(p.id, pin.id))
          if (existsOnBoard) {
            const newId = generatePinId()
            idMapping.set(normalizeId(pin.id), newId)
            return {
              ...pin,
              id: newId,
              x: pin.x + offsetX,
              y: pin.y + offsetY
            }
          }
          return {
            ...pin,
            x: pin.x + offsetX,
            y: pin.y + offsetY
          }
        })

        // Update connections to use new IDs where applicable
        const updatedConstellationConnections = (placingConstellationData.connections || []).map(conn => ({
          ...conn,
          from: idMapping.get(normalizeId(conn.from)) || conn.from,
          to: idMapping.get(normalizeId(conn.to)) || conn.to
        }))

        // Add to board
        saveStateForUndo('Place constellation')
        updateBoardState({
          ...boardState,
          droppedMemories: [...droppedMemories, ...offsetMemories],
          connections: [...connections, ...updatedConstellationConnections],
          standalonePins: [...standalonePins, ...offsetPins]
        })

        // Update board provenance for constellation memories
        if (activeBoardName) {
          offsetMemories.forEach(memory => {
            // Find the original memory data from the memories array
            const originalMemory = memories.find(m => compareIds(m.id, memory.id))
            const currentBoardIds = originalMemory?.boardIds || []
            const updates = {}

            // Set sourceBoardId if not already set (first board wins)
            if (!originalMemory?.sourceBoardId) {
              updates.sourceBoardId = activeBoardName
            }

            // Add to boardIds if not already present
            if (!currentBoardIds.includes(activeBoardName)) {
              updates.boardIds = [...currentBoardIds, activeBoardName]
            }

            if (Object.keys(updates).length > 0) {
              updateMemory(memory.id, updates).catch(error => {
                console.error('Failed to update memory board provenance:', error)
              })
            }
          })
        }

      }

      // Exit placement mode
      setIsPlacingConstellation(false)
      setPlacingConstellationData(null)
      setConstellationPlacementPosition(null)
      return
    }

    // Check if click is on canvas background (not a card or pin)
    if (e.target.classList.contains('canvas') || e.target.classList.contains('canvas-container') || e.target.classList.contains('pan-container')) {
      // If inline editing, trigger save by focusing and blurring the textarea
      if (inlineEditingMemoryId) {
        const memory = droppedMemories.find(m => compareIds(m.id, inlineEditingMemoryId))
        if (memory) {
          // Trigger the blur handler with current title
          handleInlineMemoryBlur(inlineEditingMemoryId, memory.title || '')
        }
        return
      }

      // Cancel connection if one is in progress
      if (selectedPin) {
        setSelectedPin(null)
        setCursorPosition(null)
        return
      }

      // Deselect constellation if one is selected (but not if we're panning)
      if (constellationSelectedNodes && !isPanning) {
        setConstellationSelectedNodes(null)
        return
      }
    }

    if (isPlacingPin && pinPlacementPosition) {
      // Place pin at the preview position (with the same offset)
      const placementPos = {
        x: pinPlacementPosition.x,
        y: pinPlacementPosition.y - 15  // Match the preview offset
      }

      handlePlacePinAtPosition(placementPos)
      setIsPlacingPin(false)
      setPinPlacementPosition(null)
    }
  }, [isPlacingPin, pinPlacementPosition, handlePlacePinAtPosition, selectedPin, inlineEditingMemoryId, droppedMemories, handleInlineMemoryBlur, isPlacingConstellation, constellationPlacementPosition, placingConstellationData, connections, boardState, standalonePins, screenToCanvas, saveStateForUndo])

  const handleUpdatePinPosition = useCallback((pinId, position) => {
    updateBoardState({
      ...boardState,
      standalonePins: standalonePins.map(pin =>
        compareIds(pin.id, pinId) ? { ...pin, ...position } : pin
      )
    })
  }, [boardState, standalonePins, updateBoardState])

  // Pan handlers - support both mouse and touch
  const handlePanStart = useCallback((e) => {
    // Only pan if clicking on canvas background (not on cards or other elements)
    if (e.target.classList.contains('canvas') || e.target.classList.contains('canvas-container')) {
      e.preventDefault()

      // Get coordinates from either mouse or touch event
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      setIsPanning(true)
      // Store starting position and current pan offset separately
      // We'll calculate delta in handlePanMove and scale by zoom
      setPanStart({ x: clientX, y: clientY, startPanX: panOffset.x, startPanY: panOffset.y })

      // For touch, also store the last position for move tracking
      if (e.touches) {
        lastTouchRef.current = { x: clientX, y: clientY }
      }
    }
  }, [panOffset])

  const handlePanMove = useCallback((e) => {
    if (isPanning && panStart) {
      e.preventDefault()

      // Get coordinates from either mouse or touch event
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      // Calculate delta from start position, scaled by zoom level
      // At lower zoom levels, we need more pan offset change for the same visual movement
      const deltaX = (clientX - panStart.x) / zoomLevel
      const deltaY = (clientY - panStart.y) / zoomLevel

      // Pan bounds use dynamic canvas bounds (starts at 2x viewport, expandable)
      const maxPanX = canvasBounds.offsetX
      const maxPanY = canvasBounds.offsetY
      const rawX = panStart.startPanX + deltaX
      const rawY = panStart.startPanY + deltaY

      // Detect if user is trying to pan beyond limits
      const tryingLeft = rawX > maxPanX
      const tryingRight = rawX < -maxPanX
      const tryingUp = rawY > maxPanY
      const tryingDown = rawY < -maxPanY

      setShowExpandArrow({
        left: tryingLeft,
        right: tryingRight,
        up: tryingUp,
        down: tryingDown
      })

      const newOffset = {
        x: Math.max(-maxPanX, Math.min(maxPanX, rawX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, rawY))
      }
      setPanOffset(newOffset)
      savePanOffsetToSession(newOffset)  // Save to session during drag
    }
  }, [isPanning, panStart, savePanOffsetToSession, canvasBounds, zoomLevel])

  const handlePanEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false)
      setPanStart(null)
      // Keep expand arrows visible for 3 seconds after panning ends so user can tap them
      if (expandArrowTimeoutRef.current) {
        clearTimeout(expandArrowTimeoutRef.current)
      }
      expandArrowTimeoutRef.current = setTimeout(() => {
        setShowExpandArrow({ left: false, right: false, up: false, down: false })
      }, 3000)
      // Save pan offset to Firebase - use function to get latest state
      setPanOffset(currentPanOffset => {
        console.log('💾 Saving pan offset (drag):', currentPanOffset)
        // Only update panOffset, don't spread boardState to avoid stale data
        updateBoardState({
          droppedMemories,
          connections,
          standalonePins,
          panOffset: currentPanOffset
        })
        return currentPanOffset
      })
    }
  }, [isPanning, droppedMemories, connections, standalonePins, updateBoardState])

  // Helper to calculate distance between two touch points
  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Long-press delay for context menu
  const LONG_PRESS_DELAY = 500 // ms

  // Touch handlers for mobile panning and pinch-to-zoom
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // Pinch gesture starting - store initial distance and zoom
      e.preventDefault()
      const distance = getTouchDistance(e.touches)
      pinchStartRef.current = { distance, zoom: zoomLevel }
      setIsPanning(false) // Stop any panning when pinching
      // Cancel any long-press in progress
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      longPressTouchRef.current = null
    } else if (e.touches.length === 1) {
      // Single finger - start panning
      handlePanStart(e)

      // Start long-press timer for canvas context menu
      if (e.target.classList.contains('canvas') || e.target.classList.contains('canvas-container')) {
        const touch = e.touches[0]
        longPressTouchRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          type: 'canvas',
          data: null
        }

        longPressTimerRef.current = setTimeout(() => {
          if (longPressTouchRef.current) {
            // Create a synthetic event for context menu
            const syntheticEvent = {
              preventDefault: () => {},
              clientX: longPressTouchRef.current.x,
              clientY: longPressTouchRef.current.y
            }

            // Capture canvas position for inline memory creation
            const container = document.querySelector('.canvas-container')
            if (container) {
              const rect = container.getBoundingClientRect()
              const canvasPos = screenToCanvas(
                longPressTouchRef.current.x - rect.left,
                longPressTouchRef.current.y - rect.top
              )

              // Show context menu with canvas options
              setContextMenu({
                x: longPressTouchRef.current.x,
                y: longPressTouchRef.current.y,
                items: [
                  { label: 'Add Memory', icon: <Plus size={16} />, onClick: () => handleAddMemoryAtPosition(canvasPos) },
                  { label: 'Add Pin', icon: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="5" r="4" fill="#dc143c"/><rect x="7" y="8" width="2" height="6" fill="#666"/></svg>, onClick: () => handlePlacePinAtPosition(canvasPos) }
                ]
              })
            }
            longPressTouchRef.current = null
          }
        }, LONG_PRESS_DELAY)
      }
    }
  }, [zoomLevel, handlePanStart, screenToCanvas, handleAddMemoryAtPosition, handlePlacePinAtPosition])

  const handleTouchMove = useCallback((e) => {
    // Cancel long-press if moving
    if (longPressTouchRef.current && e.touches?.length) {
      const touch = e.touches[0]
      const dx = touch.clientX - longPressTouchRef.current.x
      const dy = touch.clientY - longPressTouchRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        longPressTouchRef.current = null
      }
    }

    if (e.touches.length === 2 && pinchStartRef.current) {
      // Pinch-to-zoom
      e.preventDefault()
      const currentDistance = getTouchDistance(e.touches)
      const scale = currentDistance / pinchStartRef.current.distance

      // Calculate new zoom level based on initial zoom and scale factor
      let newZoom = pinchStartRef.current.zoom * scale

      // Clamp to allowed zoom levels (snap to nearest)
      if (newZoom >= 0.875) newZoom = 1.0
      else if (newZoom >= 0.625) newZoom = 0.75
      else newZoom = 0.5

      if (newZoom !== zoomLevel) {
        setZoomLevel(newZoom)
        sessionStorage.setItem('boardZoomLevel', newZoom.toString())
      }
    } else if (e.touches.length === 1 && isPanning) {
      // Single finger panning
      handlePanMove(e)
    }
  }, [zoomLevel, isPanning, handlePanMove])

  const handleTouchEnd = useCallback((e) => {
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressTouchRef.current = null

    if (e.touches.length === 0) {
      // All fingers lifted
      pinchStartRef.current = null
      lastTouchRef.current = null
      handlePanEnd()
    } else if (e.touches.length === 1 && pinchStartRef.current) {
      // Went from 2 fingers to 1 - could start panning
      pinchStartRef.current = null
    }
  }, [handlePanEnd])

  // Callback ref to attach wheel event listeners and prevent browser navigation
  const attachCanvasListeners = useCallback((node) => {
    // Clean up previous listeners if they exist
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    if (!node) return

    const handleWheel = (e) => {
      // Prevent default to stop browser navigation gestures
      e.preventDefault()
      e.stopPropagation()

      // Sensitivity multiplier for natural feel (1.0 = raw delta values)
      const SCROLL_SENSITIVITY = 1.0

      // Calculate new pan offset based on wheel delta
      // Scale by zoom level so panning feels consistent at all zoom levels
      // Note: We subtract deltaX/Y because scrolling right should move content left (pan right)
      const newOffset = {
        x: panOffset.x - (e.deltaX * SCROLL_SENSITIVITY / zoomLevel),
        y: panOffset.y - (e.deltaY * SCROLL_SENSITIVITY / zoomLevel)
      }

      // Clamp to pan bounds using dynamic canvas bounds
      const maxPanX = canvasBounds.offsetX
      const maxPanY = canvasBounds.offsetY

      // Detect if user is trying to scroll beyond limits
      const tryingLeft = newOffset.x > maxPanX
      const tryingRight = newOffset.x < -maxPanX
      const tryingUp = newOffset.y > maxPanY
      const tryingDown = newOffset.y < -maxPanY

      // Show arrows when hitting edges, keep visible for 3 seconds
      if (tryingLeft || tryingRight || tryingUp || tryingDown) {
        setShowExpandArrow({
          left: tryingLeft,
          right: tryingRight,
          up: tryingUp,
          down: tryingDown
        })
        // Clear previous timeout and set new 3 second timeout
        if (expandArrowTimeoutRef.current) {
          clearTimeout(expandArrowTimeoutRef.current)
        }
        expandArrowTimeoutRef.current = setTimeout(() => {
          setShowExpandArrow({ left: false, right: false, up: false, down: false })
        }, 3000)
      }

      const clampedOffset = {
        x: Math.max(-maxPanX, Math.min(maxPanX, newOffset.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, newOffset.y))
      }

      setPanOffset(clampedOffset)
      savePanOffsetToSession(clampedOffset)  // Save to session immediately on wheel

      // Debounce saving the pan offset to Firebase/localStorage
      if (panSaveTimeoutRef.current) {
        clearTimeout(panSaveTimeoutRef.current)
      }
      panSaveTimeoutRef.current = setTimeout(() => {
        console.log('💾 Saving pan offset (wheel):', clampedOffset)
        // Get current state values from the component instead of stale closure
        updateBoardState({
          droppedMemories,
          connections,
          standalonePins,
          panOffset: clampedOffset
        })
      }, 500) // Save after 500ms of no scrolling
    }

    // Helper to calculate distance between two touch points
    const getTouchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e) => {
      // Prevent multi-touch gestures from triggering browser navigation/zoom
      if (e.touches.length > 1) {
        e.preventDefault()
        // Start pinch tracking - use ref for current zoom level
        pinchStartRef.current = {
          distance: getTouchDist(e.touches),
          zoom: zoomLevelRef.current
        }
      }
    }

    const handleTouchMove = (e) => {
      // Prevent touch gestures from triggering browser navigation
      if (e.touches.length > 1) {
        e.preventDefault()

        // Handle pinch-to-zoom
        if (pinchStartRef.current && e.touches.length === 2) {
          const currentDistance = getTouchDist(e.touches)
          const scale = currentDistance / pinchStartRef.current.distance
          const currentZoom = zoomLevelRef.current

          // Define zoom levels and thresholds with hysteresis
          const zoomLevels = [0.1, 0.25, 0.5, 0.75, 1.0]
          const currentIndex = zoomLevels.indexOf(currentZoom)

          // Require 20% scale change to zoom out, 25% to zoom in
          // This prevents oscillation near thresholds
          let newZoom = currentZoom

          if (scale < 0.8 && currentIndex > 0) {
            // Zooming out - go to next lower level
            newZoom = zoomLevels[currentIndex - 1]
            // Reset pinch start for next level change
            pinchStartRef.current = {
              distance: currentDistance,
              zoom: newZoom
            }
          } else if (scale > 1.25 && currentIndex < zoomLevels.length - 1) {
            // Zooming in - go to next higher level
            newZoom = zoomLevels[currentIndex + 1]
            // Reset pinch start for next level change
            pinchStartRef.current = {
              distance: currentDistance,
              zoom: newZoom
            }
          }

          if (newZoom !== currentZoom) {
            // With dynamic transformOrigin at viewport center, no pan adjustment needed
            setZoomLevel(newZoom)
            sessionStorage.setItem('boardZoomLevel', newZoom.toString())

            // Show zoom indicator
            setShowZoomIndicator(true)
            setTimeout(() => setShowZoomIndicator(false), 1500)
          }
        }
      }
    }

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        pinchStartRef.current = null
      }
    }

    // iOS Safari gesture events (pinch-to-zoom)
    const handleGestureStart = (e) => {
      e.preventDefault()
    }

    const handleGestureChange = (e) => {
      e.preventDefault()
    }

    // Add event listener with passive: false to allow preventDefault
    node.addEventListener('wheel', handleWheel, { passive: false })
    node.addEventListener('touchstart', handleTouchStart, { passive: false })
    node.addEventListener('touchmove', handleTouchMove, { passive: false })
    node.addEventListener('touchend', handleTouchEnd, { passive: false })
    node.addEventListener('gesturestart', handleGestureStart, { passive: false })
    node.addEventListener('gesturechange', handleGestureChange, { passive: false })

    // Store cleanup function
    cleanupRef.current = () => {
      node.removeEventListener('wheel', handleWheel)
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('gesturestart', handleGestureStart)
      node.removeEventListener('gesturechange', handleGestureChange)
    }
  }, [panOffset, setPanOffset, savePanOffsetToSession, droppedMemories, connections, standalonePins, updateBoardState, canvasBounds, zoomLevel])

  // Handle ESC key to cancel pin placement or connection, and Cmd/Ctrl+Z for undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isPlacingConstellation) {
          setIsPlacingConstellation(false)
          setPlacingConstellationData(null)
          setConstellationPlacementPosition(null)
        }
        if (isPlacingPin) {
          setIsPlacingPin(false)
          setPinPlacementPosition(null)
        }
        if (selectedPin) {
          setSelectedPin(null)
          setCursorPosition(null)
        }
      }

      // Handle Cmd/Ctrl + Z for undo and Cmd/Ctrl + Shift + Z for redo
      // Skip if inline editing (let browser handle native undo/redo in textarea)
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !inlineEditingMemoryId) {
        e.preventDefault()
        if (e.shiftKey) {
          performRedo()
        } else {
          performUndo()
        }
      }

      // Handle Cmd/Ctrl + Plus/Minus for zoom
      if ((e.metaKey || e.ctrlKey) && !inlineEditingMemoryId) {
        // Handle zoom in (Cmd/Ctrl + Plus or Cmd/Ctrl + =)
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          let newZoom
          if (zoomLevel <= 0.25) newZoom = 0.5
          else if (zoomLevel <= 0.5) newZoom = 0.75
          else if (zoomLevel <= 0.75) newZoom = 1.0
          else newZoom = 1.0  // Already at max zoom

          if (newZoom !== zoomLevel) {
            zoomToCenter(newZoom)
          }
        }
        // Handle zoom out (Cmd/Ctrl + Minus)
        else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          let newZoom
          if (zoomLevel >= 1.0) newZoom = 0.75
          else if (zoomLevel >= 0.75) newZoom = 0.5
          else if (zoomLevel >= 0.5) newZoom = 0.25
          else newZoom = 0.25  // Desktop min zoom is 25%

          if (newZoom !== zoomLevel) {
            zoomToCenter(newZoom)
          }
        }
        // Handle zoom reset (Cmd/Ctrl + 0)
        else if (e.key === '0') {
          e.preventDefault()
          if (zoomLevel !== 1.0) {
            zoomToCenter(1.0)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlacingPin, selectedPin, performUndo, performRedo, isPlacingConstellation, inlineEditingMemoryId, zoomLevel, zoomToCenter])

  // Track cursor position when a pin is selected
  useEffect(() => {
    if (!selectedPin) return

    const handleMouseMove = (e) => {
      const container = document.querySelector('.canvas-container')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const canvasPos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      setCursorPosition(canvasPos)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [selectedPin, screenToCanvas])

  const handleChangePinHead = useCallback((pinId, pinHead) => {
    if (isConstellationMode) return
    saveStateForUndo('Change pin head')
    updateBoardState({
      ...boardState,
      standalonePins: standalonePins.map(p =>
        compareIds(p.id, pinId) ? { ...p, pinHead } : p
      )
    })
  }, [boardState, standalonePins, updateBoardState, saveStateForUndo, isConstellationMode])

  const handleChangeMemoryPinHead = useCallback((memoryId, pinHead) => {
    if (isConstellationMode) return
    saveStateForUndo('Change memory pin head')
    updateBoardState({
      ...boardState,
      droppedMemories: droppedMemories.map(m =>
        compareIds(m.id, memoryId) ? { ...m, pinHead } : m
      )
    })
  }, [boardState, droppedMemories, updateBoardState, saveStateForUndo, isConstellationMode])

  // Context Menu handlers
  const handleContextMenu = useCallback((e, type, data) => {
    e.preventDefault()
    if (isConstellationMode) return // Disable context menus in constellation mode
    if (selectedPin) return // Disable context menus during pin selection mode

    // Capture canvas position for inline memory creation
    let canvasPos = null
    if (type === 'canvas') {
      const container = document.querySelector('.canvas-container')
      if (container) {
        const rect = container.getBoundingClientRect()
        canvasPos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      }
    }

    const items = []

    if (type === 'memory') {
      items.push(
        { label: 'View Memory', icon: <Eye size={16} />, onClick: () => handleViewMemory(data) },
        { label: 'Edit Memory', icon: <Pencil size={16} />, onClick: () => handleEditMemory(data) },
        { label: 'Return to Sidebar', icon: <Undo2 size={16} />, onClick: () => handleReturnToSidebar(data.id) },
        { label: 'Delete Memory', icon: <Trash2 size={16} />, onClick: () => handleDeleteMemory(data.id) }
      )
    } else if (type === 'canvas') {
      items.push(
        { label: 'Add Memory', icon: <Plus size={16} />, onClick: () => handleAddMemoryAtPosition(canvasPos) },
        { label: 'Add Pin', icon: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="5" r="4" fill="#dc143c"/><rect x="7" y="8" width="2" height="6" fill="#666"/></svg>, onClick: () => handlePlacePinAtPosition(canvasPos) }
      )
    } else if (type === 'pin') {
      items.push(
        { label: 'Remove Pin', icon: <Trash2 size={16} />, onClick: () => handleDeletePin(data.id) },
        { label: 'Add Insight', icon: <Lightbulb size={16} />, onClick: () => setEditingPin(data) },
        {
          label: 'Change Pin Head',
          icon: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="5" r="4" fill="#dc143c"/><rect x="7" y="8" width="2" height="6" fill="#666"/></svg>,
          submenu: [
            { label: '', icon: <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#dc143c"/></svg>, onClick: () => handleChangePinHead(data.id, 'default') },
            { separator: true },
            { label: '', icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 17l-6.3 4 2.3-7.2-6-4.4h7.6z" fill="#FFD700"/></svg>, onClick: () => handleChangePinHead(data.id, 'star') },
            { separator: true },
            { label: '', icon: <svg width="14" height="14" viewBox="0 0 16 12"><path d="M0 0h14l-4 6 4 6H0z" fill="#DC2626"/></svg>, onClick: () => handleChangePinHead(data.id, 'flag') }
          ]
        },
        { label: gridVisibleForPin === data.id ? 'Hide Grid' : 'View as Grid', icon: gridVisibleForPin === data.id ? <EyeOff size={16} /> : <Grid3x3 size={16} />, onClick: () => setGridVisibleForPin(gridVisibleForPin === data.id ? null : data.id) }
      )
    } else if (type === 'connection') {
      items.push(
        { label: 'Remove Connection', icon: <Trash2 size={16} />, onClick: () => handleConnectionDelete(data) },
        { label: 'Specify Commonality', icon: <Lightbulb size={16} />, onClick: () => handleConnectionClick(data) }
      )
    } else if (type === 'memoryPin') {
      items.push(
        {
          label: 'Change Pin Head',
          icon: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="5" r="4" fill="#dc143c"/><rect x="7" y="8" width="2" height="6" fill="#666"/></svg>,
          submenu: [
            { label: '', icon: <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#dc143c"/></svg>, onClick: () => handleChangeMemoryPinHead(data.id, 'default') },
            { separator: true },
            { label: '', icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 17l-6.3 4 2.3-7.2-6-4.4h7.6z" fill="#FFD700"/></svg>, onClick: () => handleChangeMemoryPinHead(data.id, 'star') },
            { separator: true },
            { label: '', icon: <svg width="14" height="14" viewBox="0 0 16 12"><path d="M0 0h14l-4 6 4 6H0z" fill="#DC2626"/></svg>, onClick: () => handleChangeMemoryPinHead(data.id, 'flag') }
          ]
        }
      )
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [screenToCanvas, isConstellationMode, handlePlacePinAtPosition, gridVisibleForPin])  // Add dependencies as needed

  const handleReturnToSidebar = useCallback(async (memoryId) => {
    if (isConstellationMode) return // Prevent returning to sidebar in constellation mode

    // NOTE: isOnCanvas is a runtime flag only - never save it to Firebase
    // Canvas positions are stored in boardState.droppedMemories, not in the memory document

    // Find memory title for tracking before removing
    const removedMemory = droppedMemories.find(m => compareIds(m.id, memoryId))

    saveStateForUndo('Return memory to sidebar')
    updateBoardState({
      ...boardState,
      droppedMemories: droppedMemories.filter(m => !compareIds(m.id, memoryId)),
      connections: connections.filter(c => !compareIds(c.from, memoryId) && !compareIds(c.to, memoryId))
    })

    // Track memory removal on imported shared boards
    if (trackMemoryRemoved && removedMemory) {
      trackMemoryRemoved(removedMemory.title)
    }

    // Remove this board from memory's boardIds (but keep sourceBoardId)
    if (activeBoardName) {
      const originalMemory = memories.find(m => compareIds(m.id, memoryId))
      const currentBoardIds = originalMemory?.boardIds || []
      if (currentBoardIds.includes(activeBoardName)) {
        const newBoardIds = currentBoardIds.filter(id => id !== activeBoardName)
        updateMemory(memoryId, { boardIds: newBoardIds }).catch(error => {
          console.error('Failed to update memory board provenance:', error)
        })
      }
    }
  }, [boardState, droppedMemories, connections, updateBoardState, saveStateForUndo, isConstellationMode, activeBoardName, memories, updateMemory, trackMemoryRemoved])

  const handleDeleteMemory = useCallback(async (memoryId) => {
    if (isConstellationMode) return // Prevent deletion in constellation mode
    saveStateForUndo('Delete memory')
    try {
      // Remove from Firestore
      await deleteMemory(memoryId)

      // Remove from board state
      updateBoardState({
        ...boardState,
        droppedMemories: droppedMemories.filter(m => !compareIds(m.id, memoryId)),
        connections: connections.filter(c => !compareIds(c.from, memoryId) && !compareIds(c.to, memoryId))
      })
    } catch (error) {
      console.error('Error deleting memory:', error)
      alert('Failed to delete memory. Please try again.')
    }
  }, [deleteMemory, boardState, droppedMemories, connections, updateBoardState, saveStateForUndo])

  const handleDeletePin = useCallback((pinId) => {
    if (isConstellationMode) return // Prevent deletion in constellation mode

    // Find pin text for tracking before deleting
    const deletedPin = standalonePins.find(p => compareIds(p.id, pinId))

    saveStateForUndo('Delete pin')
    updateBoardState({
      ...boardState,
      standalonePins: standalonePins.filter(p => !compareIds(p.id, pinId)),
      connections: connections.filter(c => !compareIds(c.from, pinId) && !compareIds(c.to, pinId))
    })

    // Track pin deletion on imported shared boards
    if (trackPinDeleted && deletedPin) {
      trackPinDeleted(deletedPin.text)
    }
  }, [boardState, standalonePins, connections, updateBoardState, saveStateForUndo, isConstellationMode, trackPinDeleted])

  const handleClearBoard = useCallback(() => {
    saveStateForUndo('Clear board')
    updateBoardState({
      droppedMemories: [],
      connections: [],
      standalonePins: []
    })
  }, [updateBoardState, saveStateForUndo])

  const handleMemoryClick = useCallback((e, memory) => {
    // Track memory view on imported shared boards
    if (trackMemoryView && memory) {
      trackMemoryView(memory.id, memory.title)
    }

    // In constellation mode (but not during placement), select the connected network instead
    if (isConstellationMode && !isPlacingConstellation) {
      const network = findConnectedNetwork(memory.id)
      setConstellationSelectedNodes(network)
      return
    }

    // If a pin is selected, complete the connection
    if (selectedPin) {
      e.stopPropagation()
      handlePinClick(memory.id)
      return
    }

    // Disabled: Don't show popup on click
    // Don't show popup if we're dragging or if there's a modifier key
    // if (e.shiftKey || e.ctrlKey || e.metaKey) return

    // setMemoryPopup({
    //   memory,
    //   x: e.clientX,
    //   y: e.clientY
    // })
  }, [selectedPin, handlePinClick, isConstellationMode, findConnectedNetwork, setConstellationSelectedNodes, isPlacingConstellation, trackMemoryView])

  // Reset view to center on canvas origin (0, 0)
  const handleResetView = useCallback(() => {
    const resetOffset = { x: 0, y: 0 }
    setPanOffset(resetOffset)
    savePanOffsetToSession(resetOffset)  // Save to session when resetting
    // Save reset offset to Firebase
    updateBoardState({
      ...boardState,
      panOffset: resetOffset
    })
  }, [boardState, updateBoardState, savePanOffsetToSession])

  // Pan to show a constellation network
  const handlePanToNetwork = useCallback((network) => {
    const items = [...network.memories, ...network.pins]
    if (items.length === 0) return

    // Calculate bounding box
    const minX = Math.min(...items.map(item => item.x))
    const maxX = Math.max(...items.map(item => item.x + (item.width || 280)))
    const minY = Math.min(...items.map(item => item.y))
    const maxY = Math.max(...items.map(item => item.y + (item.height || 150)))

    const padding = 100 // Extra space around constellation

    // Calculate what's currently visible (accounting for zoom)
    const viewportLeft = (CANVAS_OFFSET_X - panOffset.x) / zoomLevel
    const viewportTop = (CANVAS_OFFSET_Y - panOffset.y) / zoomLevel
    const viewportRight = (window.innerWidth + CANVAS_OFFSET_X - panOffset.x) / zoomLevel
    const viewportBottom = (window.innerHeight + CANVAS_OFFSET_Y - panOffset.y) / zoomLevel

    // Check how much of the constellation is visible
    const visibleLeft = Math.max(minX - padding, viewportLeft)
    const visibleRight = Math.min(maxX + padding, viewportRight)
    const visibleTop = Math.max(minY - padding, viewportTop)
    const visibleBottom = Math.min(maxY + padding, viewportBottom)

    const constellationWidth = (maxX + padding) - (minX - padding)
    const constellationHeight = (maxY + padding) - (minY - padding)
    const visibleWidth = Math.max(0, visibleRight - visibleLeft)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)

    const visibleArea = visibleWidth * visibleHeight
    const totalArea = constellationWidth * constellationHeight
    const visibilityRatio = totalArea > 0 ? visibleArea / totalArea : 0

    // Only pan if less than 80% is visible
    if (visibilityRatio >= 0.8) return

    // Calculate center of constellation
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    // Calculate new pan offset to center the constellation (accounting for zoom)
    // canvasToScreen: screenX = canvasX * zoomLevel + panOffset.x - CANVAS_OFFSET_X
    // We want: viewportWidth/2 = centerX * zoomLevel + newPanX - CANVAS_OFFSET_X
    // So: newPanX = viewportWidth/2 - centerX * zoomLevel + CANVAS_OFFSET_X
    const newOffset = {
      x: window.innerWidth / 2 - centerX * zoomLevel + CANVAS_OFFSET_X,
      y: window.innerHeight / 2 - centerY * zoomLevel + CANVAS_OFFSET_Y
    }

    // Clamp to bounds using dynamic canvas bounds
    const maxPanX = canvasBounds.offsetX
    const maxPanY = canvasBounds.offsetY
    const clampedOffset = {
      x: Math.max(-maxPanX, Math.min(maxPanX, newOffset.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newOffset.y))
    }

    // Enable smooth transition for this programmatic pan
    setSmoothPan(true)
    setPanOffset(clampedOffset)
    savePanOffsetToSession(clampedOffset)  // Save to session when panning to network

    // Disable smooth transition after animation completes
    setTimeout(() => {
      setSmoothPan(false)
    }, 500)

    // Save to Firebase
    updateBoardState({
      ...boardState,
      panOffset: clampedOffset
    })
  }, [panOffset, zoomLevel, boardState, updateBoardState, savePanOffsetToSession, canvasBounds])

  // Show loading state while auth, board state, or memories are loading
  if (authLoading || boardStateLoading || memoriesLoading) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div>Loading board...</div>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="App">
        <div className="main-content-area">
          <Header
          centerContent={
            isEditingBoardName ? (
              <input
                type="text"
                className="board-name-input"
                value={editingBoardNameValue}
                onChange={(e) => setEditingBoardNameValue(e.target.value)}
                onBlur={handleSaveBoardName}
                onKeyDown={handleBoardNameKeyDown}
                autoFocus
              />
            ) : (
              <h2
                className={`board-name-display ${activeBoardName && !activeBoardName.startsWith('Untitled Board') ? 'editable' : ''}`}
                onClick={handleStartEditingBoardName}
              >
                {(!activeBoardName || activeBoardName.startsWith('Untitled Board')) ? 'Conspiracy' : activeBoardName}
              </h2>
            )
          }
          leftContent={
            <>
              {/* Pages Dropdown Menu */}
              <Dropdown
                className="header-dropdown"
                align="left"
                triggerOnHover={false}
                enableHoverSwitching={!!openDropdown}
                disabled={!!selectedPin}
                isOpen={openDropdown === 'pages'}
                onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'pages' : null)}
                trigger={
                  <button className="header-dropdown-btn">
                    <span>Pages</span>
                  </button>
                }
                items={[
                  {
                    label: 'Library',
                    icon: <LibraryIcon size={16} color="#666666" />,
                    onClick: () => window.location.href = '/archive'
                  },
                  {
                    label: 'Conspiracy',
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="4" r="3" fill="#dc143c"/>
                        <rect x="7.5" y="6.5" width="1" height="7" fill="#999"/>
                      </svg>
                    ),
                    onClick: () => window.location.href = '/conspiracy-board'
                  },
                  {
                    label: 'Chronology',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 393.04 545.92">
                        <path d="M381.55,501.79c7.47,2.16,11.39,7.23,11.46,15.95,.04,4.33,.05,8.67-.02,13-.17,9.41-5.97,15.18-15.33,15.18-120.81,0-241.63,0-362.44-.02-8.24,0-13.79-3.91-14.69-11.81-.77-6.69-.16-13.58,.34-20.34,.37-5.03,3.53-9.06,8.05-10.56,5.12-1.7,5.51-5.17,6.03-9.39,1.51-12.33,2.81-24.72,5.01-36.94,6.51-36.15,21.44-68.77,42.38-98.79,17.42-24.97,38.84-46.43,59.57-68.51,3.17-3.38,6.26-6.95,8.75-10.85,4.98-7.8,4.94-13.47-1.1-20.56-8.19-9.62-16.9-18.83-25.72-27.88-26.7-27.41-50.68-56.76-66.96-91.77-12.14-26.11-19.09-53.58-21.92-82.16-.26-2.64-.38-5.34-1.05-7.89-.34-1.3-1.55-2.88-2.75-3.36C3.87,42.18,.31,37.51,.07,29.61c-.13-4.33-.03-8.66,0-13C.15,5.76,5.93,0,16.73,0c40.66,0,81.32,0,121.98,0,79.15,0,158.31,0,237.46,0,9.22,0,14.89,3.14,15.97,10.95,1.08,7.76,.96,15.96-.36,23.67-.63,3.65-4.77,7.46-8.28,9.61-3.05,1.87-4.21,3.7-4.46,6.88-2.27,29.13-8.68,57.29-20.48,84.06-9.63,21.85-22.01,42.18-37.71,60.15-17.85,20.43-36.58,40.08-54.92,60.08-8.49,9.26-8.95,18.12-.53,27.42,11.18,12.33,22.79,24.27,34.33,36.27,34.22,35.58,60.1,76.07,71.54,124.58,4.43,18.81,6.81,38.11,10.29,58.11Zm-38.41-1.04c-2.28-14.48-4.01-28.44-6.74-42.2-8.62-43.47-30.72-79.78-60.25-112.11-12.46-13.64-24.69-27.49-36.59-41.62-8.6-10.2-14.39-21.85-14.55-35.66-.17-14.29,6.15-26.12,14.95-36.52,14.61-17.28,29.93-33.96,44.81-51.01,24.39-27.92,42.78-59.11,50.73-95.7,2.79-12.87,4.64-25.94,6.99-39.34H52.3c-.63,9.25,4.95,39.19,9.43,53.54,10.37,33.23,29.81,60.91,52.52,86.6,13.56,15.34,27.62,30.24,40.83,45.86,18.42,21.79,18.74,47.12,.69,69.01-14.92,18.09-30.81,35.39-46.11,53.17-13.91,16.18-26.26,33.44-35.69,52.69-10.37,21.17-16.27,43.68-19.83,66.84-1.33,8.63-1.85,17.38-2.77,26.44H343.14Z"/>
                        <path d="M299.39,133.89c-3.73,5.26-6.59,10.12-10.23,14.29-17.74,20.31-35.54,40.56-53.6,60.58-16.8,18.61-28.91,39.61-34.31,64.24-.42,1.92-.34,3.97-.3,5.96,.28,13.14,.73,26.28,.9,39.42,.15,11.94,6.78,20.26,14.48,28.47,18.11,19.3,36.21,38.65,53.52,58.66,16.82,19.44,30.6,40.94,38.99,65.52,.8,2.35,1.66,4.71,2.11,7.13,.42,2.27,.32,4.64,.47,7.35H82.35c.74-4.43,.9-8.78,2.22-12.76,7.78-23.55,20.91-44.11,36.98-62.69,19.07-22.03,38.71-43.58,58.38-65.08,5.64-6.17,9.16-13.3,10.61-21.11,2.03-10.93,3.18-22.07,3.96-33.18,1.15-16.53-4.49-31.7-10.94-46.5-6.39-14.66-16.42-26.86-27.17-38.52-19.51-21.17-39.63-41.82-56.45-65.32-1.34-1.87-2.49-3.87-4.14-6.46h203.59Z"/>
                      </svg>
                    ),
                    onClick: () => window.location.href = '/chronology'
                  }
                ]}
              />

              {/* Tools Dropdown Menu */}
              <Dropdown
                className="header-dropdown"
                align="left"
                triggerOnHover={false}
                enableHoverSwitching={!!openDropdown}
                disabled={!!selectedPin}
                isOpen={openDropdown === 'tools'}
                onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'tools' : null)}
                trigger={
                  <button className="header-dropdown-btn">
                    <span>Tools</span>
                  </button>
                }
                items={[
                  {
                    label: 'Add Memory',
                    icon: <AddMemoryIcon color="#666666" />,
                    onClick: handleAddMemory,
                    disabled: isConstellationMode,
                    shortcut: '⇧+N'
                  },
                  {
                    label: 'Place Pin',
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="4" r="3" fill="#dc143c"/>
                        <rect x="7.5" y="6.5" width="1" height="7" fill="#999"/>
                      </svg>
                    ),
                    onClick: handleStartPlacingPin,
                    disabled: isConstellationMode
                  },
                  {
                    label: 'scatter',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <circle cx="4" cy="3" r="1.3"/>
                        <circle cx="11.5" cy="2" r="1.3"/>
                        <circle cx="2.5" cy="7" r="1.3"/>
                        <circle cx="8" cy="8.5" r="1.3"/>
                        <circle cx="13.5" cy="10" r="1.3"/>
                        <circle cx="6" cy="13" r="1.3"/>
                        <circle cx="10.5" cy="14.5" r="1.3"/>
                      </svg>
                    ),
                    onClick: scatterMemories,
                    disabled: isConstellationMode
                  },
                  { separator: true },
                  {
                    label: 'Playground',
                    icon: <PlaygroundIcon color="#666666" />,
                    onClick: handleOpenPlayground
                  },
                  {
                    label: 'Undo',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
                      </svg>
                    ),
                    onClick: performUndo,
                    disabled: undoHistory.length === 0 || isConstellationMode,
                    shortcut: '⌘+Z'
                  },
                  {
                    label: 'Redo',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966a.25.25 0 0 1 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                      </svg>
                    ),
                    onClick: performRedo,
                    disabled: redoHistory.length === 0 || isConstellationMode,
                    shortcut: '⌘+⇧+Z'
                  }
                ]}
              />

              {/* View Dropdown Menu */}
              <Dropdown
                className="header-dropdown"
                align="left"
                triggerOnHover={false}
                enableHoverSwitching={!!openDropdown}
                disabled={!!selectedPin}
                isOpen={openDropdown === 'view'}
                onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'view' : null)}
                trigger={
                  <button className="header-dropdown-btn">
                    <span>View</span>
                  </button>
                }
                items={[
                  {
                    label: 'Reset View',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M8 3a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 3zm8 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zm-.5-4a.5.5 0 0 0 0-1h-2a.5.5 0 0 0 0 1h2zM3 11a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zm-.5-4a.5.5 0 0 0 0-1h-2a.5.5 0 0 0 0 1h2zM8 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13z"/>
                        <circle cx="8" cy="8" r="2"/>
                      </svg>
                    ),
                    onClick: handleResetView,
                    title: 'Reset view to center'
                  },
                  { separator: true },
                  {
                    label: isSimplified ? 'Narrative View' : 'Intuitive View',
                    icon: isSimplified ? (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path d="M1 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2zM1 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7zM1 12a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2z"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13zM1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5V5H1V3.5zM1 6h14v6.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V6z"/>
                        <path d="M2 8.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z"/>
                      </svg>
                    ),
                    onClick: toggleSimplify,
                    active: isSimplified
                  },
                  {
                    label: showAllInsights ? 'hide insights' : 'show insights',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                        <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                      </svg>
                    ),
                    onClick: () => setShowAllInsights(!showAllInsights),
                    active: showAllInsights
                  },
                  { separator: true },
                  {
                    label: stringsInFront ? 'Strings Behind Cards' : 'Strings In Front of Cards',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path d="M15 2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2zM0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm8.5 9.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11.5z"/>
                      </svg>
                    ),
                    onClick: () => setStringsInFront(!stringsInFront),
                    active: stringsInFront,
                    title: stringsInFront ? 'Move strings behind cards' : 'Move strings in front of cards'
                  }
                ]}
              />

              {/* Board Dropdown Menu */}
              <Dropdown
                className="header-dropdown board-dropdown"
                align="left"
                triggerOnHover={false}
                enableHoverSwitching={!!openDropdown}
                closeOnItemClick={false}
                disabled={!!selectedPin}
                isOpen={openDropdown === 'board'}
                onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'board' : null)}
                trigger={
                  <button className="header-dropdown-btn">
                    <span>Board</span>
                  </button>
                }
                items={[
                  {
                    label: 'New Board',
                    icon: <SquarePlus size={16} style={{ fill: 'none' }} />,
                    onClick: handleNewBoard
                  },
                  {
                    label: 'Save As New Board',
                    icon: <Copy size={16} style={{ fill: 'none' }} />,
                    onClick: () => setShowSaveBoardModal(true)
                  },
                  {
                    label: 'Load Board',
                    icon: <BookOpen size={16} style={{ fill: 'none' }} />,
                    onClick: () => setShowLoadBoardModal(true)
                  },
                  { separator: true },
                  {
                    label: 'Share Board',
                    icon: <Share2 size={16} style={{ fill: 'none' }} />,
                    onClick: () => setShowShareModal(true)
                  }
                ]}
              />

              {/* User Account Dropdown */}
              <Dropdown
                className="header-dropdown"
                align="left"
                triggerOnHover={false}
                enableHoverSwitching={!!openDropdown}
                disabled={!!selectedPin}
                isOpen={openDropdown === 'account'}
                onOpenChange={(isOpen) => setOpenDropdown(isOpen ? 'account' : null)}
                trigger={
                  <button className="add-memory-btn-icon" title="Account">
                    <svg width="16" height="16" fill="#2F4F4F" viewBox="0 0 16 16">
                      <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                      <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
                    </svg>
                  </button>
                }
                items={[
                  {
                    label: profile?.firstName || (user ? 'User' : 'Demo Mode'),
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                        <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
                      </svg>
                    ),
                    disabled: true
                  },
                  { separator: true },
                  {
                    label: 'Settings',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 0 0-5.86 2.929 2.929 0 0 0 0 5.858z"/>
                      </svg>
                    ),
                    onClick: () => setShowSettingsModal(true)
                  },
                  {
                    label: 'Tutorial',
                    icon: (
                      <svg width="16" height="16" fill="none" stroke="#666666" strokeWidth="1.5" viewBox="0 0 16 16">
                        <path d="M1 15V10H6V5H11V1H15V15H1Z" strokeLinejoin="miter"/>
                      </svg>
                    ),
                    onClick: () => alert('Tutorial coming soon!')
                  },
                  { separator: true },
                  user ? {
                    label: 'Sign Out',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
                        <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
                      </svg>
                    ),
                    onClick: handleSignOut
                  } : {
                    label: 'Sign In / Sign Up',
                    icon: (
                      <svg width="16" height="16" fill="#666666" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M6 3.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 0-1 0v2A1.5 1.5 0 0 0 6.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-8A1.5 1.5 0 0 0 5 3.5v2a.5.5 0 0 0 1 0v-2z"/>
                        <path fillRule="evenodd" d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3z"/>
                      </svg>
                    ),
                    onClick: () => window.location.href = '/login'
                  }
                ]}
              />

              {/* Add Memory Icon Button */}
              <button
                className="add-memory-btn-icon"
                onClick={handleAddMemory}
                disabled={isConstellationMode}
                title="Add Memory (Shift+N)"
              >
                <AddMemoryIcon size={20} />
              </button>
            </>
          }
        />

        <div className="app-layout">
          <div
            ref={(node) => {
              setContainerRef(node)
              if (node) {
                attachCanvasListeners(node)
              }
            }}
            className={`canvas-container ${selectedPin ? 'pin-selection-mode' : ''}`}
            onMouseDown={handlePanStart}
            onMouseMove={(e) => {
              handleCanvasMouseMove(e)
              handlePanMove(e)
            }}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleCanvasClick}
            onContextMenu={(e) => handleContextMenu(e, 'canvas')}
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
          >
            {/* Zoom indicator for mobile */}
            {showZoomIndicator && (
              <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '16px 24px',
                borderRadius: '8px',
                fontSize: '24px',
                fontWeight: 'bold',
                zIndex: 9999,
                pointerEvents: 'none'
              }}>
                {Math.round(zoomLevel * 100)}%
              </div>
            )}
            <ToolRail
              toolGroups={[
                [
                  {
                    icon: <Plus size={20} />,
                    label: 'Add Memory',
                    onClick: () => setShowAddMemoryModal(true),
                    disabled: isConstellationMode
                  }
                ],
                [
                  {
                    icon: <Pin size={20} />,
                    label: 'Place Pin',
                    onClick: handleStartPlacingPin,
                    isActive: isPlacingPin,
                    disabled: isConstellationMode
                  },
                  {
                    icon: isSimplified ? <BookOpen size={20} /> : <Grid3x3 size={20} />,
                    label: isSimplified ? 'Narrative' : 'Intuitive',
                    onClick: toggleSimplify,
                    isActive: isSimplified
                  },
                  {
                    icon: <Map size={20} />,
                    label: 'Minimap',
                    onClick: () => setShowMinimap(!showMinimap),
                    isActive: showMinimap
                  }
                ]
              ]}
            />
            <div
              className={`pan-container ${isPanning ? 'dragging' : ''} ${smoothPan ? 'smooth-pan' : ''}`}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                // Transform origin at viewport center (in element coords) so zoom feels natural
                transformOrigin: `${CANVAS_OFFSET_X + (window.innerWidth / 2) - panOffset.x}px ${CANVAS_OFFSET_Y + (window.innerHeight / 2) - panOffset.y}px`,
                width: `${CANVAS_WIDTH}px`,
                height: `${CANVAS_HEIGHT}px`,
                position: 'absolute',
                left: `-${CANVAS_OFFSET_X}px`,
                top: `-${CANVAS_OFFSET_Y}px`
              }}
            >
            <Canvas
              droppedMemories={displayMemories}
              selectedPin={selectedPin}
              onPinClick={handlePinClick}
              isStackedView={isSimplified}
              onContextMenu={handleContextMenu}
              onDoubleClick={isConstellationMode ? () => {} : handleDoubleClickMemory}
              onClick={handleMemoryClick}
              connections={connections}
              showOpacityFading={showOpacityFading}
              constellationSelectedNodes={constellationSelectedNodes}
              formatTitleForDisplay={formatTitleForDisplay}
              inlineEditingMemoryId={inlineEditingMemoryId}
              onInlineMemoryUpdate={handleInlineMemoryUpdate}
              onInlineMemoryBlur={handleInlineMemoryBlur}
              onInlineMemoryEscape={handleInlineMemoryEscape}
            />
            {/* Grid overlay for standalone pin */}
            {gridVisibleForPin && (() => {
              const pin = displayStandalonePins.find(p => p.id === gridVisibleForPin)
              return pin ? <PinGrid pin={pin} panOffset={panOffset} zoomLevel={zoomLevel} /> : null
            })()}
            <StandalonePins
              standalonePins={displayStandalonePins}
              selectedPin={selectedPin}
              onPinClick={handlePinClick}
              onUpdatePosition={handleUpdatePinPosition}
              onContextMenu={handleContextMenu}
              isPlacingPin={isPlacingPin}
              placementPosition={pinPlacementPosition}
              showAllInsights={showAllInsights}
              constellationSelectedNodes={constellationSelectedNodes}
              panOffset={panOffset}
            />
            <Connections
              connections={connections}
              droppedMemories={displayMemories}
              standalonePins={displayStandalonePins}
              activeTransform={activeTransform}
              onConnectionClick={handleConnectionClick}
              onConnectionDelete={handleConnectionDelete}
              onConnectionContextMenu={handleConnectionContextMenu}
              showOpacityFading={showOpacityFading}
              isStackedView={isSimplified}
              showAllInsights={showAllInsights}
              selectedPin={selectedPin}
              cursorPosition={cursorPosition}
              constellationSelectedNodes={constellationSelectedNodes}
              stringsInFront={stringsInFront}
              isDragging={!!activeId}
            />

            {/* Ghost constellation preview during placement */}
            {isPlacingConstellation && constellationPlacementPosition && placingConstellationData && (
              <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
                {/* Render ghost connections */}
                {(placingConstellationData.connections || []).map((conn, idx) => {
                  const fromItem = [...(placingConstellationData.memories || []), ...(placingConstellationData.pins || [])]
                    .find(item => compareIds(item.id, conn.from))
                  const toItem = [...(placingConstellationData.memories || []), ...(placingConstellationData.pins || [])]
                    .find(item => compareIds(item.id, conn.to))

                  if (!fromItem || !toItem) return null

                  // Calculate bounding box and offset
                  const allItems = [...(placingConstellationData.memories || []), ...(placingConstellationData.pins || [])]
                  const minX = Math.min(...allItems.map(item => item.x))
                  const maxX = Math.max(...allItems.map(item => item.x + (item.width || 280)))
                  const minY = Math.min(...allItems.map(item => item.y))
                  const maxY = Math.max(...allItems.map(item => item.y + (item.height || 150)))
                  const centerX = (minX + maxX) / 2
                  const centerY = (minY + maxY) / 2
                  const offsetX = constellationPlacementPosition.x - centerX
                  const offsetY = constellationPlacementPosition.y - centerY

                  // Get connection points for memories and pins
                  const fromIsMemory = (placingConstellationData.memories || []).some(m => compareIds(m.id, fromItem.id))
                  const toIsMemory = (placingConstellationData.memories || []).some(m => compareIds(m.id, toItem.id))

                  const fromX = fromIsMemory ? fromItem.x + offsetX + 272 : fromItem.x + offsetX + 10
                  const fromY = fromIsMemory ? fromItem.y + offsetY + 7 : fromItem.y + offsetY + 24
                  const toX = toIsMemory ? toItem.x + offsetX + 272 : toItem.x + offsetX + 10
                  const toY = toIsMemory ? toItem.y + offsetY + 7 : toItem.y + offsetY + 24

                  return (
                    <svg
                      key={`ghost-conn-${idx}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 100
                      }}
                    >
                      <line
                        x1={fromX}
                        y1={fromY}
                        x2={toX}
                        y2={toY}
                        stroke="#FFD700"
                        strokeWidth="2"
                      />
                    </svg>
                  )
                })}

                {/* Render ghost stars for memories */}
                {(placingConstellationData.memories || []).map((memory) => {
                  const allItems = [...(placingConstellationData.memories || []), ...(placingConstellationData.pins || [])]
                  const minX = Math.min(...allItems.map(item => item.x))
                  const maxX = Math.max(...allItems.map(item => item.x + (item.width || 280)))
                  const minY = Math.min(...allItems.map(item => item.y))
                  const maxY = Math.max(...allItems.map(item => item.y + (item.height || 150)))
                  const centerX = (minX + maxX) / 2
                  const centerY = (minY + maxY) / 2
                  const offsetX = constellationPlacementPosition.x - centerX
                  const offsetY = constellationPlacementPosition.y - centerY

                  // Memory pin is at x+272, y+7
                  const starX = memory.x + offsetX + 272
                  const starY = memory.y + offsetY + 7

                  return (
                    <div
                      key={`ghost-star-${memory.id}`}
                      style={{
                        position: 'absolute',
                        left: starX - 30,
                        top: starY - 30,
                        width: '60px',
                        height: '60px',
                        pointerEvents: 'none'
                      }}
                    >
                      <svg width="60" height="60" viewBox="0 0 51 48">
                        <path
                          d="M25.5 0l6.545 19.459L51 19.754l-15.727 11.691L41.09 48 25.5 36.309 9.91 48l5.818-16.555L0 19.754l18.955-.295z"
                          fill="#FFD700"
                        />
                      </svg>
                    </div>
                  )
                })}

                {/* Render ghost stars for pins */}
                {(placingConstellationData.pins || []).map((pin) => {
                  const allItems = [...(placingConstellationData.memories || []), ...(placingConstellationData.pins || [])]
                  const minX = Math.min(...allItems.map(item => item.x))
                  const maxX = Math.max(...allItems.map(item => item.x + (item.width || 280)))
                  const minY = Math.min(...allItems.map(item => item.y))
                  const maxY = Math.max(...allItems.map(item => item.y + (item.height || 150)))
                  const centerX = (minX + maxX) / 2
                  const centerY = (minY + maxY) / 2
                  const offsetX = constellationPlacementPosition.x - centerX
                  const offsetY = constellationPlacementPosition.y - centerY

                  // Pin connection is at x+10, y+24
                  const starX = pin.x + offsetX + 10
                  const starY = pin.y + offsetY + 24

                  return (
                    <div
                      key={`ghost-star-${pin.id}`}
                      style={{
                        position: 'absolute',
                        left: starX - 30,
                        top: starY - 30,
                        width: '60px',
                        height: '60px',
                        pointerEvents: 'none'
                      }}
                    >
                      <svg width="60" height="60" viewBox="0 0 51 48">
                        <path
                          d="M25.5 0l6.545 19.459L51 19.754l-15.727 11.691L41.09 48 25.5 36.309 9.91 48l5.818-16.555L0 19.754l18.955-.295z"
                          fill="#FFD700"
                        />
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
            </div>

            {/* Zoom level indicator - hide when minimap is visible */}
            {zoomLevel !== 1.0 && !showMinimap && (
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                zIndex: 1000,
                userSelect: 'none'
              }}>
                {Math.round(zoomLevel * 100)}%
              </div>
            )}

            {/* Minimap */}
            {showMinimap && (
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                width: '240px',
                padding: '12px',
                background: 'var(--beige-primary)',
                border: '1px solid var(--beige-border)',
                borderRadius: 'var(--radius-medium)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                userSelect: 'none'
              }}>
                {/* Header with title and zoom level */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#666'
                }}>
                  <span>Minimap</span>
                  <span>{Math.round(zoomLevel * 100)}%</span>
                </div>

                {/* Canvas representation */}
                <div
                  style={{
                    width: '100%',
                    height: '160px',
                    background: 'white',
                    border: '1px solid #ccc',
                    borderRadius: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isDraggingMinimap ? 'grabbing' : 'pointer'
                  }}
                  onClick={(e) => {
                    // Don't pan on click if we just finished dragging
                    if (isDraggingMinimap || minimapDragJustEnded.current) return

                    // Calculate where user clicked on minimap and pan there
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickX = e.clientX - rect.left
                    const clickY = e.clientY - rect.top

                    // Convert minimap coordinates to canvas pan offset (using dynamic bounds)
                    const scaleX = canvasBounds.width / rect.width
                    const scaleY = canvasBounds.height / rect.height

                    // Calculate the target pan position (centering on clicked point)
                    const targetCanvasX = clickX * scaleX - canvasBounds.offsetX
                    const targetCanvasY = clickY * scaleY - canvasBounds.offsetY

                    // Calculate pan offset to center this point
                    const viewportWidth = window.innerWidth - (isSidebarOpen ? 400 : 0)
                    const viewportHeight = window.innerHeight

                    const newPanX = -(targetCanvasX - viewportWidth / 2)
                    const newPanY = -(targetCanvasY - viewportHeight / 2)

                    // Clamp to bounds using dynamic canvas bounds
                    const maxPanX = canvasBounds.offsetX
                    const maxPanY = canvasBounds.offsetY
                    const clampedOffset = {
                      x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
                      y: Math.max(-maxPanY, Math.min(maxPanY, newPanY))
                    }

                    setPanOffset(clampedOffset)
                    savePanOffsetToSession(clampedOffset)
                  }}
                  onMouseMove={(e) => {
                    if (!isDraggingMinimap || !minimapDragStart) return

                    const rect = e.currentTarget.getBoundingClientRect()
                    const mouseX = e.clientX - rect.left
                    const mouseY = e.clientY - rect.top

                    // Calculate how much the mouse moved
                    const deltaX = mouseX - minimapDragStart.mouseX
                    const deltaY = mouseY - minimapDragStart.mouseY

                    // Convert minimap delta to canvas delta (using dynamic bounds)
                    const scaleX = canvasBounds.width / rect.width
                    const scaleY = canvasBounds.height / rect.height

                    const canvasDeltaX = deltaX * scaleX
                    const canvasDeltaY = deltaY * scaleY

                    // Update pan offset (negative because moving viewport right means panning left)
                    const newPanX = minimapDragStart.panOffset.x - canvasDeltaX
                    const newPanY = minimapDragStart.panOffset.y - canvasDeltaY

                    // Clamp to bounds using dynamic canvas bounds
                    const maxPanX = canvasBounds.offsetX
                    const maxPanY = canvasBounds.offsetY
                    const clampedOffset = {
                      x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
                      y: Math.max(-maxPanY, Math.min(maxPanY, newPanY))
                    }

                    setPanOffset(clampedOffset)
                    savePanOffsetToSession(clampedOffset)
                  }}
                  onMouseUp={() => {
                    if (isDraggingMinimap) {
                      minimapDragJustEnded.current = true
                      setTimeout(() => { minimapDragJustEnded.current = false }, 50)
                    }
                    setIsDraggingMinimap(false)
                    setMinimapDragStart(null)
                  }}
                  onMouseLeave={() => {
                    if (isDraggingMinimap) {
                      minimapDragJustEnded.current = true
                      setTimeout(() => { minimapDragJustEnded.current = false }, 50)
                    }
                    setIsDraggingMinimap(false)
                    setMinimapDragStart(null)
                  }}
                >
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 216 160"
                    preserveAspectRatio="none"
                    style={{ display: 'block' }}
                  >
                    {/* Draw memories as red dots */}
                    {displayMemories.map(memory => {
                      // Scale memory position to minimap size (adjusted for dynamic bounds)
                      // Memory positions are in large canvas coords, need to map to dynamic bounds
                      const adjustedX = memory.x - CANVAS_OFFSET_X + canvasBounds.offsetX
                      const adjustedY = memory.y - CANVAS_OFFSET_Y + canvasBounds.offsetY
                      const x = (adjustedX / canvasBounds.width) * 216
                      const y = (adjustedY / canvasBounds.height) * 160

                      // Only show dots that are within the current dynamic bounds
                      if (x < 0 || x > 216 || y < 0 || y > 160) return null

                      return (
                        <circle
                          key={memory.id}
                          cx={x}
                          cy={y}
                          r="1.5"
                          fill="#dc3545"
                          opacity="0.9"
                        />
                      )
                    })}

                    {/* Draw viewport rectangle */}
                    {(() => {
                      // Calculate viewport dimensions accounting for sidebar
                      const sidebarWidth = isSidebarOpen ? 400 : 0
                      const viewportWidth = window.innerWidth - sidebarWidth
                      const viewportHeight = window.innerHeight

                      // Calculate what portion of the canvas is visible (using dynamic bounds)
                      // panOffset controls position within the pannable area
                      // At panOffset=0, viewport is centered in the dynamic bounds
                      const canvasLeft = (canvasBounds.offsetX - panOffset.x) / zoomLevel
                      const canvasTop = (canvasBounds.offsetY - panOffset.y) / zoomLevel

                      // Account for zoom - when zoomed out, viewport shows more canvas
                      const canvasVisibleWidth = viewportWidth / zoomLevel
                      const canvasVisibleHeight = viewportHeight / zoomLevel

                      // Scale to minimap dimensions (216x160)
                      let minimapX = (canvasLeft / canvasBounds.width) * 216
                      let minimapY = (canvasTop / canvasBounds.height) * 160
                      let minimapW = (canvasVisibleWidth / canvasBounds.width) * 216
                      let minimapH = (canvasVisibleHeight / canvasBounds.height) * 160

                      // Clamp rectangle to stay within minimap bounds
                      // If rectangle extends beyond left/top edge, adjust x/y and reduce width/height
                      if (minimapX < 0) {
                        minimapW += minimapX // reduce width by amount off-screen
                        minimapX = 0
                      }
                      if (minimapY < 0) {
                        minimapH += minimapY // reduce height by amount off-screen
                        minimapY = 0
                      }
                      // Clamp right/bottom edges
                      if (minimapX + minimapW > 216) {
                        minimapW = 216 - minimapX
                      }
                      if (minimapY + minimapH > 160) {
                        minimapH = 160 - minimapY
                      }
                      // Ensure minimum visible size
                      minimapW = Math.max(4, minimapW)
                      minimapH = Math.max(4, minimapH)

                      return (
                        <rect
                          x={minimapX}
                          y={minimapY}
                          width={minimapW}
                          height={minimapH}
                          fill="rgba(66, 135, 245, 0.1)"
                          stroke="#4287f5"
                          strokeWidth="1.5"
                          style={{ cursor: isDraggingMinimap ? 'grabbing' : 'grab' }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            const container = e.currentTarget.ownerSVGElement.parentElement
                            const rect = container.getBoundingClientRect()
                            const mouseX = e.clientX - rect.left
                            const mouseY = e.clientY - rect.top

                            setIsDraggingMinimap(true)
                            setMinimapDragStart({
                              mouseX,
                              mouseY,
                              panOffset: { ...panOffset }
                            })
                          }}
                        />
                      )
                    })()}
                  </svg>
                </div>
              </div>
            )}

            {/* Canvas expansion arrows - appear when user tries to pan past canvas edge */}
            {(() => {
              const sidebarWidth = isSidebarOpen ? 400 : 0

              // Maroon rectangle with white arrow styling
              const baseStyle = {
                position: 'absolute',
                background: '#800020', // Maroon
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 100,
                color: 'white',
                transition: 'opacity 0.2s',
                borderRadius: '1px'
              }

              // Horizontal arrows (left/right) - slim rectangles
              const horizontalStyle = {
                ...baseStyle,
                width: '20px',
                height: '48px'
              }

              // Vertical arrows (up/down) - slim rectangles
              const verticalStyle = {
                ...baseStyle,
                width: '48px',
                height: '20px'
              }

              return (
                <>
                  {showExpandArrow.left && (
                    <button
                      style={{ ...horizontalStyle, left: 0, top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => expandCanvas('left')}
                      title="Expand canvas left"
                    >
                      <ChevronLeft size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.right && (
                    <button
                      style={{ ...horizontalStyle, right: sidebarWidth, top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => expandCanvas('right')}
                      title="Expand canvas right"
                    >
                      <ChevronRight size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.up && (
                    <button
                      style={{ ...verticalStyle, left: `calc(50% - ${sidebarWidth / 2}px)`, top: 0, transform: 'translateX(-50%)' }}
                      onClick={() => expandCanvas('up')}
                      title="Expand canvas up"
                    >
                      <ChevronUp size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.down && (
                    <button
                      style={{ ...verticalStyle, left: `calc(50% - ${sidebarWidth / 2}px)`, bottom: 0, transform: 'translateX(-50%)' }}
                      onClick={() => expandCanvas('down')}
                      title="Expand canvas down"
                    >
                      <ChevronDown size={16} color="white" />
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </div>
        </div>
        <SidebarContainer isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)}>
            <TabbedSidebar
              defaultTabIndex={0}
              // Library filtering props - TabbedSidebar handles Libraries tab internally
              libraries={libraries}
              selectedLibraryId={selectedLibraryId}
              onLibrarySelect={selectLibrary}
              getLibraryMemoryCount={getLibraryMemoryCount}
              onLibraryNavigate={() => window.location.href = '/libraries'}
              // Search props
              memories={sidebarMemories}
              onSearchFilter={(advancedFiltered, searchTerm) => {
                setSidebarAdvancedFiltered(advancedFiltered)
                setSidebarSearchTerm(searchTerm)
              }}
              tabs={[
                {
                  label: 'Memories',
                  icon: <Library size={16} />,
                  onNavigate: () => window.location.href = '/archive',
                  content: (
                    <Sidebar
                      memories={sidebarMemories}
                      droppedMemories={displayMemories}
                      onRandomlyPlaceMemory={randomlyPlaceMemory}
                      formatTitleForDisplay={formatTitleForDisplay}
                      isSimplified={isSimplified}
                      onEditMemory={handleEditMemory}
                      onDeleteMemory={handleDeleteMemory}
                      searchTerm={sidebarSearchTerm}
                      advancedFilteredMemories={sidebarAdvancedFiltered}
                    />
                  )
                },
                {
                  label: 'Constellations',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 548.15 569.79" fill="currentColor">
                      <path d="M296.2,88.71c21.26-.59,42.52-1.15,63.78-1.8,4.14-.13,8.26-.75,12.4-.95,4.22-.19,5.47-3.29,6.64-6.44,5.34-14.33,10.64-28.67,15.93-43.01,3.68-9.98,7.06-20.08,11.15-29.88,1.1-2.63,3.97-5.4,6.63-6.28,3.98-1.3,7.65,1.12,9.33,4.92,2.62,5.91,4.7,12.06,6.98,18.12,7.01,18.67,13.96,37.36,21.01,56.01,2.66,7.04,3.53,7.35,10.98,7.6,26.57,.92,53.14,1.86,79.69,3.17,2.38,.12,5.61,2.41,6.71,4.57,1.84,3.61-.12,7.14-3.26,9.59-5.89,4.6-11.86,9.11-17.81,13.62-15.61,11.82-31.21,23.67-46.88,35.41-3.5,2.62-3.98,5.76-2.86,9.67,7.21,25.23,14.37,50.48,21.54,75.72,.32,1.11,.68,2.23,.83,3.37,.53,4.02-1.01,7.17-4.31,9.44-3.18,2.19-6.34,1.65-9.31-.39-10.55-7.23-21.09-14.49-31.59-21.79-10.91-7.58-21.86-15.12-32.64-22.89-4-2.88-7.34-2.76-11.3,.08-20.39,14.6-40.88,29.05-61.35,43.54-4.04,2.86-8.16,5.61-13.11,1.98-4.33-3.17-5.07-7.44-3.58-12.4,.86-2.86,1.33-5.82,2.11-8.71,5.84-21.64,11.58-43.32,17.67-64.89,1.45-5.13,.83-8.37-3.68-11.88-20.82-16.22-41.25-32.93-61.94-49.32-3.26-2.59-5.96-5.23-4.43-9.55,1.54-4.31,4.96-6.52,9.69-6.4,1.66,.04,3.33,0,4.99,0v-.27Z"/>
                      <path d="M53.44,160.72c0-6.98-.3-13.98,.16-20.93,.17-2.49,1.75-6.39,3.48-6.88,2.14-.61,5.91,.93,7.57,2.79,9.28,10.42,18.23,21.14,27.1,31.92,3.25,3.95,6.26,6.01,11.84,3.91,12.9-4.86,26.06-9.05,39.16-13.37,2.14-.71,4.6-1.28,6.76-.94,3.67,.58,4.84,4.59,2.44,8.39-6.21,9.83-12.6,19.55-18.92,29.31-1.08,1.67-2.18,3.34-3.22,5.03-6.55,10.56-6.91,7.04,.95,17.71,8.19,11.11,16.71,21.97,24.82,33.13,1.12,1.54,1.67,4.97,.74,6.15-1.34,1.69-4.51,3.27-6.49,2.87-8.77-1.79-17.39-4.33-26.08-6.55-6.44-1.64-12.91-3.13-19.34-4.83-3.17-.84-5.36,.01-7.23,2.75-7.68,11.25-15.48,22.42-23.24,33.62-.76,1.09-1.27,2.54-2.29,3.22-2.31,1.55-5.23,4.17-7.24,3.67-2.04-.51-4.33-4.08-4.68-6.57-1.52-10.66-2.37-21.43-3.48-32.15-.24-2.31-.98-4.66-.72-6.91,1.13-9.98-4.22-13.88-13.09-16.25-12.49-3.34-24.71-7.71-36.92-12.02-2.28-.81-5.82-3.94-5.5-5.04,.76-2.59,3.06-5.68,5.51-6.67,10.31-4.19,20.9-7.69,31.39-11.45,2.35-.84,4.68-1.71,7.01-2.61,9.24-3.56,9.32-3.69,9.34-13.82,0-5.83,0-11.65,0-17.48,.06,0,.12,0,.18,0Z"/>
                      <path d="M224.77,426.94c7.45-.44,14.9-.98,22.36-1.28,3.81-.15,4.95-2.71,6-5.64,3.24-9.07,6.34-18.19,9.94-27.11,.91-2.27,3.8-5.65,5.2-5.39,2.4,.45,5.29,2.95,6.31,5.31,4.01,9.29,7.48,18.82,10.93,28.34,1.44,3.98,3.67,5.71,8.1,5.57,9.97-.3,19.96-.11,29.94-.08,1.66,0,3.5-.22,4.91,.42,1.68,.77,3.66,2.12,4.22,3.68,.37,1.03-1.23,3.28-2.5,4.28-8.7,6.91-17.4,13.85-26.42,20.32-3.57,2.56-3.99,5.35-3,9.01,2.59,9.61,5.39,19.17,7.66,28.86,.59,2.54-.45,5.47-.74,8.22-2.71-.57-5.84-.47-8.06-1.84-8.06-4.95-15.96-10.2-23.62-15.75-3.62-2.62-6.45-2.38-9.91-.03-8.24,5.61-16.53,11.15-25,16.39-2.01,1.24-4.81,1.2-7.25,1.76-.51-2.82-1.9-5.83-1.36-8.44,1.99-9.74,4.42-19.41,7.07-29,1.14-4.12-.33-6.69-3.33-9.02-8.39-6.5-16.87-12.89-25.07-19.63-1.78-1.46-2.49-4.22-3.69-6.38,2.27-.96,4.48-2.43,6.84-2.76,3.43-.47,6.97-.12,10.46-.12,0,.10,.01,.20,.02,.29Z"/>
                      <path d="M73.41,558.97c-4.27-1.33-9.11-2.58-13.75-4.36-3.92-1.5-6.66-.56-9.13,2.62-2.86,3.67-5.85,7.25-8.93,10.74-.8,.91-2.52,2.08-3.19,1.77-1.09-.5-2.21-2.07-2.34-3.29-.48-4.45-.88-8.96-.68-13.42,.21-4.69-1.31-7.49-5.96-8.92-4.43-1.37-8.71-3.3-12.96-5.2-1.39-.62-2.47-1.91-3.7-2.89,1.38-1,2.63-2.35,4.17-2.93,4.82-1.82,9.87-3.07,14.56-5.15,1.66-.74,3.34-3.1,3.63-4.94,.8-4.9,.74-9.93,1.26-14.89,.14-1.34,.99-3.55,1.75-3.66,1.32-.18,3.27,.58,4.17,1.63,3.36,3.9,6.48,8.02,9.52,12.18,1.92,2.62,3.97,3.52,7.23,2.38,5.02-1.75,10.17-3.14,15.33-4.45,1.27-.32,2.78,.26,4.17,.42-.28,1.35-.18,2.95-.89,4-2.88,4.27-5.91,8.45-9.07,12.52-2.11,2.72-2.45,5.09-.36,8.1,2.93,4.23,5.47,8.74,8.09,13.18,1.56,2.64,1.25,4.48-2.91,4.55Z"/>
                    </svg>
                  ),
                  onNavigate: undefined, // No navigation for constellations
                  onClick: () => {
                    // Toggle constellation mode when clicking the tab
                    if (!selectedPin) { // Disable during pin selection
                      const newMode = !isConstellationMode
                      setIsConstellationMode(newMode)
                      if (!newMode) {
                        setConstellationSelectedNodes(null)
                      }
                    }
                  },
                  content: (
                    <ConstellationSidebar
                      droppedMemories={displayMemories}
                      connections={connections}
                      standalonePins={displayStandalonePins}
                      panOffset={panOffset}
                      zoomLevel={zoomLevel}
                      viewportWidth={window.innerWidth}
                      viewportHeight={window.innerHeight}
                      onLoadConstellation={handleLoadConstellation}
                      onConstellationSelect={setConstellationSelectedNodes}
                      selectedConstellationNodes={constellationSelectedNodes}
                      onPanToNetwork={handlePanToNetwork}
                      searchTerm={sidebarSearchTerm}
                    />
                  )
                }
              ]}
            />
          </SidebarContainer>

        <VennDiagramModal
          connection={selectedConnection}
          memories={[...memories, ...droppedMemories]}
          isOpen={showVennModal}
          onClose={() => {
            setShowVennModal(false)
            setSelectedConnection(null)
          }}
          onSave={handleSaveInsight}
          formatTitleForDisplay={formatTitleForDisplay}
        />

        <MemoryModal
          isOpen={showAddMemoryModal}
          onClose={() => {
            setShowAddMemoryModal(false)
            setEditingMemory(null)
            setViewMode(false)
          }}
          onSave={handleSaveMemories}
          editingMemory={editingMemory}
          isSimplified={isSimplified}
          viewMode={viewMode}
        />

        {/* Render connections for actively dragged memory above the drag overlay */}
        <DragConnections
          activeMemoryData={activeMemoryData}
          activeTransform={activeTransform}
          connections={connections}
          droppedMemories={displayMemories}
          standalonePins={displayStandalonePins}
          panOffset={panOffset}
          zoomLevel={zoomLevel}
          isStackedView={isSimplified}
        />

        <DragOverlay dropAnimation={null}>
          {activeMemoryData ? (
            <div className="drag-overlay">
              {/* Use dropped-memory class when from canvas so styles match the actual card */}
              <div className={`${activeMemoryData.isOnCanvas ? 'dropped-memory' : ''} ${isSimplified ? 'stacked-view' : ''}`}>
                <MemoryCard
                  memory={activeMemoryData}
                  isStackedView={isSimplified}
                  formatTitleForDisplay={formatTitleForDisplay}
                />
                {/* Pin inherits positioning from CSS via dropped-memory class */}
                {activeMemoryData.isOnCanvas && (
                  <div className="memory-pin">
                    <div className="memory-pin-circle" />
                    <div className="memory-pin-tail" />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}

        {editingPin && (
          <PinEditModal
            pin={editingPin}
            onSave={handleSavePinDescription}
            onClose={() => setEditingPin(null)}
          />
        )}

        <Modal
          isOpen={showSaveBoardModal}
          onClose={() => setShowSaveBoardModal(false)}
          title="Save As New Board"
          className="save-board-modal"
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={() => setShowSaveBoardModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveBoard}
              >
                Save
              </button>
            </>
          }
        >
          <p className="board-modal-subtitle">
            Enter a name for this board configuration
          </p>
          <input
            type="text"
            value={boardNameInput}
            onChange={(e) => setBoardNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveBoard()
              }
            }}
            placeholder="Board name..."
            className="board-modal-input"
            autoFocus
          />
        </Modal>

        {showLoadBoardModal && (
          <div className="board-modal-overlay" onClick={() => setShowLoadBoardModal(false)}>
            <div className="board-modal load-board-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Load Board</h3>
              {savedBoards.length === 0 ? (
                <p className="board-modal-empty">No saved boards yet. Save your current board to get started.</p>
              ) : (
                <div className="saved-boards-list">
                  {savedBoards.map(board => (
                    <div key={board.id} className="saved-board-item">
                      <div className="saved-board-info">
                        <div className="saved-board-name">{board.name}</div>
                      </div>
                      <div className="saved-board-actions">
                        <button
                          className="saved-board-load"
                          onClick={() => handleLoadBoardClick(board.id)}
                        >
                          Load
                        </button>
                        <button
                          className="saved-board-delete"
                          onClick={() => handleDeleteBoard(board.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="board-modal-buttons">
                <button
                  className="board-modal-cancel"
                  onClick={() => setShowLoadBoardModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share Board Modal */}
        <ShareBoardModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          boardState={boardState}
          boardName={activeBoardName || 'My Board'}
        />

        {memoryPopup && (
          <MemoryPopup
            memory={memoryPopup.memory}
            x={memoryPopup.x}
            y={memoryPopup.y}
            onClose={() => setMemoryPopup(null)}
          />
        )}

        {/* Constellation Selection Overlay */}
        {isConstellationMode && (
          <div
            className="constellation-selection-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 8999
            }}
          >
            {/* Overlay for memories */}
            {displayMemories.filter(m => {
              return connections.some(conn =>
                compareIds(conn.from, m.id) || compareIds(conn.to, m.id)
              )
            }).map(memory => (
              <div
                key={memory.id}
                className={`selectable-memory ${constellationSelectedNodes?.has(memory.id) ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  // Use canvasToScreen formula: screenX = canvasX * zoom + panOffset - CANVAS_OFFSET
                  left: memory.x * zoomLevel + panOffset.x - CANVAS_OFFSET_X,
                  top: memory.y * zoomLevel + panOffset.y - CANVAS_OFFSET_Y,
                  width: `${CARD_WIDTH * zoomLevel}px`,
                  height: `${CARD_HEIGHT * zoomLevel}px`,
                  pointerEvents: 'all',
                  cursor: 'pointer',
                  border: constellationSelectedNodes?.has(memory.id) ? '3px solid #FFD700' : '2px solid transparent',
                  borderRadius: `${8 * zoomLevel}px`,
                  transition: 'all 0.2s'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  // Find and select the entire connected network
                  const network = new Set([memory.id])
                  const toProcess = [memory.id]

                  while (toProcess.length > 0) {
                    const current = toProcess.pop()
                    connections.forEach(conn => {
                      const fromMatch = compareIds(conn.from, current)
                      const toMatch = compareIds(conn.to, current)

                      if (fromMatch && !network.has(conn.to)) {
                        network.add(conn.to)
                        toProcess.push(conn.to)
                      }
                      if (toMatch && !network.has(conn.from)) {
                        network.add(conn.from)
                        toProcess.push(conn.from)
                      }
                    })
                  }

                  setConstellationSelectedNodes(network)
                }}
              />
            ))}

            {/* Overlay for pins */}
            {displayStandalonePins.filter(p => {
              return connections.some(conn =>
                compareIds(conn.from, p.id) || compareIds(conn.to, p.id)
              )
            }).map(pin => (
              <div
                key={pin.id}
                className={`selectable-pin ${constellationSelectedNodes?.has(pin.id) ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  // Use canvasToScreen formula: screenX = canvasX * zoom + panOffset - CANVAS_OFFSET
                  left: pin.x * zoomLevel + panOffset.x - CANVAS_OFFSET_X,
                  top: pin.y * zoomLevel + panOffset.y - CANVAS_OFFSET_Y,
                  width: `${30 * zoomLevel}px`,
                  height: `${30 * zoomLevel}px`,
                  pointerEvents: 'all',
                  cursor: 'pointer',
                  border: constellationSelectedNodes?.has(pin.id) ? '3px solid #FFD700' : '2px solid transparent',
                  borderRadius: '50%',
                  transition: 'all 0.2s'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  // Find and select the entire connected network
                  const network = new Set([pin.id])
                  const toProcess = [pin.id]

                  while (toProcess.length > 0) {
                    const current = toProcess.pop()
                    connections.forEach(conn => {
                      const fromMatch = compareIds(conn.from, current)
                      const toMatch = compareIds(conn.to, current)

                      if (fromMatch && !network.has(conn.to)) {
                        network.add(conn.to)
                        toProcess.push(conn.to)
                      }
                      if (toMatch && !network.has(conn.from)) {
                        network.add(conn.from)
                        toProcess.push(conn.from)
                      }
                    })
                  }

                  setConstellationSelectedNodes(network)
                }}
              />
            ))}
          </div>
        )}

        {/* Playground Modal */}
        {playgroundOpen && currentPlaygroundId && (
          <PlaygroundModal
            isOpen={playgroundOpen}
            onClose={() => setPlaygroundOpen(false)}
            playgroundId={currentPlaygroundId}
            userId={user?.uid}
          />
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <SettingsModal
            onClose={() => setShowSettingsModal(false)}
            onOpenRecentlyDeleted={() => setShowRecentlyDeleted(true)}
            deletedCount={deletedMemories.length}
            showOpacityFading={showOpacityFading}
            setShowOpacityFading={setShowOpacityFading}
            showMinimap={showMinimap}
            setShowMinimap={setShowMinimap}
            user={user}
            memoryCount={memories.length}
          />
        )}

        {/* Recently Deleted Modal */}
        {showRecentlyDeleted && (
          <RecentlyDeletedModal
            deletedMemories={deletedMemories}
            onRestore={restoreMemory}
            onPermanentDelete={permanentlyDeleteMemory}
            onEmptyTrash={emptyTrash}
            onClose={() => setShowRecentlyDeleted(false)}
            onBackToSettings={() => {
              setShowRecentlyDeleted(false)
              setShowSettingsModal(true)
            }}
            formatTitleForDisplay={formatTitleForDisplay}
          />
        )}
      </div>
    </DndContext>
  )
}

export default ConspiracyBoard