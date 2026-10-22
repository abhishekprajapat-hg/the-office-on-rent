import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { registerServiceWorker } from './services/pushService'
import { applyStoredThemeToDocument } from './utils/themePreferences'
import './index.css'
// CRM Web Glass theme - loaded after index.css so it wins.
import './styles/glass.css'
import { initGlassMotion } from './utils/glassMotion'

// Before the first render, so a dark or colour-themed user does not get a
// flash of the default light page while React boots.
applyStoredThemeToDocument(window.location.pathname)

// Sliding highlight + content fade on every tab/segment switch in the CRM.
initGlassMotion()

/*
 * Registered up front, not when someone opens the notifications card: the
 * worker has to already be installed for a push to be delivered while the app
 * is closed, which is the only time a notification matters.
 */
registerServiceWorker()

const shouldUseStrictMode =
  import.meta.env.VITE_REACT_STRICT_MODE === 'true'
const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  shouldUseStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
)
