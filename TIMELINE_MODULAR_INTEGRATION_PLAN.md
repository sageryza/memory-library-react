# Timeline Modular Integration Plan

## Executive Summary

This document outlines a gradual, low-risk approach to refactoring the timeline/chronology component by breaking it into independent, testable modules that can be integrated one at a time without breaking existing functionality.

## Current Issues to Address

1. **Gap Addition Bug**: Gaps appear between adjacent memories after save
2. **Complex State Management**: 6+ refs tracking different aspects
3. **Performance Issues**: Load effect runs on every Firebase update
4. **Tight Coupling**: UI, state, and persistence are intertwined
5. **Testing Difficulty**: Hard to test individual features

## Proposed Architecture

```
┌──────────────────────────────────────────┐
│           Chronology Container           │
│         (Orchestrates modules)           │
└─────────┬────────────────────────────────┘
          │
    ┌─────┴─────┬──────────┬──────────┬─────────┐
    ▼           ▼          ▼          ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Timeline│ │DragDrop│ │  State │ │Firebase│ │Sidebar │
│Renderer│ │Manager │ │Manager │ │Persist │ │Manager │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

## Implementation Phases

### Phase 1: TimelineRenderer Component
**Timeline: Start immediately**
**Risk: Low**
**Testing: Can run alongside existing component**

```jsx
// src/components/timeline/TimelineRenderer.jsx
import React from 'react';

const TimelineRenderer = ({
  items = [],
  focusedIndex = 0,
  onItemClick,
  onItemHover,
  className = ''
}) => {
  // Pure rendering logic
  // No state, just display

  const getScale = (distance) => {
    if (distance === 0) return 1.0;
    if (distance === 1) return 0.75;
    if (distance === 2) return 0.55;
    if (distance === 3) return 0.4;
    return 0.25;
  };

  return (
    <div className={`timeline-renderer ${className}`}>
      {items.map((item, index) => {
        const distance = Math.abs(index - focusedIndex);
        const scale = getScale(distance);

        if (item.type === 'memory') {
          return (
            <div
              key={item.id}
              className="timeline-memory"
              style={{ transform: `scale(${scale})` }}
              onClick={() => onItemClick?.(item, index)}
              onMouseEnter={() => onItemHover?.(item, index)}
            >
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          );
        }

        if (item.type === 'gap') {
          return (
            <div
              key={item.id}
              className="timeline-gap"
              style={{ width: `${scale * 40}px` }}
            />
          );
        }

        return null;
      })}
    </div>
  );
};

export default TimelineRenderer;
```

### Phase 2: DragDropManager Hook
**Timeline: After Phase 1 is stable**
**Risk: Medium**
**Testing: Test with mock data first**

```jsx
// src/hooks/useDragDropManager.js
import { useState, useCallback } from 'react';

export const useDragDropManager = (onDrop) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((item, source) => {
    setDraggedItem({ item, source });
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropTarget(null);
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e, target) => {
    e.preventDefault();
    if (draggedItem && onDrop) {
      onDrop(draggedItem, target);
    }
    handleDragEnd();
  }, [draggedItem, onDrop, handleDragEnd]);

  return {
    draggedItem,
    dropTarget,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    setDropTarget
  };
};
```

### Phase 3: TimelineStateManager
**Timeline: After Phase 2**
**Risk: Medium**
**Testing: Unit test all state transitions**

```jsx
// src/hooks/useTimelineState.js
import { useState, useCallback } from 'react';

export const useTimelineState = (initialMemories = []) => {
  const [timeline, setTimeline] = useState([]);
  const [sidebarMemories, setSidebarMemories] = useState(initialMemories);

  // Core state manipulation functions
  const addMemoryToTimeline = useCallback((memory, position) => {
    setTimeline(prev => {
      const newTimeline = [...prev];
      // Add logic for inserting memory at position
      // Handle gap creation/removal
      return newTimeline;
    });

    setSidebarMemories(prev =>
      prev.filter(m => m.id !== memory.id)
    );
  }, []);

  const removeMemoryFromTimeline = useCallback((memoryId) => {
    const memory = timeline.find(item =>
      item.type === 'memory' && item.id === memoryId
    );

    if (memory) {
      setTimeline(prev =>
        prev.filter(item => item.id !== memoryId)
      );
      setSidebarMemories(prev => [...prev, memory]);
    }
  }, [timeline]);

  const reorderMemory = useCallback((memoryId, newPosition) => {
    // Reordering logic
  }, []);

  return {
    timeline,
    sidebarMemories,
    addMemoryToTimeline,
    removeMemoryFromTimeline,
    reorderMemory
  };
};
```

### Phase 4: Firebase Persistence Adapter
**Timeline: After Phase 3 is stable**
**Risk: High (affects data)**
**Testing: Extensive testing with test accounts**

```jsx
// src/hooks/useFirebasePersistence.js
import { useEffect, useRef } from 'react';
import { debounce } from '../utils/debounce';

