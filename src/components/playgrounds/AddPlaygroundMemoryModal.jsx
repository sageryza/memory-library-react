import React, { useState, useEffect } from 'react';
import { parseMemoryContent } from '../../utils/inlineParsingUtils';

export default function AddPlaygroundMemoryModal({
  isOpen,
  onClose,
  onSave,
  centralHashtag,
  editingMemory = null
}) {
  const [rawContent, setRawContent] = useState('');

  // Reset form when opening/closing or editing different memory
  useEffect(() => {
    if (isOpen) {
      if (editingMemory) {
        // Reconstruct the raw content from memory
        let reconstructed = '';
        if (editingMemory.title) {
          reconstructed += `title: "${editingMemory.title}"\n`;
        }
        reconstructed += editingMemory.content || '';
        if (editingMemory.hashtags && editingMemory.hashtags.length > 0) {
          // Filter out central hashtag and hidden hashtags when editing
          const userHashtags = editingMemory.hashtags.filter(
            tag => tag !== centralHashtag && !tag.startsWith('#pg-')
          );
          if (userHashtags.length > 0) {
            reconstructed += ' ' + userHashtags.join(' ');
          }
        }
        setRawContent(reconstructed);
      } else {
        setRawContent('');
      }
    }
  }, [isOpen, editingMemory, centralHashtag]);

  const handleSave = () => {
    if (!rawContent.trim()) {
      return;
    }

    // Parse content to extract title and hashtags
    const { title, content, hashtags } = parseMemoryContent(rawContent);

    // Create memory data
    const memoryData = {
      title,
      content,
      hashtags,
      timestamp: editingMemory?.timestamp || new Date().toISOString(),
      dateTime: editingMemory?.dateTime || new Date().toLocaleDateString()
    };

    // If editing, include the ID
    if (editingMemory) {
      memoryData.id = editingMemory.id;
    }

    onSave(memoryData);
    setRawContent('');
    onClose();
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
  }, [isOpen, rawContent]);

  // Click outside to close
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="add-playground-memory-overlay"
      onClick={handleOverlayClick}
    >
      <div className="add-playground-memory-modal">
        <div className="modal-header">
          <h3>{editingMemory ? 'Edit Memory' : 'Add Memory'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            rows={10}
            autoFocus
          />

          {centralHashtag && (
            <div className="central-hashtag-notice">
              {centralHashtag} will be added
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-save" onClick={handleSave}>
            Save
          </button>
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
