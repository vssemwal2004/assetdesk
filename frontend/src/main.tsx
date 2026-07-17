import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/manrope/index.css';

import { App } from './app/app';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('AssetDesk root element was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
