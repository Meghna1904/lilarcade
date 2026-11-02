import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './components/games/poison/poison-screen.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
