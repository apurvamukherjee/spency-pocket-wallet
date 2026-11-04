const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['login-desktop', { width: 1440, height: 900 }], ['login-mobile', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3201/login');
    await p.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 60000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: __dirname + '/shots/' + name + '.png' });
    await ctx.close();
  }
  await b.close();
  console.log('ok');
})();
