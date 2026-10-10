import React from 'react';
import {createRoot} from 'react-dom/client';
import AuthGate from './AuthGate.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<AuthGate />);
