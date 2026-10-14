import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Popup } from './Popup';
import './styles.css';
// One bundle, two windows: the pop-up window loads this page with #popup.
const isPopup = location.hash === '#popup';
if (isPopup) document.documentElement.classList.add('popup-root');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{isPopup ? <Popup /> : <App />}</React.StrictMode>);
