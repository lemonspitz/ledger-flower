import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { themeCSS } from './themes';
import { resolveFlower } from './flowers';
import { loadPrefs } from './sync';

// Flower theme colours, and the saved theme applied before the first paint so there's no flash.
const style = document.createElement('style');
style.textContent = themeCSS();
document.head.appendChild(style);
{
  const p = loadPrefs();
  document.documentElement.dataset.plant = resolveFlower(p.plant);
  if (p.theme !== 'auto') document.documentElement.dataset.theme = p.theme;
}

createRoot(document.getElementById('root')!).render(<App />);

// Web version only (not the Android/iPhone/desktop apps): store the app for offline use and installing.
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('offline support unavailable', e)); });
}
