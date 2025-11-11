import { useState } from 'react';
import { Link } from 'react-router-dom';
import useLibraries from '../../hooks/useLibraries';
import LibraryCard from './LibraryCard';
import CreateLibraryModal from './CreateLibraryModal';
import EditLibraryModal from './EditLibraryModal';
import './Libraries.css';

export default function Libraries({ memories = [], userId }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState(null);

  const {
    libraries,
    loading,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    getLibraryMemories
  } = useLibraries(userId);

  const handleCreateLibrary = async (libraryData) => {
    await createLibrary(libraryData);
    setShowCreateModal(false);
  };

  const handleEditLibrary = (library) => {
    setEditingLibrary(library);
    setShowEditModal(true);
  };

  const handleUpdateLibrary = async (libraryId, updates) => {
    await updateLibrary(libraryId, updates);
    setShowEditModal(false);
    setEditingLibrary(null);
  };

  const handleDeleteLibrary = async (libraryId) => {
    await deleteLibrary(libraryId);
    setShowEditModal(false);
    setEditingLibrary(null);
  };

  if (loading) {
    return (
      <div className="libraries-container">
        <div className="loading">Loading libraries...</div>
      </div>
    );
  }

  return (
    <div className="libraries-container">
      {/* Header */}
      <div className="libraries-header">
        <h1>Libraries</h1>
        <div className="header-actions">
          <Link to="/archive" className="btn-secondary">
            ← Back to Archive
          </Link>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            + New Library
          </button>
        </div>
      </div>

      {/* Libraries Grid */}
      <div className="libraries-grid">
        {libraries.length === 0 ? (
          <div className="empty-state">
            <p>No libraries yet</p>
            <p className="empty-state-hint">
              Create a library to organize your memories, or use Advanced Search to create search-based libraries
            </p>
          </div>
        ) : (
          libraries.map(library => {
            const memoryCount = getLibraryMemories(library.id, memories).length;
            return (
              <LibraryCard
                key={library.id}
                library={library}
                memoryCount={memoryCount}
                onClick={() => handleEditLibrary(library)}
              />
            );
          })
        )}
      </div>

      {/* Create Modal */}
      <CreateLibraryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateLibrary}
      />

      {/* Edit Modal */}
      <EditLibraryModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingLibrary(null);
        }}
        onSave={handleUpdateLibrary}
        onDelete={handleDeleteLibrary}
        library={editingLibrary}
      />
    </div>
  );
}
