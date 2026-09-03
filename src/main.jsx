import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initErrorReporting } from '@/lib/errorReporting'
import { getBackgroundTheme, applyBackgroundTheme } from '@/lib/backgroundThemes'

initErrorReporting()

// Dark mode + the chosen accent theme (gold by default) used to only get
// applied inside Layout's own mount effect — which never runs on routes
// that sit outside Layout, like Login/Register/Forgot-Password. Those pages
// fell back to the plain stylesheet default (a flat blue), so a brand new
// visitor's very first screen didn't match the rest of the app at all.
// Applying it once here, before anything renders, covers every route.
const storedTheme = localStorage.getItem('theme');
const isDark = storedTheme ? storedTheme === 'dark' : true;
document.documentElement.classList.toggle('dark', isDark);
applyBackgroundTheme(getBackgroundTheme(), isDark);

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
