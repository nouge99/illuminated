import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.addEventListener('load', () => {
  navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log("Service worker registered", reg))
    .catch(err => console.error("Service worker failed", err));
});

createRoot(document.getElementById('root')).render(
    <App />
);
