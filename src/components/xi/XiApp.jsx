import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, LayoutGrid, Heart, History, Library } from 'lucide-react';
import useXiSettings from '../../hooks/useXiSettings';
import { buildXiMemoryDoc } from '../../xi/xiMemory';
import CardOfTheDay from './CardOfTheDay';
import Board from './Board';
import Past from './Past';
import Curate from './Curate';
import './XiApp.css';

// XI — its own full-screen app inside the library, with its own five-icon
// bottom nav. The Library icon navigates to the existing archive (the shared
// memory view), which doubles as the way back into the rest of the library.
export default function XiApp({ memories = [], memoriesLoading, addMemory, userId }) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState('today'); // today | board | curate | past
  const { settings, loading: settingsLoading, setDailyPair, pushPastPair, setBoardLayout, toggleExcluded, recordMiss } =
    useXiSettings(userId);

  // Persist an XI memory into the shared memories collection.
  const handleSaveMemory = useCallback(
    async ({ text, event, twist, mode }) => {
      const docData = buildXiMemoryDoc({ text, event, twist, mode });
      return addMemory(docData);
    },
    [addMemory]
  );

  const updateSettings = { setDailyPair, pushPastPair, setBoardLayout };

  const navItems = [
    { key: 'today', label: 'Today', icon: CalendarDays },
    { key: 'board', label: 'Board', icon: LayoutGrid },
    { key: 'curate', label: 'Curate', icon: Heart },
    { key: 'past', label: 'Past', icon: History },
    { key: 'library', label: 'Library', icon: Library, action: () => navigate('/archive') },
  ];

  const loading = memoriesLoading || settingsLoading;

  return (
    <div className="xi-app">
      <div className="xi-app-body">
        {loading ? (
          <div className="xi-loading">Loading…</div>
        ) : (
          <>
            {screen === 'today' && (
              <CardOfTheDay
                memories={memories}
                settings={settings}
                onSaveMemory={handleSaveMemory}
                onUpdateSettings={updateSettings}
                onMiss={recordMiss}
              />
            )}
            {screen === 'board' && (
              <Board
                memories={memories}
                settings={settings}
                onSaveMemory={handleSaveMemory}
                onUpdateSettings={updateSettings}
              />
            )}
            {screen === 'curate' && (
              <Curate settings={settings} onToggleExcluded={toggleExcluded} />
            )}
            {screen === 'past' && (
              <Past memories={memories} settings={settings} onSaveMemory={handleSaveMemory} />
            )}
          </>
        )}
      </div>

      <nav className="xi-bottom-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = !item.action && screen === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`xi-nav-btn ${active ? 'is-active' : ''}`}
              onClick={() => (item.action ? item.action() : setScreen(item.key))}
            >
              <Icon size={22} />
              <span className="xi-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
