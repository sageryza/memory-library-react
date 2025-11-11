import { useState } from 'react'
import { useSavedBoards } from '../../hooks/useSavedBoards'
import { useAuth } from '../../hooks/useAuth'

export default function BoardManager({ currentBoard, onLoadBoard, onSaveBoard, onDeleteBoard }) {
  const { user } = useAuth()
  const { savedBoards, saveBoard, loadBoard, deleteBoard } = useSavedBoards(user?.uid)
  const [boardName, setBoardName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const handleSave = async () => {
    if (boardName.trim()) {
      try {
        await saveBoard(boardName.trim(), currentBoard)
        onSaveBoard(boardName.trim())
        setBoardName('')
        setShowSaveDialog(false)
      } catch (e) {
        console.error('Failed to save board:', e)
        alert('Failed to save board. Please try again.')
      }
    }
  }

  const handleLoad = (boardId) => {
    const boardData = loadBoard(boardId)
    if (boardData) {
      onLoadBoard(boardData)
    }
  }

  const handleDelete = async (boardId, boardName) => {
    if (confirm(`Delete board "${boardName}"?`)) {
      try {
        await deleteBoard(boardId)
        onDeleteBoard(boardId)
      } catch (e) {
        console.error('Failed to delete board:', e)
        alert('Failed to delete board. Please try again.')
      }
    }
  }

  return (
    <div className="board-manager">
      <div className="board-actions">
        <button
          className="btn btn-save-board"
          onClick={() => setShowSaveDialog(true)}
        >
          Save Board
        </button>
      </div>

      {showSaveDialog && (
        <div className="save-dialog">
          <input
            type="text"
            placeholder="Board name..."
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
        </div>
      )}

      {savedBoards.length > 0 && (
        <div className="saved-boards">
          <h3>Saved Boards</h3>
          <div className="boards-list">
            {savedBoards.map(board => (
              <div key={board.id} className="board-item">
                <span onClick={() => handleLoad(board.id)}>{board.name}</span>
                <button
                  className="delete-board"
                  onClick={() => handleDelete(board.id, board.name)}
                  title="Delete board"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}