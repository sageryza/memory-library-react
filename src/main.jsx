import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Deferred service-worker registration (see vite.config.js): wait until the
// page has loaded and the network has gone quiet before installing the
// offline copy, so first visits on slow connections aren't slowed by it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(() => { navigator.serviceWorker.register('/sw.js'); }, 5000);
  });
}
