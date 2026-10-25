import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
// Self-hosted font: no request to Google, so visitors' IP addresses stay with us.
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './style.css'

// Wake the API as soon as the page opens: a free host sleeps when idle, and this way it is warm
// by the time the student has signed in. Failures are ignored; real requests report their own errors.
void fetch('/api/health').catch(() => undefined)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></React.StrictMode>,
)
