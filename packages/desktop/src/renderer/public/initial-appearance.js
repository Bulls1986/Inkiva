const appearance = new URLSearchParams(window.location.search).get('theme')
const initialAppearance = appearance === 'dark' || appearance === 'paper' ? appearance : 'light'

// This document-start entry runs before the inline shell's styles are parsed.
// Keep it dependency-free so a persisted appearance is available even when a
// sandboxed preload starts before the document has a root element.
document.documentElement.setAttribute('data-inkiva-appearance', initialAppearance)
