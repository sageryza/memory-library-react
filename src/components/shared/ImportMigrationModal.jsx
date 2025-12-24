import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import './ImportMigrationModal.css'

export default function ImportMigrationModal({ onClose, userId, onImportComplete }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.json')) {
      setError('Please select a JSON file')
      return
    }

    setFile(selectedFile)
    setError(null)

    // Read and preview the file
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)

        // Validate migration file format
        if (!data.memories || !Array.isArray(data.memories)) {
          setError('Invalid migration file: missing memories array')
          setFile(null)
          return
        }

        setPreview({
          memoriesCount: data.memories.length,
          librariesCount: data.libraries?.length || 0,
          exportedAt: data.exportedAt,
          source: data.source || 'unknown',
          data: data
        })
      } catch (err) {
        setError('Failed to parse JSON file: ' + err.message)
        setFile(null)
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleImport = async () => {
    if (!preview?.data || !userId) return

    setImporting(true)
    setError(null)

    const { memories, libraries } = preview.data
    const idMap = new Map() // Maps old IDs to new Firebase IDs

    try {
      // Phase 1: Import memories
      setProgress({ current: 0, total: memories.length, phase: 'Importing memories...' })

      const memoriesRef = collection(db, 'users', userId, 'memories')

      for (let i = 0; i < memories.length; i++) {
        const memory = memories[i]
        const oldId = memory.id

        // Prepare memory data for Firebase
        const memoryData = {
          title: memory.title || '',
          content: memory.content || '',
          hashtags: memory.hashtags || [],
          additionalContext: memory.additionalContext || '',
          date: memory.date || null,
          createdAt: memory.createdAt ? new Date(memory.createdAt) : serverTimestamp(),
          updatedAt: serverTimestamp(),
          migratedFrom: 'html-version',
          migratedAt: serverTimestamp()
        }

        // Add to Firebase and store the new ID
        const docRef = await addDoc(memoriesRef, memoryData)
        idMap.set(oldId, docRef.id)

        setProgress({ current: i + 1, total: memories.length, phase: 'Importing memories...' })
      }

      // Phase 2: Import libraries with updated memory IDs
      if (libraries && libraries.length > 0) {
        setProgress({ current: 0, total: libraries.length, phase: 'Importing libraries...' })

        const librariesRef = collection(db, 'users', userId, 'libraries')

        for (let i = 0; i < libraries.length; i++) {
          const library = libraries[i]

          // Map old memory IDs to new Firebase IDs
          const updatedMemoryIds = (library.manualMemoryIds || [])
            .map(oldId => idMap.get(oldId))
            .filter(id => id !== undefined) // Remove any IDs that didn't map

          const libraryData = {
            name: library.name || 'Untitled Library',
            description: library.description || '',
            color: library.color || null,
            isLocked: library.isLocked || false,
            isCore: library.isCore || false,
            manualMemoryIds: updatedMemoryIds,
            searchLogic: library.searchLogic || null,
            createdAt: serverTimestamp(),
            migratedFrom: 'html-version',
            migratedAt: serverTimestamp()
          }

          await addDoc(librariesRef, libraryData)
          setProgress({ current: i + 1, total: libraries.length, phase: 'Importing libraries...' })
        }
      }

      // Success!
      setResult({
        success: true,
        memoriesImported: memories.length,
        librariesImported: libraries?.length || 0
      })

      if (onImportComplete) {
        onImportComplete()
      }

    } catch (err) {
      console.error('Import error:', err)
      setError('Import failed: ' + err.message)
      setResult({ success: false })
    } finally {
      setImporting(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      // Simulate file input change
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(droppedFile)
      fileInputRef.current.files = dataTransfer.files
      handleFileSelect({ target: { files: [droppedFile] } })
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="import-migration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import from Old Version</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          {!result ? (
            <>
              {/* File Upload Area */}
              <div
                className={`file-drop-zone ${file ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {file ? (
                  <div className="file-selected">
                    <FileText size={32} />
                    <span className="file-name">{file.name}</span>
                  </div>
                ) : (
                  <div className="drop-prompt">
                    <Upload size={32} />
                    <p>Drop migration file here or click to browse</p>
                    <span className="file-hint">JSON file from the old Memory Library</span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="error-message">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* Preview */}
              {preview && (
                <div className="import-preview">
                  <h3>Ready to Import</h3>
                  <div className="preview-stats">
                    <div className="stat">
                      <span className="stat-value">{preview.memoriesCount}</span>
                      <span className="stat-label">Memories</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{preview.librariesCount}</span>
                      <span className="stat-label">Libraries</span>
                    </div>
                  </div>
                  {preview.exportedAt && (
                    <p className="export-date">
                      Exported on {new Date(preview.exportedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Progress */}
              {importing && (
                <div className="import-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <p className="progress-text">
                    {progress.phase} ({progress.current}/{progress.total})
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={!preview || importing || !userId}
                >
                  {importing ? 'Importing...' : 'Import Data'}
                </button>
              </div>

              {!userId && (
                <p className="sign-in-notice">
                  Please sign in to import data to your account.
                </p>
              )}
            </>
          ) : (
            /* Result Screen */
            <div className="import-result">
              {result.success ? (
                <>
                  <CheckCircle size={48} className="success-icon" />
                  <h3>Import Complete!</h3>
                  <p>Successfully imported:</p>
                  <ul>
                    <li>{result.memoriesImported} memories</li>
                    <li>{result.librariesImported} libraries</li>
                  </ul>
                  <p className="result-note">
                    Your memories are now in the new version with all library associations preserved.
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle size={48} className="error-icon" />
                  <h3>Import Failed</h3>
                  <p>{error}</p>
                </>
              )}
              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
