import { createRoot, hydrateRoot } from 'react-dom/client';
import { Workspace } from './workspace';
import './styles/index.css';
const root = document.getElementById('root')!;
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has('components')
) {
  root.replaceChildren();
  void import('./design-system/catalog').then(({ ComponentCatalog }) =>
    createRoot(root).render(<ComponentCatalog />),
  );
} else if (root.hasChildNodes()) hydrateRoot(root, <Workspace />);
else createRoot(root).render(<Workspace />);
