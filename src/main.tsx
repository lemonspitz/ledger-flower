import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { THEME_IDS, themeCSS } from './themes';
import { loadPrefs } from './sync';

// Plant theme colours, and the saved theme applied before the first paint so there's no flash.
const style = document.createElement('style');
style.textContent = themeCSS();
document.head.appendChild(style);
{
  const p = loadPrefs();
  document.documentElement.dataset.plant = THEME_IDS.includes(p.plant as never) ? p.plant : 'monstera';
  if (p.theme !== 'auto') document.documentElement.dataset.theme = p.theme;
}

createRoot(document.getElementById('root')!).render(<App />);
