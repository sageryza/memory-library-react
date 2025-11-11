/**
 * Utility functions for parsing inline content to extract titles and hashtags
 */

/**
 * Parses raw content to extract title and hashtags
 * @param {string} rawContent - Raw text from textarea
 * @returns {object} { title, content, hashtags }
 *
 * Example input:
 * title: "Assassination Event"
 * Franz Ferdinand was killed in 1914. #WWI #history
 * This started the war.
 *
 * Example output:
 * {
 *   title: "Assassination Event",
 *   content: "Franz Ferdinand was killed in 1914.\nThis started the war.",
 *   hashtags: ["#WWI", "#history"]
 * }
 */
export function parseMemoryContent(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return {
      title: '',
      content: '',
      hashtags: []
    };
  }

  let content = rawContent;
  let title = '';
  let hashtags = [];

  // Extract title: "..." anywhere in content
  // Regex: title:\s*"([^"]+)"
  const titleRegex = /title:\s*"([^"]+)"/i;
  const titleMatch = content.match(titleRegex);

  if (titleMatch) {
    title = titleMatch[1].trim();
    // Remove the entire title: "..." line from content
    content = content.replace(titleRegex, '').trim();
  }

  // Extract hashtags (any word starting with #)
  // Regex: #[\w]+
  const hashtagRegex = /#[\w]+/g;
  const hashtagMatches = content.match(hashtagRegex);

  if (hashtagMatches) {
    // Remove duplicates
    hashtags = [...new Set(hashtagMatches)];

    // Remove all hashtags from content
    content = content.replace(hashtagRegex, '').trim();
  }

  // Clean up any extra whitespace/newlines
  content = content.replace(/\n\s*\n/g, '\n').trim();

  return {
    title,
    content,
    hashtags
  };
}

/**
 * Checks if a hashtag is a hidden playground hashtag
 * @param {string} hashtag - The hashtag to check
 * @returns {boolean} true if it's a hidden playground hashtag
 */
export function isHiddenPlaygroundHashtag(hashtag) {
  return hashtag && hashtag.startsWith('#pg-');
}

/**
 * Filters out hidden playground hashtags from an array
 * @param {array} hashtags - Array of hashtags
 * @returns {array} Filtered array without hidden hashtags
 */
export function filterVisibleHashtags(hashtags) {
  if (!Array.isArray(hashtags)) {
    return [];
  }
  return hashtags.filter(tag => !isHiddenPlaygroundHashtag(tag));
}

/**
 * Generates a unique playground hashtag ID
 * @param {string} playgroundId - The playground ID
 * @returns {string} The hidden hashtag (e.g., "#pg-abc123")
 */
export function generatePlaygroundHashtag(playgroundId) {
  return `#pg-${playgroundId}`;
}
