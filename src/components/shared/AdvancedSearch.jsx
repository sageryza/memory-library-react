import { useState } from 'react'
import './AdvancedSearch.css'

export default function AdvancedSearch({ isOpen, memories, onFilter, onSaveAsLibrary }) {
  const [andTerms, setAndTerms] = useState(['', ''])
  const [orTerms, setOrTerms] = useState(['', ''])
  const [excludeTerm, setExcludeTerm] = useState('')
  const [searchInTitles, setSearchInTitles] = useState(true)
  const [searchInContent, setSearchInContent] = useState(true)
  const [searchInHashtags, setSearchInHashtags] = useState(true)
  const [searchInDates, setSearchInDates] = useState(true)

  const updateAndTerm = (index, value) => {
    const newTerms = [...andTerms]
    newTerms[index] = value
    setAndTerms(newTerms)
    applyFilter(newTerms, orTerms, excludeTerm)
  }

  const updateOrTerm = (index, value) => {
    const newTerms = [...orTerms]
    newTerms[index] = value
    setOrTerms(newTerms)
    applyFilter(andTerms, newTerms, excludeTerm)
  }

  const updateExcludeTerm = (value) => {
    setExcludeTerm(value)
    applyFilter(andTerms, orTerms, value)
  }

  const addAndTerm = () => {
    setAndTerms([...andTerms, ''])
  }

  const addOrTerm = () => {
    setOrTerms([...orTerms, ''])
  }

  const applyFilter = (ands, ors, exclude) => {
    // Get non-empty terms
    const andFilters = ands.filter(t => t.trim())
    const orFilters = ors.filter(t => t.trim())
    const excludeFilter = exclude.trim()

    // If no filters, show all
    if (andFilters.length === 0 && orFilters.length === 0 && !excludeFilter) {
      onFilter(null)
      return
    }

    // Filter memories
    let filtered = memories.filter(memory => {
      const searchableText = `${memory.title || ''} ${memory.content || ''}`.toLowerCase()

      // AND logic - all terms must be present
      const andMatch = andFilters.length === 0 ||
        andFilters.every(term => searchableText.includes(term.toLowerCase()))

      // OR logic - at least one term must be present
      const orMatch = orFilters.length === 0 ||
        orFilters.some(term => searchableText.includes(term.toLowerCase()))

      // Exclude logic - term must NOT be present
      const excludeMatch = !excludeFilter ||
        !searchableText.includes(excludeFilter.toLowerCase())

      return andMatch && orMatch && excludeMatch
    })

    onFilter(filtered)
  }

  const handleClear = () => {
    setAndTerms(['', ''])
    setOrTerms(['', ''])
    setExcludeTerm('')
    onFilter(null)
  }

  const handleSaveAsLibrary = async () => {
    // Collect non-empty terms
    const andFilters = andTerms.filter(t => t.trim())
    const orFilters = orTerms.filter(t => t.trim())
    const excludeFilter = excludeTerm.trim()

    // Check if there's any search criteria
    if (andFilters.length === 0 && orFilters.length === 0 && !excludeFilter) {
      alert('Please enter at least one search term')
      return
    }

    // Generate library name from search terms
    let libraryName = ''
    if (andFilters.length > 0) {
      libraryName = andFilters.join(' AND ')
    }
    if (orFilters.length > 0) {
      libraryName += (libraryName ? ' + ' : '') + orFilters.join(' OR ')
    }
    if (excludeFilter) {
      libraryName += (libraryName ? ' - ' : 'Exclude: ') + excludeFilter
    }

    // Prompt for custom name
    const customName = prompt('Library name:', libraryName)
    if (!customName) return // User cancelled

    // Create searchLogic object
    const searchLogic = {
      andTerms: andFilters,
      orTerms: orFilters,
      excludeTerms: excludeFilter,
      searchInTitles,
      searchInContent,
      searchInHashtags,
      searchInDates
    }

    // Call the save handler
    if (onSaveAsLibrary) {
      try {
        await onSaveAsLibrary(customName, searchLogic)
        alert('Library created successfully!')
      } catch (error) {
        console.error('Error saving library:', error)
        alert('Failed to save library')
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="sidebar-advanced-search">
      <div className="visual-boolean-section">
        {/* AND Terms Row */}
        <div className="boolean-row">
          <div className="boolean-terms-container">
            {andTerms.map((term, index) => (
              <span key={`and-${index}`}>
                <input
                  type="text"
                  className="term-input"
                  value={term}
                  onChange={(e) => updateAndTerm(index, e.target.value)}
                  placeholder="term"
                />
                {index < andTerms.length - 1 && (
                  <span className="boolean-connector">AND</span>
                )}
              </span>
            ))}
            <button className="add-term-btn" onClick={addAndTerm}>+</button>
          </div>
        </div>

        {/* OR Terms Row */}
        <div className="boolean-row">
          <div className="boolean-terms-container">
            {orTerms.map((term, index) => (
              <span key={`or-${index}`}>
                <input
                  type="text"
                  className="term-input"
                  value={term}
                  onChange={(e) => updateOrTerm(index, e.target.value)}
                  placeholder="term"
                />
                {index < orTerms.length - 1 && (
                  <span className="boolean-connector">OR</span>
                )}
              </span>
            ))}
            <button className="add-term-btn" onClick={addOrTerm}>+</button>
          </div>
        </div>

        {/* Exclude Terms Row */}
        <div className="boolean-row exclude-row">
          <label className="exclude-label">Exclude:</label>
          <input
            type="text"
            className="term-input exclude-input"
            value={excludeTerm}
            onChange={(e) => updateExcludeTerm(e.target.value)}
            placeholder="excluded term"
          />
        </div>
      </div>

      {/* Search Field Toggles */}
      <div className="search-field-toggles">
        <label>
          <input
            type="checkbox"
            checked={searchInTitles}
            onChange={(e) => setSearchInTitles(e.target.checked)}
          />
          <span>Titles</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={searchInContent}
            onChange={(e) => setSearchInContent(e.target.checked)}
          />
          <span>Content</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={searchInHashtags}
            onChange={(e) => setSearchInHashtags(e.target.checked)}
          />
          <span>Hashtags</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={searchInDates}
            onChange={(e) => setSearchInDates(e.target.checked)}
          />
          <span>Dates</span>
        </label>
      </div>

      <div className="sidebar-search-actions">
        <button className="btn-secondary" onClick={handleClear}>
          Clear
        </button>
        {onSaveAsLibrary && (
          <button className="btn-primary" onClick={handleSaveAsLibrary}>
            Save as Library
          </button>
        )}
      </div>
    </div>
  )
}
