import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Account, SignIn, SignUp } from './account'
import App from './App'
import './index.css'

// ponytail: three extra pages don't need a router. Vite serves index.html for every path, so the path picks the page.
const pages: Record<string, () => React.JSX.Element> = { '/signin': SignIn, '/signup': SignUp, '/account': Account }
const Page = pages[location.pathname] ?? App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
