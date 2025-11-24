import { useState, useEffect } from 'react';
import { Save, Trash2 } from 'lucide-react';
import Modal from '../shared/Modal';

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

  // Handle Ctrl+Enter to save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, name, description]);

  if (!library) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Library"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button className="btn-icon btn-danger" onClick={handleDelete} title="Delete Library">
            <Trash2 size={20} />
          </button>
          <button className="btn-icon" onClick={handleSave} title="Save">
            <Save size={20} />
          </button>
        </div>
      }
    >
      <div className="form-group">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Title"
          autoFocus
        />
      </div>

      <div className="form-group">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows="3"
          placeholder="Description"
        />
      </div>

    </Modal>
  );
}
