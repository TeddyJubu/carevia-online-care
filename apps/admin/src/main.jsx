import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/geist-mono/400.css'
import App from './App.jsx'
import './styles.css'
import './doctors.css'
import './screens.css'
// The homepage's orange hover rim, one module for the site, the patient app and this one.
import { rim } from '../../../src/scripts/specular-rim.js'

rim('.button, .nav-pill')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
