import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      title="You're offline — changes will sync when you reconnect"
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        color: '#666',
        zIndex: 10001,
        opacity: 0.6,
      }}
    >
      <WifiOff size={18} />
    </div>
  );
}
