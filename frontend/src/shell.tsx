import { renderToString } from 'react-dom/server';
import { Workspace } from './workspace';
// Build-time shell only: no histories, user data, or Node runtime are bundled here.
export const render = () => renderToString(<Workspace />);
