import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Canvas textures (signs, floor markings) need the font loaded before they are drawn.
const fontReady = Promise.race([
  document.fonts.load('700 32px "Inter Variable"'),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]);

fontReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
