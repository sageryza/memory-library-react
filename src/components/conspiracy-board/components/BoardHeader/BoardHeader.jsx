import React from 'react'
import Header from '../../../shared/Header'
import PagesDropdown from './PagesDropdown'
import ToolsDropdown from './ToolsDropdown'
import ViewDropdown from './ViewDropdown'
import BoardDropdown from './BoardDropdown'
import AccountDropdown from './AccountDropdown'
import { AddMemoryIcon } from '../../../icons'

export default function BoardHeader({
  activeBoardName,
  selectedPin,
  openDropdown,
  setOpenDropdown,
  isConstellationMode,
  isSimplified,
  toggleSimplify,
  showOpacityFading,
  setShowOpacityFading,
  showAllInsights,
  setShowAllInsights,
  stringsInFront,
  setStringsInFront,
  handleResetView,
  handleAddMemory,
  handleStartPlacingPin,
  scatterMemories,
  handleOpenPlayground,
  performUndo,
  performRedo,
  canUndo,
  canRedo,
  handleNewBoard,
  setShowSaveBoardModal,
  setShowLoadBoardModal,
  user,
  profile,
  handleSignOut,
  setShowSettingsModal
}) {
  return (
    <Header
      title="Conspiracy"
      centerContent={
        <h2 className="board-name-display">
          {activeBoardName?.startsWith('Untitled Board') ? 'Untitled' : (activeBoardName || 'Untitled')}
        </h2>
      }
      rightContent={
        <>
          <PagesDropdown
            selectedPin={selectedPin}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
          />

          <ToolsDropdown
            selectedPin={selectedPin}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            isConstellationMode={isConstellationMode}
            handleAddMemory={handleAddMemory}
            handleStartPlacingPin={handleStartPlacingPin}
            scatterMemories={scatterMemories}
            handleOpenPlayground={handleOpenPlayground}
            performUndo={performUndo}
            performRedo={performRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />

          <ViewDropdown
            selectedPin={selectedPin}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            isSimplified={isSimplified}
            toggleSimplify={toggleSimplify}
            showOpacityFading={showOpacityFading}
            setShowOpacityFading={setShowOpacityFading}
            showAllInsights={showAllInsights}
            setShowAllInsights={setShowAllInsights}
            stringsInFront={stringsInFront}
            setStringsInFront={setStringsInFront}
            handleResetView={handleResetView}
          />

          <BoardDropdown
            selectedPin={selectedPin}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            handleNewBoard={handleNewBoard}
            setShowSaveBoardModal={setShowSaveBoardModal}
            setShowLoadBoardModal={setShowLoadBoardModal}
          />

          <AccountDropdown
            selectedPin={selectedPin}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            user={user}
            profile={profile}
            handleSignOut={handleSignOut}
            setShowSettingsModal={setShowSettingsModal}
          />

          <button
            className="add-memory-btn-icon"
            onClick={handleAddMemory}
            disabled={isConstellationMode}
            title="Add Memory (Shift+N)"
          >
            <AddMemoryIcon size={20} />
          </button>
        </>
      }
    />
  )
}