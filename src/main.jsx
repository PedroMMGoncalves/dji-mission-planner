import React from 'react'
import ReactDOM from 'react-dom/client'
// a letra da interface, empacotada com a aplicação (sem rede no campo)
import '@fontsource-variable/inter'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
