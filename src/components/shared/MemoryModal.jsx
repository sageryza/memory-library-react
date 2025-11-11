import { useState, useEffect } from 'react';
import './MemoryModal.css';
import keyword_extractor from 'keyword-extractor';
import useSimplifyView from '../../hooks/useSimplifyView';

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => {
        setShow(true);
      }}
      onMouseLeave={() => {
        setShow(false);
      }}
    >
      {children}
      {show && (
        <span className="tooltip-popup-below">
          {text}
        </span>
      )}
    </span>
  );
}

export default function MemoryModal({ isOpen, onClose, onSave, editingMemory = null }) {
  const { processInputTitle } = useSimplifyView();
  const [memoryUnits, setMemoryUnits] = useState([{
    id: 0,
    content: '',
    title: '',
    hashtags: '',
    additionalContext: '',
    showContext: false,
    showSort: false,
    breadcrumbs: ['', '', ''] // Start with 3 empty breadcrumb inputs
  }]);
  const [showBackupStatus, setShowBackupStatus] = useState(false);
  const [activeTab, setActiveTab] = useState('narrative'); // 'narrative' or 'intuitive'
  const [lastAddedUnitId, setLastAddedUnitId] = useState(null); // Track last added unit for toggle behavior

  // Intelligent title generation
  const generateTitle = (unitId) => {
    const unit = memoryUnits.find(u => u.id === unitId);
    if (!unit) return;

    // Check if title already has content
    if (unit.title.trim()) {
      if (!window.confirm('Replace existing title?')) {
        return;
      }
    }

    // Combine content and additional context, prioritizing content
    const text = `${unit.content} ${unit.additionalContext}`.trim();
    if (!text) return;

    try {
      // Extract keywords using keyword-extractor with n-grams support
      const allKeywords = keyword_extractor.extract(text, {
        language: 'english',
        remove_digits: false,
        return_changed_case: true, // Lowercase results
        return_chained_words: false,
        remove_duplicates: true,
        return_max_ngrams: 3 // Support 1, 2, and 3-word phrases
      });

      if (!allKeywords || allKeywords.length === 0) {
        // Fallback: extract unique words if extractor returns nothing
        const words = text.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2);

        const uniqueWords = [...new Set(words)].slice(0, 3);
        const generatedTitle = uniqueWords.join(', ');
        updateUnit(unitId, 'title', generatedTitle);
        return;
      }

      // Percentage-based approach: take top 30% of keywords, max 5
      const keywordCount = Math.max(1, Math.min(Math.ceil(allKeywords.length * 0.3), 5));

      // Take the top keywords
      const selectedKeywords = allKeywords.slice(0, keywordCount);

      // Join with commas
      const generatedTitle = selectedKeywords.join(', ');

      // Only update if we got a result
      if (generatedTitle) {
        updateUnit(unitId, 'title', generatedTitle);
      }

    } catch (error) {
      console.error('Error generating title:', error);
      // Fallback to simple word extraction
      const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 3);

      const generatedTitle = [...new Set(words)].join(', ');
      if (generatedTitle) {
        updateUnit(unitId, 'title', generatedTitle);
      }
    }
  };

  // Reset form when opening/closing or editing different memory
  useEffect(() => {
    if (isOpen) {
      if (editingMemory) {
        // Editing mode - populate with existing memory data
        // Extract hashtags without # symbol for display
        const hashtagsText = editingMemory.hashtags ?
          editingMemory.hashtags.map(tag => tag.replace('#', '')).join(' ') : '';

        // Format title - replace <br> with spaces for editing
        const titleText = editingMemory.title ? editingMemory.title.replace(/<br>/g, ' ') : '';

        setMemoryUnits([{
          id: 0,
          content: editingMemory.content || '',
          title: titleText,
          hashtags: hashtagsText,
          additionalContext: editingMemory.additionalContext || '',
          showContext: !!editingMemory.additionalContext,
          showSort: !!(titleText || hashtagsText),
          breadcrumbs: editingMemory.breadcrumbs && editingMemory.breadcrumbs.length > 0
            ? editingMemory.breadcrumbs
            : ['', '', '']
        }]);
      } else {
        // New memory mode - reset to empty
        setMemoryUnits([{
          id: 0,
          content: '',
          title: '',
          hashtags: '',
          additionalContext: '',
          showContext: false,
          showSort: false,
          breadcrumbs: ['', '', '']
        }]);
      }
      setShowBackupStatus(false);
      setLastAddedUnitId(null); // Reset toggle tracking
    }
  }, [isOpen, editingMemory]);

  const updateUnit = (id, field, value) => {
    setMemoryUnits(units => units.map(unit =>
      unit.id === id ? { ...unit, [field]: value } : unit
    ));
    // If user starts typing in the last added unit, clear the toggle tracking
    if (id === lastAddedUnitId && value.trim()) {
      setLastAddedUnitId(null);
    }
  };

  const updateBreadcrumb = (unitId, index, value) => {
    setMemoryUnits(units => units.map(unit =>
      unit.id === unitId
        ? {
            ...unit,
            breadcrumbs: unit.breadcrumbs.map((crumb, idx) =>
              idx === index ? value : crumb
            )
          }
        : unit
    ));
    // If user starts typing in the last added unit's breadcrumbs, clear the toggle tracking
    if (unitId === lastAddedUnitId && value.trim()) {
      setLastAddedUnitId(null);
    }
  };

  const addBreadcrumbField = (unitId) => {
    setMemoryUnits(units => units.map(unit =>
      unit.id === unitId
        ? { ...unit, breadcrumbs: [...unit.breadcrumbs, ''] }
        : unit
    ));
  };

  const toggleSection = (id, section) => {
    setMemoryUnits(units => units.map(unit =>
      unit.id === id ? { ...unit, [section]: !unit[section] } : unit
    ));
  };

  const addNewUnit = () => {
    // Check if the last added unit is still empty
    if (lastAddedUnitId !== null) {
      const lastUnit = memoryUnits.find(u => u.id === lastAddedUnitId);
      if (lastUnit) {
        const hasBreadcrumbs = lastUnit.breadcrumbs &&
                              lastUnit.breadcrumbs.some(crumb => crumb.trim());
        const isEmpty = !lastUnit.content.trim() &&
                       !lastUnit.title.trim() &&
                       !lastUnit.hashtags.trim() &&
                       !hasBreadcrumbs;

        // If empty, remove it (toggle off)
        if (isEmpty) {
          setMemoryUnits(units => units.filter(u => u.id !== lastAddedUnitId));
          setLastAddedUnitId(null);
          return;
        }
      }
    }

    // Add a new unit
    const newId = Math.max(...memoryUnits.map(u => u.id)) + 1;
    setMemoryUnits([...memoryUnits, {
      id: newId,
      content: '',
      title: '',
      hashtags: '',
      additionalContext: '',
      showContext: false,
      showSort: false,
      breadcrumbs: ['', '', '']
    }]);
    setLastAddedUnitId(newId);
  };

  const clearAll = () => {
    if (window.confirm('Clear all memory units?')) {
      setMemoryUnits([{
        id: 0,
        content: '',
        title: '',
        hashtags: '',
        additionalContext: '',
        showContext: false,
        showSort: false
      }]);
    }
  };

  const handleSave = async () => {
    // Filter out empty units - also check for breadcrumbs
    const validUnits = memoryUnits.filter(unit => {
      const hasBreadcrumbs = unit.breadcrumbs &&
                            unit.breadcrumbs.some(crumb => crumb.trim());
      return unit.content.trim() || unit.title.trim() || unit.hashtags.trim() || hasBreadcrumbs;
    });

    if (validUnits.length === 0) {
      alert('Please enter at least one memory');
      return;
    }

    // Convert to memories format
    const memories = validUnits.map(unit => {
      // Process hashtags: split by space, filter empty, ensure # prefix
      const hashtagArray = unit.hashtags.trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(tag => tag.startsWith('#') ? tag : '#' + tag);

      // Filter breadcrumbs to remove empty ones
      const filteredBreadcrumbs = unit.breadcrumbs.filter(crumb => crumb.trim());

      // Determine title: use existing title, or create from breadcrumbs if no title
      let finalTitle = unit.title.trim();
      if (!finalTitle && filteredBreadcrumbs.length > 0) {
        // Convert breadcrumbs to title format with commas, then apply processInputTitle
        const breadcrumbTitle = filteredBreadcrumbs.join(', ');
        finalTitle = processInputTitle(breadcrumbTitle);
      }

      return {
        // Include ID only when editing
        ...(editingMemory && { id: String(editingMemory.id) }),
        content: String(unit.content.trim()),
        title: String(finalTitle),
        hashtags: hashtagArray,
        additionalContext: String(unit.additionalContext.trim()),
        breadcrumbs: filteredBreadcrumbs,
        timestamp: editingMemory ? editingMemory.timestamp : new Date().toISOString(),
        dateTime: editingMemory ? editingMemory.dateTime : new Date().toLocaleDateString()
      };
    });

    try {
      await onSave(memories, !!editingMemory);
      setShowBackupStatus(true);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error saving memory:', error);
      alert('Failed to save memory. Please try again.');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      // ESC to close
      if (e.key === 'Escape') {
        onClose();
      }
      // Ctrl+Enter to save
      else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, memoryUnits]);

  // Click outside to close
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`add-memory-popup ${isOpen ? 'show' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className="add-memory-popup-content">
        <div className="add-memory-header">
          <h3>{editingMemory ? 'Edit Memory' : 'New Memory'}</h3>
          <div className="memory-tabs">
            <button
              className={`memory-tab ${activeTab === 'narrative' ? 'active' : ''}`}
              onClick={() => setActiveTab('narrative')}
            >
              narrative
            </button>
            <button
              className={`memory-tab ${activeTab === 'intuitive' ? 'active' : ''}`}
              onClick={() => setActiveTab('intuitive')}
            >
              intuitive
            </button>
          </div>
          <button className="add-memory-close" onClick={onClose}>&times;</button>
        </div>

        <div className="add-memory-form">
          {showBackupStatus && (
            <div className="backup-status">
              ✅ Backup created
            </div>
          )}

          {/* Memory Units Container */}
          <div id="memoryUnits">
            {memoryUnits.map((unit, index) => (
              <div key={unit.id} className="memory-unit" data-index={index}>
                {activeTab === 'narrative' && (
                  <>
                    {/* Title Field with Generate Button */}
                    <div className="title-input-row">
                      <input
                        type="text"
                        className="memory-title-input"
                        placeholder="title"
                        value={unit.title}
                        onChange={(e) => updateUnit(unit.id, 'title', e.target.value)}
                      />
                      <Tooltip text="generate intelligently">
                        <button
                          type="button"
                          className="btn-generate-title"
                          onClick={() => generateTitle(unit.id)}
                        >
                          ✨
                        </button>
                      </Tooltip>
                    </div>

                    <textarea
                      className="memory-input"
                      placeholder="narrative"
                      rows="4"
                      value={unit.content}
                      onChange={(e) => updateUnit(unit.id, 'content', e.target.value)}
                      autoFocus={index === 0}
                    />
                  </>
                )}

                {activeTab === 'intuitive' && (
                  <div className="breadcrumb-card-container">
                    <div className="breadcrumb-inputs-row">
                      {unit.breadcrumbs.map((crumb, idx) => (
                        <span key={idx} className="breadcrumb-input-wrapper">
                          <input
                            type="text"
                            className="breadcrumb-input"
                            placeholder=""
                            value={crumb}
                            onChange={(e) => updateBreadcrumb(unit.id, idx, e.target.value)}
                          />
                          {idx < unit.breadcrumbs.length - 1 && (
                            <span className="breadcrumb-separator">›</span>
                          )}
                        </span>
                      ))}
                      <button
                        type="button"
                        className="breadcrumb-add-btn"
                        onClick={() => addBreadcrumbField(unit.id)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Toggle buttons for expandable sections */}
                <div className="form-toggle-buttons">
                  <button
                    type="button"
                    className={`btn-toggle-section context-btn ${unit.showContext ? 'active' : ''}`}
                    onClick={() => toggleSection(unit.id, 'showContext')}
                  >
                    Context
                  </button>
                  <button
                    type="button"
                    className={`btn-toggle-section sort-btn ${unit.showSort ? 'active' : ''}`}
                    onClick={() => toggleSection(unit.id, 'showSort')}
                  >
                    Sort
                  </button>
                  {!editingMemory && (
                    <button
                      type="button"
                      className="btn-add-new add-new-btn"
                      onClick={addNewUnit}
                    >
                      Add New
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-toggle-section save-btn"
                    onClick={handleSave}
                  >
                    Save
                  </button>
                </div>

                {/* Additional Context Section */}
                <div
                  className="form-group additional-context-group context-section"
                  style={{ display: unit.showContext ? 'block' : 'none' }}
                >
                  <div className="form-row">
                    <label>Context:</label>
                    <textarea
                      className="additional-context"
                      rows="4"
                      placeholder="why do you think you remembered this for so long?"
                      value={unit.additionalContext}
                      onChange={(e) => updateUnit(unit.id, 'additionalContext', e.target.value)}
                    />
                  </div>
                </div>

                {/* Tags Section */}
                <div
                  className="sort-section"
                  style={{ display: unit.showSort ? 'block' : 'none' }}
                >
                  <div className="form-group">
                    <div className="form-row">
                      <label>Hashtags:</label>
                      <input
                        type="text"
                        className="memory-hashtags-input"
                        placeholder=""
                        value={unit.hashtags}
                        onChange={(e) => updateUnit(unit.id, 'hashtags', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
