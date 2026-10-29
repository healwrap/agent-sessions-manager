export const isGuideDemo =
  typeof location !== 'undefined' && location.pathname === '/guide-demo.html';

export const demoDefaults = {
  accountName: isGuideDemo ? 'charlie@example.com' : '',
  proxyName: isGuideDemo ? '示例专用代理' : '',
  subscription: isGuideDemo ? 'https://subscription.example.com/demo' : '',
};
