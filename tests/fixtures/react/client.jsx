import React, { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
window.hydrationErrors=[];
hydrateRoot(document.getElementById('root'),<StrictMode><App/></StrictMode>,{onRecoverableError:error=>window.hydrationErrors.push(String(error))});
