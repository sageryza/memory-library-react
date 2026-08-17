# Source

repo: sageryza/memory-library-react
branch: main
path: src

## Last sync
date: 2026-08-16T07:26:40Z

### Updated in this project
- Read the XI app source (components, engine, decks, styles) to ground a redesign
- Recreated the current Today, Versus, Library and Stories screens
- Read Archive.css, MemoryCard.css, ConspiracyBoard.css, Connections.css to redesign the library and pin board

## Screen map
| Screen | Repo files |
| --- | --- |
| Today / Card of the Day | src/components/xi/xiMarkup.js, src/xi/xiEngine.js, src/components/xi/XiApp.css, src/components/xi/XiApp.jsx |
| Versus | src/components/xi/XiVersus.jsx, src/components/xi/XiVersus.css, src/components/xi/XiBoardGrid.jsx |
| Library (in-XI) | src/xi/xiEngine.js (renderLibrary), src/components/xi/XiApp.css |
| Stories feed | src/components/xi/XiStories.jsx, src/components/xi/XiStories.css |
| Nav bar | src/components/xi/XiNavBar.jsx, src/components/xi/XiNavBar.css |
| Deck data | src/xi/decks.js, src/data/xi/deckTrial.json, src/xi/renderTextCard.js |
| Archive (redesign 3a) | src/components/archive/styles/Archive.css, src/components/archive/styles/MemoryCard.css |
| Conspiracy Board (redesign 3b) | src/components/conspiracy-board/ConspiracyBoard.css, src/components/conspiracy-board/Connections.css |
