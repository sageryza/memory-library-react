import { useState, useEffect, cloneElement, isValidElement, useRef } from 'react';
import { LogOut, Search } from 'lucide-react';
import LibraryIcon from './LibraryIcon';
import SearchInput from './SearchInput';
import AdvancedSearch from './AdvancedSearch';
import { LibraryCard } from '../archive/LibrarySidebar';
import './TabbedSidebar.css';

export default function TabbedSidebar({
  tabs = [],                    // Array of { label, icon, content, onNavigate, onClick }
  defaultTabIndex = 0,          // Which tab to show first
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
  // Search props
  memories = [],                // All memories for advanced search filtering
  onSearchFilter = null,        // Callback when search filters memories: (filteredMemories) => void
}) {
  const [internalTabIndex, setInternalTabIndex] = useState(defaultTabIndex);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilteredMemories, setAdvancedFilteredMemories] = useState(null);
  const searchInputRef = useRef(null);

  // Use controlled or internal tab index
  const activeTabIndex = controlledTabIndex !== undefined ? controlledTabIndex : internalTabIndex;
  const setActiveTabIndex = onTabChange || setInternalTabIndex;

  // Handle escape key to collapse search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isSearchExpanded) {
        setIsSearchExpanded(false);
        setSearchTerm('');
        setShowAdvancedSearch(false);
        setAdvancedFilteredMemories(null);
        if (onSearchFilter) onSearchFilter(null, '');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchExpanded, onSearchFilter]);

  // Focus search input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      const input = searchInputRef.current.querySelector('input');
      if (input) input.focus();
    }
  }, [isSearchExpanded]);

  // Notify parent of search changes
  useEffect(() => {
    if (onSearchFilter) {
      onSearchFilter(advancedFilteredMemories, searchTerm);
    }
  }, [searchTerm, advancedFilteredMemories, onSearchFilter]);

  // Reset search state when switching tabs
  useEffect(() => {
    setIsSearchExpanded(false);
    setSearchTerm('');
    setShowAdvancedSearch(false);
    setAdvancedFilteredMemories(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabIndex]);

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
          title="Exit library"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  })();

  // Filter libraries by search term
  const filteredLibraries = libraries ? libraries.filter(lib => {
    if (lib.isLocked) return false;
    if (!searchTerm) return true;
    return lib.name.toLowerCase().includes(searchTerm.toLowerCase());
  }) : [];

  // Build the Libraries tab content if libraries prop is provided
  const librariesTabContent = libraries ? (
    <>
      {filteredLibraries.length === 0 ? (
        <div className="empty-state">
          <p>{searchTerm ? 'No libraries match your search' : 'No libraries yet'}</p>
        </div>
      ) : (
        filteredLibraries.map(library => (
          <LibraryCard
            key={library.id}
            library={library}
            memoryCount={getLibraryMemoryCount ? getLibraryMemoryCount(library.id) : 0}
            onClick={() => handleLibraryClick(library.id)}
            isActive={selectedLibraryId === library.id}
          />
        ))
      )}
    </>
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
      <div className="tabbed-sidebar-header">
        {/* Tabs */}
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

      {/* Content area */}
      <div className="tabbed-sidebar-content">
        {/* Static spacer with inline search and optional filter indicator */}
        <div className="tabbed-sidebar-static-spacer">
          {/* Inline search - icon replaced by search field when expanded */}
          <div className={`inline-search ${isSearchExpanded ? 'expanded' : ''}`} ref={searchInputRef}>
            {!isSearchExpanded ? (
              <button
                className="inline-search-btn"
                onClick={() => setIsSearchExpanded(true)}
                title="Search"
              >
                <Search size={16} />
              </button>
            ) : (
              <div className="inline-search-input">
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  onToggleAdvanced={() => setShowAdvancedSearch(!showAdvancedSearch)}
                  placeholder={activeTabIndex === 0 ? "Search memories..." : activeTabIndex === librariesTabIndex ? "Search libraries..." : "Search..."}
                />
              </div>
            )}
          </div>
          {/* Library filter indicator - only on Memories tab */}
          {activeTabIndex === 0 && builtFilterIndicator}
        </div>

        {/* Advanced search panel - only for Memories tab */}
        {activeTabIndex === 0 && showAdvancedSearch && (
          <AdvancedSearch
            isOpen={showAdvancedSearch}
            memories={memories}
            onFilter={(filtered) => setAdvancedFilteredMemories(filtered)}
          />
        )}

        {/* Tab content */}
        <div className="tab-content">
          {allTabs[activeTabIndex]?.content}
        </div>
      </div>
    </div>
  );
}
