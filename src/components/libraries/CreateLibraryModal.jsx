import { useState, useEffect } from 'react';

export default function CreateLibraryModal({ isOpen, onClose, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a library name');
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        manualMemoryIds: [],
        searchLogic: null,
        isLocked: false
      });
      onClose();
    } catch (error) {
      console.error('Error creating library:', error);
      alert('Failed to create library');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, name, description]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="library-modal">
        <div className="modal-header">
          <h2>Create New Library</h2>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-content">
          <div className="form-group">
            <label>Library Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter library name..."
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="3"
              placeholder="What kind of memories belong in this library?"
            />
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Create Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
