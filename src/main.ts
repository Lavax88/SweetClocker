import './styles/main.css';
import './styles/components.css';
import './styles/effects.css';
import { initApp } from './ui/app';

document.documentElement.classList.add('js');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp().catch((err) => console.error('Failed to initialize SweetClocker WebUI:', err));
  });
} else {
  initApp().catch((err) => console.error('Failed to initialize SweetClocker WebUI:', err));
}
