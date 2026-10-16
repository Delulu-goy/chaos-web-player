import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/source-code-pro/latin-400.css' // Regular (subset latin)
import '@fontsource/source-code-pro/latin-700.css' // Bold (subset latin)
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)