import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import App from './App.jsx'
import { installMapboxTelemetryGuard } from './lib/mapboxTelemetryGuard.js'
import {
  registerFirebaseServiceWorker,
  showFirebaseForegroundNotification,
  subscribeToForegroundMessages,
} from './lib/firebase.js'

installMapboxTelemetryGuard();

// Register service worker immediately to satisfy PWA requirements
registerFirebaseServiceWorker().catch(console.error);
subscribeToForegroundMessages((payload) => {
  showFirebaseForegroundNotification(payload).catch(console.error);
}).catch(console.error);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
