import { createRoot, hydrateRoot } from 'react-dom/client';
import { Workspace } from './workspace';
import './styles/index.css';
const root = document.getElementById('root')!;
if (root.hasChildNodes()) hydrateRoot(root, <Workspace />);
else createRoot(root).render(<Workspace />);
