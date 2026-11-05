import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/geist-mono/400.css'
import App from './App.jsx'
import './styles.css'
import './doctors.css'
import './screens.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
