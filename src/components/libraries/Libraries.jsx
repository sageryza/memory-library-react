import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Library, Plus, Pencil, Trash2, LogIn } from 'lucide-react';
import useLibraries from '../../hooks/useLibraries';
import LibraryCard from './LibraryCard';
import CreateLibraryModal from './CreateLibraryModal';
import EditLibraryModal from './EditLibraryModal';
import ContextMenu from '../shared/ContextMenu';
import Modal from '../shared/Modal';
import Header from '../shared/Header';
import './Libraries.css';

export default function Libraries({ memories = [], userId }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const navigate = useNavigate();

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

  const handleContextMenu = (e, library) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      library
    });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm) {
      await deleteLibrary(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const handleToggleLock = async (libraryId, isLocked) => {
    await updateLibrary(libraryId, { isLocked });
  };

  const handleEnterLibrary = (libraryId) => {
    navigate(`/archive?library=${libraryId}`);
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
        centerContent={
          <div className="current-library-header">Libraries</div>
        }
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
                onContextMenu={(e) => handleContextMenu(e, library)}
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

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Enter',
              icon: <LogIn size={14} />,
              onClick: () => handleEnterLibrary(contextMenu.library.id)
            },
            { separator: true },
            {
              label: 'Edit',
              icon: <Pencil size={14} />,
              onClick: () => handleEditLibrary(contextMenu.library)
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} />,
              onClick: () => setDeleteConfirm(contextMenu.library)
            }
          ]}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Library"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </button>
            <button className="btn-danger" onClick={handleConfirmDelete}>
              Delete
            </button>
          </>
        }
      >
        <p>Are you sure you want to delete "{deleteConfirm?.name}"?</p>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '8px' }}>
          This action cannot be undone. Memories in this library will not be deleted.
        </p>
      </Modal>
    </div>
  );
}
