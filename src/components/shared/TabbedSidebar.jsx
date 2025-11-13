import { useState, useEffect } from 'react';
import './TabbedSidebar.css';

export default function TabbedSidebar({
  tabs = [],                    // Array of { label, content }
  defaultTabIndex = 0,          // Which tab to show first
  showSearchToggle = false,     // Whether to show search toggle button
  searchContent = null,         // Content to show when in search mode
}) {
  const [activeTabIndex, setActiveTabIndex] = useState(defaultTabIndex);
  const [isSearchMode, setIsSearchMode] = useState(false);

  const toggleSearchMode = () => {
    setIsSearchMode(!isSearchMode);
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
            {tabs.map((tab, index) => (
              <button
                key={index}
                className={`sidebar-tab ${activeTabIndex === index ? 'active' : ''}`}
                onClick={() => setActiveTabIndex(index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="tabbed-sidebar-content">
        {isSearchMode ? (
          // Show search content when in search mode (full Sidebar with search)
          searchContent
        ) : (
          // Show active tab content
          tabs[activeTabIndex]?.content
        )}
      </div>
    </div>
  );
}
