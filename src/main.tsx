import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

const korzen = document.getElementById('root')
if (!korzen) throw new Error('Brak elementu #root w dokumencie')

createRoot(korzen).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker – offline dla wersji PWA (iPhone i przeglądarka).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const baza = import.meta.env.BASE_URL ?? '/'
    void navigator.serviceWorker.register(`${baza}sw.js`).catch((e) => {
      console.warn('Nie udało się zarejestrować service workera:', e)
    })
  })
}
