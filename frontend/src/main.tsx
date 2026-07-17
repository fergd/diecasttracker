import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import '@ionic/react/css/core.css'
import './index.css'
import './styles/ionic-theme.css'
import App from './App.tsx'

// Trial: forcing iOS mode since the app's existing design system (see
// tokens.css) is already built to an iOS-style scale, not Material.
setupIonicReact({ mode: 'ios' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
