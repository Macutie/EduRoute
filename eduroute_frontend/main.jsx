import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerFirebaseServiceWorker } from './lib/firebase.js'

// Register service worker immediately to satisfy PWA requirements
registerFirebaseServiceWorker().catch(console.error);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
