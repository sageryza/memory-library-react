import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import Modal from '../shared/Modal';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Library"
      footer={
        <button className="btn-icon" onClick={handleSave} title="Create Library">
          <Save size={20} />
        </button>
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
