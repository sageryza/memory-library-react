import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Plus } from 'lucide-react';
import useLibraries from '../../hooks/useLibraries';
import LibraryCard from './LibraryCard';
import CreateLibraryModal from './CreateLibraryModal';
import EditLibraryModal from './EditLibraryModal';
import Header from '../shared/Header';
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

  const handleToggleLock = async (libraryId, isLocked) => {
    await updateLibrary(libraryId, { isLocked });
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
      <Header
        title="Libraries"
        rightContent={
          <>
            <Link to="/archive" className="btn-icon" title="Back to Archive">
              <Library size={16} />
            </Link>
            <button className="btn-icon" onClick={() => setShowCreateModal(true)} title="New Library">
              <Plus size={16} />
            </button>
          </>
        }
      />

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
                onToggleLock={handleToggleLock}
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
