import { useState, useEffect, useRef } from 'react';
import './MemoryCard.css';
import './Hashtag.css';

/**
 * Base MemoryCard Component (Presentational)
 * Simple display component for memory cards - no complex interaction logic
 * Used by both Archive and Conspiracy Board wrappers
 */
export default function MemoryCard({
  memory,
  isStackedView = false,
  formatTitleForDisplay,
  onHashtagClick  // Optional: callback when hashtag is clicked
}) {
  const titleRef = useRef(null);
  const [fontSize, setFontSize] = useState(14);

  // Function to strip HTML tags from content
  const stripHtml = (html) => {
    if (!html) return '';
    // Remove HTML tags and decode HTML entities
    const stripped = html
      .replace(/<[^>]*>/g, ' ')    // Replace HTML tags with spaces
      .replace(/&nbsp;/g, ' ')      // Replace &nbsp; with spaces
      .replace(/&amp;/g, '&')       // Replace &amp; with &
      .replace(/&lt;/g, '<')        // Replace &lt; with <
      .replace(/&gt;/g, '>')        // Replace &gt; with >
      .replace(/&quot;/g, '"')      // Replace &quot; with "
      .replace(/&#039;/g, "'")      // Replace &#039; with '
      .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
      .trim();
    return stripped;
  };

  // Format title for stacked view: "word — word — word" (fallback for backwards compatibility)
  const formatStackedTitle = (title) => {
    if (!title) return 'Untitled Memory';
    // Split by spaces and join with em dash
    const words = title.trim().split(/\s+/);
    return words.join(' — ');
  };

  // Auto-adjust font size for stacked view to fit in 120x120px
  useEffect(() => {
    if (isStackedView && titleRef.current) {
      const adjustFontSize = () => {
        const element = titleRef.current;
        const container = element.parentElement;

        if (!container) return;

        let currentSize = 14; // Starting font size
        element.style.fontSize = `${currentSize}px`;

        // Reduce font size until text fits
        while (currentSize > 8 && element.scrollHeight > container.clientHeight) {
          currentSize -= 0.5;
          element.style.fontSize = `${currentSize}px`;
        }

        setFontSize(currentSize);
      };

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(adjustFontSize);
    }
  }, [isStackedView, memory.title]);

  // Use formatTitleForDisplay if provided, otherwise fallback to old logic
  let displayTitle;
  if (formatTitleForDisplay) {
    displayTitle = formatTitleForDisplay(memory.title, isStackedView);
  } else {
    displayTitle = isStackedView
      ? formatStackedTitle(memory.title)
      : (memory.title || 'Untitled Memory');
  }

  const hasContent = stripHtml(memory.content);

  return (
    <div className={`memory-card ${isStackedView ? 'stacked-view' : ''}`}>
      <div
        ref={titleRef}
        className={`memory-card-title ${isStackedView ? 'stacked' : ''}`}
        style={isStackedView ? { fontSize: `${fontSize}px` } : undefined}
        dangerouslySetInnerHTML={{ __html: displayTitle }}
      />
      {!isStackedView && hasContent && (
        <div className="memory-card-content">
          {hasContent}
        </div>
      )}
      {!isStackedView && memory.hashtags && memory.hashtags.length > 0 && (
        <div className="hashtag-container">
          {memory.hashtags.map((tag, i) => (
            <span
              key={i}
              className={`hashtag ${onHashtagClick ? 'clickable' : ''}`}
              onClick={onHashtagClick ? (e) => {
                e.stopPropagation();
                onHashtagClick(tag);
              } : undefined}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
