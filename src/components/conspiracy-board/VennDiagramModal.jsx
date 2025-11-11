import { useState, useEffect, useRef } from 'react'
import { compareIds } from '../../utils/idUtils'
import './VennDiagram.css'

export default function VennDiagramModal({ connection, memories, isOpen, onClose, onSave, formatTitleForDisplay }) {
  const [insight, setInsight] = useState('')
  const svgRef = useRef(null)

  useEffect(() => {
    if (connection && isOpen) {
      // Load existing insight from connection object
      setInsight(connection.insight || '')
    }
  }, [connection, isOpen])

  useEffect(() => {
    if (isOpen && connection && svgRef.current) {
      const fromMemory = memories.find(m => compareIds(m.id, connection.from))
      const toMemory = memories.find(m => compareIds(m.id, connection.to))

      if (!fromMemory || !toMemory) {
        console.warn('VennDiagramModal: Could not find memories for connection', {
          fromId: connection.from,
          toId: connection.to,
          foundFrom: !!fromMemory,
          foundTo: !!toMemory
        })
      }

      generateVennDiagram(fromMemory, toMemory)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, connection])

  const generateVennDiagram = (memory1, memory2) => {
    if (!svgRef.current) return

    // Clear existing diagram
    svgRef.current.innerHTML = ''

    // Create two circles - start far apart
    const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle1.setAttribute('cx', '100')
    circle1.setAttribute('cy', '200')
    circle1.setAttribute('r', '120')
    circle1.classList.add('venn-circle')

    const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle2.setAttribute('cx', '500')
    circle2.setAttribute('cy', '200')
    circle2.setAttribute('r', '120')
    circle2.classList.add('venn-circle')

    // Memory titles - start with the circles
    const formattedTitle1 = formatTitleForDisplay ? formatTitleForDisplay(memory1?.title || 'Memory 1') : (memory1?.title || 'Memory 1')
    const formattedTitle2 = formatTitleForDisplay ? formatTitleForDisplay(memory2?.title || 'Memory 2') : (memory2?.title || 'Memory 2')
    const title1 = createMultiLineText(formatTitleLines(formattedTitle1), 100, 200)
    const title2 = createMultiLineText(formatTitleLines(formattedTitle2), 500, 200)

    // Ensure tspans start at the initial circle positions
    const tspans1Initial = title1.querySelectorAll('tspan')
    const tspans2Initial = title2.querySelectorAll('tspan')
    tspans1Initial.forEach(tspan => tspan.setAttribute('x', '100'))
    tspans2Initial.forEach(tspan => tspan.setAttribute('x', '500'))

    // Add circles and titles to diagram
    svgRef.current.appendChild(circle1)
    svgRef.current.appendChild(circle2)
    svgRef.current.appendChild(title1)
    svgRef.current.appendChild(title2)

    // Animate using JavaScript for reliable cross-browser animation
    setTimeout(() => {
      const duration = 1500 // Animation duration in ms
      const startTime = performance.now()
      const startCircle1 = 100
      const startCircle2 = 500
      const endCircle1 = 200
      const endCircle2 = 400

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Easing function (ease-in-out)
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2

        // Interpolate positions
        const circle1X = startCircle1 + (endCircle1 - startCircle1) * eased
        const circle2X = startCircle2 + (endCircle2 - startCircle2) * eased

        // Update circles
        circle1.setAttribute('cx', circle1X.toString())
        circle2.setAttribute('cx', circle2X.toString())

        // Update text and tspans
        title1.setAttribute('x', circle1X.toString())
        title2.setAttribute('x', circle2X.toString())

        const tspans1 = title1.querySelectorAll('tspan')
        const tspans2 = title2.querySelectorAll('tspan')

        tspans1.forEach(tspan => tspan.setAttribute('x', circle1X.toString()))
        tspans2.forEach(tspan => tspan.setAttribute('x', circle2X.toString()))

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Animation complete, add intersection
          if (!svgRef.current) return

          const intersection = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          const d = generateIntersectionPath(200, 200, 120, 400, 200, 120)
          intersection.setAttribute('d', d)
          intersection.classList.add('venn-intersection')
          intersection.style.opacity = '0'
          svgRef.current.appendChild(intersection)

          // Fade in intersection
          setTimeout(() => {
            intersection.style.opacity = '1'
          }, 50)
        }
      }

      requestAnimationFrame(animate)
    }, 200) // Small delay before starting animation
  }

  const formatTitleLines = (title) => {
    if (!title) return 'Untitled'
    // Convert <br> tags to newlines, then convert bullets to newlines
    return title.replace(/<br>/g, '\n').replace(/\s*•\s*/g, '\n')
  }

  const createMultiLineText = (text, x, y) => {
    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    textElement.setAttribute('x', x)
    textElement.setAttribute('y', y)
    textElement.classList.add('venn-title')
    textElement.setAttribute('text-anchor', 'middle')

    const lines = text.split('\n').filter(line => line.trim())
    const lineHeight = 16
    const totalHeight = lines.length * lineHeight
    const startY = y - (totalHeight / 2) + (lineHeight / 2)

    lines.forEach((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tspan.setAttribute('x', x)
      tspan.setAttribute('y', startY + (index * lineHeight))
      tspan.textContent = line
      textElement.appendChild(tspan)
    })

    return textElement
  }

  const generateIntersectionPath = (x1, y1, r1, x2, y2, r2) => {
    // Calculate intersection points of two circles
    const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (d >= r1 + r2) return '' // No intersection

    const a = (r1 ** 2 - r2 ** 2 + d ** 2) / (2 * d)
    const h = Math.sqrt(r1 ** 2 - a ** 2)

    const px = x1 + a * (x2 - x1) / d
    const py = y1 + a * (y2 - y1) / d

    const ix1 = px + h * (y2 - y1) / d
    const iy1 = py - h * (x2 - x1) / d
    const ix2 = px - h * (y2 - y1) / d
    const iy2 = py + h * (x2 - x1) / d

    // Create lens-shaped intersection path
    return `M ${ix1} ${iy1} A ${r1} ${r1} 0 0 1 ${ix2} ${iy2} A ${r2} ${r2} 0 0 1 ${ix1} ${iy1} Z`
  }

  if (!isOpen || !connection) return null

  const handleSave = () => {
    // Pass insight to parent to save in Firebase
    onSave(connection, insight.trim())
    onClose()
  }

  const handleClear = () => {
    setInsight('')
  }

  return (
    <div className={`venn-popup ${isOpen ? 'show' : ''}`} onClick={onClose}>
      <div className="venn-popup-content" onClick={e => e.stopPropagation()}>
        <div className="venn-header">
          <h3>Memory Connection Analysis</h3>
          <button className="venn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="venn-diagram-container">
          <svg ref={svgRef} className="venn-diagram" viewBox="50 75 500 250">
            {/* SVG content will be dynamically generated */}
          </svg>
        </div>

        <div className="venn-analysis-text">
          <div className="manual-input-section">
            <label htmlFor="connectionInsight">What do these memories have in common?</label>
            <textarea
              id="connectionInsight"
              placeholder="Enter your insight about the connection between these memories..."
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              rows="3"
            />
            <div className="manual-input-actions">
              <button className="btn-secondary" onClick={handleClear}>Clear</button>
              <button className="btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}