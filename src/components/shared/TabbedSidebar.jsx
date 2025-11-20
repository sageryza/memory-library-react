import { useState, useEffect, cloneElement, isValidElement } from 'react';
import './TabbedSidebar.css';

export default function TabbedSidebar({
  tabs = [],                    // Array of { label, icon, content, onNavigate, onClick }
  defaultTabIndex = 0,          // Which tab to show first
  showSearchToggle = false,     // Whether to show search toggle button
  searchContent = null,         // Content to show when in search mode
  onCloseSearch = null,         // Callback to inject into searchContent for closing search
}) {
  const [activeTabIndex, setActiveTabIndex] = useState(defaultTabIndex);
  const [isSearchMode, setIsSearchMode] = useState(false);

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

  return (
    <div className="sidebar">
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
            {tabs.map((tab, index) => {
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
        {isSearchMode ? (
          // Show search content when in search mode (full Sidebar with search)
          // Clone the searchContent and inject the closeSearchMode callback
          isValidElement(searchContent)
            ? cloneElement(searchContent, { onCloseSearch: closeSearchMode })
            : searchContent
        ) : (
          // Show active tab content
          tabs[activeTabIndex]?.content
        )}
      </div>
    </div>
  );
}
