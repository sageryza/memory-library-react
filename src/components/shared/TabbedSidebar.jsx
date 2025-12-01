import { useState, useEffect, cloneElement, isValidElement } from 'react';
import { LogOut } from 'lucide-react';
import LibraryIcon from './LibraryIcon';
import { LibraryCard } from '../archive/LibrarySidebar';
import './TabbedSidebar.css';

export default function TabbedSidebar({
  tabs = [],                    // Array of { label, icon, content, onNavigate, onClick }
  defaultTabIndex = 0,          // Which tab to show first
  showSearchToggle = false,     // Whether to show search toggle button
  searchContent = null,         // Content to show when in search mode
  onCloseSearch = null,         // Callback to inject into searchContent for closing search
  activeTabIndex: controlledTabIndex,  // Optional controlled tab index
  onTabChange,                  // Callback when tab changes (for controlled mode)
  filterIndicator = null,       // DEPRECATED: Use libraries prop instead. Optional element to show below tabs.
  // Library filtering props (optional - enables built-in library tab handling)
  libraries = null,             // Array of library objects - if provided, Libraries tab is rendered internally
  selectedLibraryId = null,     // Currently selected library ID for filtering
  onLibrarySelect = null,       // Callback when a library is selected: (libraryId) => void
  getLibraryMemoryCount = null, // Function to get memory count for a library: (libraryId) => number
  librariesTabIndex = 1,        // Which tab index the Libraries tab should be at (default: 1, after Memories)
  onLibraryNavigate = null,     // Navigation callback when Libraries tab is double-clicked
}) {
  const [internalTabIndex, setInternalTabIndex] = useState(defaultTabIndex);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Use controlled or internal tab index
  const activeTabIndex = controlledTabIndex !== undefined ? controlledTabIndex : internalTabIndex;
  const setActiveTabIndex = onTabChange || setInternalTabIndex;

  const toggleSearchMode = () => {
    setIsSearchMode(!isSearchMode);
  };

  const closeSearchMode = () => {
    setIsSearchMode(false);
  };

  // Handle escape key to exit search mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isSearchMode) {
        setIsSearchMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchMode]);

  // Handle library selection - select library and switch to Memories tab
  const handleLibraryClick = (libraryId) => {
    if (onLibrarySelect) {
      onLibrarySelect(libraryId);
    }
    setActiveTabIndex(0); // Switch to Memories tab
  };

  // Build the filter indicator if we have library props and a selected library
  const builtFilterIndicator = (() => {
    // If legacy filterIndicator prop is provided, use it
    if (filterIndicator) return filterIndicator;

    // Otherwise build our own if we have library selection
    if (!libraries || !selectedLibraryId || activeTabIndex !== 0) return null;

    const selectedLibrary = libraries.find(lib => lib.id === selectedLibraryId);
    if (!selectedLibrary) return null;

    return (
      <div className="library-filter-indicator">
        <span className="library-filter-name">{selectedLibrary.name}</span>
        <button
          className="library-filter-clear"
          onClick={() => onLibrarySelect && onLibrarySelect(null)}
          title="Clear filter"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  })();

  // Build the Libraries tab content if libraries prop is provided
  const librariesTabContent = libraries ? (
    <div className="sidebar-content">
      <div className="sidebar-libraries-grid">
        {libraries.filter(lib => !lib.isLocked).length === 0 ? (
          <div className="empty-state">
            <p>No libraries yet</p>
          </div>
        ) : (
          libraries.filter(lib => !lib.isLocked).map(library => (
            <LibraryCard
              key={library.id}
              library={library}
              memoryCount={getLibraryMemoryCount ? getLibraryMemoryCount(library.id) : 0}
              onClick={() => handleLibraryClick(library.id)}
              isActive={selectedLibraryId === library.id}
            />
          ))
        )}
      </div>
    </div>
  ) : null;

  // Build the full tabs array, inserting Libraries tab if needed
  const allTabs = (() => {
    if (!libraries) return tabs;

    // Insert Libraries tab at the specified index
    const result = [...tabs];
    const librariesTab = {
      label: 'Libraries',
      icon: <LibraryIcon size={16} color="currentColor" />,
      onNavigate: onLibraryNavigate,
      content: librariesTabContent
    };

    // Insert at librariesTabIndex position
    result.splice(librariesTabIndex, 0, librariesTab);
    return result;
  })();

  return (
    <div className={`sidebar ${builtFilterIndicator ? 'has-filter' : ''}`}>
      {/* Only show header when NOT in search mode */}
      {!isSearchMode && (
        <div className="tabbed-sidebar-header">
          {/* Search toggle button (left side) */}
          {showSearchToggle && (
            <button
              className="search-toggle-btn"
              onClick={toggleSearchMode}
              title="Search"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
              </svg>
            </button>
          )}

          {/* Tabs (right side) */}
          <div className="sidebar-tabs">
            {allTabs.map((tab, index) => {
              const isActive = activeTabIndex === index;
              // Check if tab has an external active state (for modes like constellation)
              const isExternallyActive = tab.isActive !== undefined ? tab.isActive : false;

              const handleTabClick = () => {
                // Call the onClick handler if provided (for things like toggling modes)
                if (tab.onClick) {
                  tab.onClick();
                }

                if (isActive && tab.onNavigate) {
                  // Already active - navigate to page
                  tab.onNavigate();
                } else {
                  // Not active - switch to this tab
                  setActiveTabIndex(index);
                }
              };

              return (
                <button
                  key={index}
                  className={`sidebar-tab ${isActive ? 'active' : ''} ${isExternallyActive ? 'mode-active' : ''}`}
                  onClick={handleTabClick}
                >
                  {tab.icon && <span className="tab-icon">{tab.icon}</span>}
                  {isActive && <span className="tab-label">{tab.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="tabbed-sidebar-content">
        {/* Static spacer with optional filter indicator - sticky at top, only on Memories tab */}
        {!isSearchMode && activeTabIndex === 0 && (
          <div className={`tabbed-sidebar-static-spacer ${builtFilterIndicator ? 'has-content' : ''}`}>
            {builtFilterIndicator}
          </div>
        )}
        {isSearchMode ? (
          // Show search content when in search mode (full Sidebar with search)
          // Clone the searchContent and inject the closeSearchMode callback
          isValidElement(searchContent)
            ? cloneElement(searchContent, { onCloseSearch: closeSearchMode })
            : searchContent
        ) : (
          // Show active tab content
          allTabs[activeTabIndex]?.content
        )}
      </div>
    </div>
  );
}
