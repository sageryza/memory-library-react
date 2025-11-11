import { useState, useEffect } from 'react';

export default function EditLibraryModal({ isOpen, onClose, onSave, onDelete, library }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Populate form when library changes
  useEffect(() => {
    if (isOpen && library) {
      setName(library.name || '');
      setDescription(library.description || '');
    }
  }, [isOpen, library]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a library name');
      return;
    }

    try {
      await onSave(library.id, {
        name: name.trim(),
        description: description.trim()
      });
      onClose();
    } catch (error) {
      console.error('Error updating library:', error);
      alert('Failed to update library');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${library.name}"?`)) {
      return;
    }

    try {
      await onDelete(library.id);
      onClose();
    } catch (error) {
      console.error('Error deleting library:', error);
      alert('Failed to delete library');
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

  if (!isOpen || !library) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="library-modal">
        <div className="modal-header">
          <h2>Edit Library</h2>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-content">
          <div className="form-group">
            <label>Library Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="3"
            />
          </div>

          <div className="form-actions">
            <button className="btn-icon-delete" onClick={handleDelete} title="Delete Library">
              <svg width="16" height="16" fill="white" viewBox="0 0 16 16">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
            <div className="form-actions-right">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
