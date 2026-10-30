export const isGuideDemo =
  typeof location !== 'undefined' && location.pathname === '/guide-demo.html';

export const demoDefaults = {
  accountName: isGuideDemo ? 'charlie@example.com' : '',
};
