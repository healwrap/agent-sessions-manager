import { renderToString } from 'react-dom/server';
import { App } from './app';
// Build-time shell only: no histories, user data, or Node runtime are bundled here.
export const render = () => renderToString(<App />);