export const useFirebasePersistence = ({
  timeline,
  sidebarMemories,
  userId,
  onLoad
}) => {
  const saveTimeoutRef = useRef(null);
  const lastSavedStateRef = useRef(null);

  // Save to Firebase (debounced)
  useEffect(() => {
    if (!userId) return;

    const currentState = JSON.stringify({ timeline, sidebarMemories });

    // Skip if nothing changed
    if (currentState === lastSavedStateRef.current) return;

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveToFirebase({ timeline, sidebarMemories });
        lastSavedStateRef.current = currentState;
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 2000); // 2 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [timeline, sidebarMemories, userId]);

  // Load from Firebase (once)
  useEffect(() => {
    if (!userId || !onLoad) return;

    loadFromFirebase(userId).then(data => {
      if (data) {
        onLoad(data);
      }
    });
  }, [userId]); // Only on userId change
};
```

### Phase 5: Integrated Chronology Component
**Timeline: After all phases tested**
**Risk: Low (if phases 1-4 work)**
**Testing: Integration testing**

```jsx
// src/components/ChronologyModular.jsx
import React from 'react';
import TimelineRenderer from './timeline/TimelineRenderer';
import { useDragDropManager } from '../hooks/useDragDropManager';
import { useTimelineState } from '../hooks/useTimelineState';
import { useFirebasePersistence } from '../hooks/useFirebasePersistence';
import MemorySidebar from './timeline/MemorySidebar';

const ChronologyModular = ({ memories, userId }) => {
  // State management
  const {
    timeline,
    sidebarMemories,
    addMemoryToTimeline,
    removeMemoryFromTimeline,
    reorderMemory
  } = useTimelineState(memories);

  // Drag and drop
  const dragDrop = useDragDropManager((draggedItem, target) => {
    if (draggedItem.source === 'sidebar') {
      addMemoryToTimeline(draggedItem.item, target.position);
    } else {
      reorderMemory(draggedItem.item.id, target.position);
    }
  });

  // Persistence
  useFirebasePersistence({
    timeline,
    sidebarMemories,
    userId,
    onLoad: (data) => {
      // Restore state from Firebase
    }
  });

  return (
    <div className="chronology-modular">
      <TimelineRenderer
        items={timeline}
        onItemClick={removeMemoryFromTimeline}
        {...dragDrop}
      />
      <MemorySidebar
        memories={sidebarMemories}
        onDragStart={dragDrop.handleDragStart}
      />
    </div>
  );
};

export default ChronologyModular;
```

## Testing Strategy

### Unit Tests (Per Module)
```javascript
// __tests__/TimelineRenderer.test.js
describe('TimelineRenderer', () => {
  it('renders memories correctly', () => {});
  it('applies correct scaling based on focus', () => {});
  it('handles click events', () => {});
});

// __tests__/useTimelineState.test.js
describe('useTimelineState', () => {
  it('adds memories at correct position', () => {});
  it('removes memories and returns to sidebar', () => {});
  it('maintains gap consistency', () => {});
});
```

### Integration Tests
```javascript
describe('Chronology Integration', () => {
  it('drags from sidebar to timeline', () => {});
  it('saves to Firebase after changes', () => {});
  it('restores state on reload', () => {});
  it('handles concurrent updates', () => {});
});
```

## Migration Path

1. **Week 1**: Implement TimelineRenderer alongside existing component
2. **Week 2**: Add drag/drop manager, test in isolation
3. **Week 3**: Implement state manager with unit tests
4. **Week 4**: Add Firebase persistence with fallback to old system
5. **Week 5**: Create feature flag to switch between old/new
6. **Week 6**: Gradual rollout to users (10% -> 50% -> 100%)
7. **Week 7**: Remove old component after stability confirmed

## Risk Mitigation

1. **Feature Flags**: Use flags to toggle between old/new implementation
```javascript
const ENABLE_MODULAR_CHRONOLOGY = process.env.REACT_APP_MODULAR_CHRONOLOGY === 'true';

// In App.jsx
{ENABLE_MODULAR_CHRONOLOGY ? <ChronologyModular /> : <Chronology />}
```

2. **Backwards Compatibility**: Ensure data format remains same
```javascript
// Data migration if needed
const migrateTimelineData = (oldFormat) => {
  // Convert old format to new if necessary
  return newFormat;
};
```

3. **Rollback Plan**: Keep old component for 2 releases
```bash
# Quick rollback if issues
git revert <commit-hash>
npm run deploy
```

## Success Metrics

- [ ] Gap bug fixed (no gaps appearing after save)
- [ ] 50% reduction in re-renders
- [ ] Firebase updates don't trigger full rebuild
- [ ] All existing features work
- [ ] Unit test coverage > 80%
- [ ] Load time improved by 30%

## Next Steps

1. Review this plan with team
2. Set up test environment
3. Create feature branch: `feature/modular-chronology`
4. Implement Phase 1 (TimelineRenderer)
5. Deploy to staging for testing

## Questions to Resolve

1. Should we store gap information in Firebase or generate dynamically?
2. Do we need chunk support in the new version?
3. What's the migration path for existing user data?
4. Should we add undo/redo functionality while refactoring?

---

**Created**: November 21, 2025
**Status**: Ready for Review
**Owner**: Development Team