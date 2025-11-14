import React, { useState } from 'react';
import { usePublicBoards } from '../../hooks/usePublicBoards';
import { useAuth } from '../../hooks/useAuth';
import './PublicBoardsDiscovery.css';

const PublicBoardsDiscovery = ({ onSelectBoard }) => {
  const { publicBoards, loading, error, createPublicBoard } = usePublicBoards();
  const { user } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    if (!newBoardTitle.trim()) return;

    setCreating(true);
    try {
      const boardId = await createPublicBoard(newBoardTitle, user?.uid);
      setNewBoardTitle('');
      setShowCreateForm(false);
      // Navigate to the new board
      onSelectBoard(boardId);
    } catch (error) {
      console.error('Error creating board:', error);
      alert('Failed to create board');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="public-boards-discovery">
        <div className="loading">Loading collective boards...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-boards-discovery">
        <div className="error">Error loading boards: {error}</div>
      </div>
    );
  }

  return (
    <div className="public-boards-discovery">
      <div className="discovery-header">
        <h1>Collective Memory Boards</h1>
        <p className="subtitle">Explore shared consciousness maps where memories interconnect</p>
      </div>

      <div className="discovery-actions">
        {!showCreateForm ? (
          <button
            className="create-board-btn"
            onClick={() => setShowCreateForm(true)}
          >
            + Create New Board
          </button>
        ) : (
          <form className="create-board-form" onSubmit={handleCreateBoard}>
            <input
              type="text"
              placeholder="Board title..."
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              disabled={creating}
              autoFocus
              maxLength={100}
            />
            <div className="form-actions">
              <button type="submit" disabled={creating || !newBoardTitle.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewBoardTitle('');
                }}
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="boards-grid">
        {publicBoards.length === 0 ? (
          <div className="no-boards">
            <p>No collective boards yet</p>
            <p className="hint">Be the first to create a shared memory space</p>
          </div>
        ) : (
          publicBoards.map(board => (
            <div
              key={board.id}
              className="board-card"
              onClick={() => onSelectBoard(board.id)}
            >
              <h3>{board.title}</h3>
              <div className="board-stats">
                <span>{board.memoryCount || 0} memories</span>
                <span className="separator">•</span>
                <span>{board.connectionCount || 0} connections</span>
              </div>
              {board.createdAt && (
                <div className="board-date">
                  Created {new Date(board.createdAt.seconds * 1000).toLocaleDateString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PublicBoardsDiscovery;