// Captures README screenshots and film source frames from the demo build. Demo data only.
const { chromium } = require('playwright');
const OUT = __dirname + '/shots/';
const BASE = process.env.BASE || 'http://localhost:3200';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready(p) {
  await p.getByRole('heading', { name: 'Safe to spend today' }).waitFor({ timeout: 60000 });
  await wait(600);
}

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  const shot = (name, opts = {}) => p.screenshot({ path: OUT + name, ...opts });

  await p.goto(BASE + '/'); await ready(p);
  await shot('home-mobile.png');
  await shot('home-full.png', { fullPage: true });

  // Inbox + a swipe captured frame by frame.
  await p.goto(BASE + '/inbox'); await p.getByText(/Swipe right to confirm/).waitFor(); await wait(400);
  await shot('inbox-mobile.png');
  const card = p.locator('main li').filter({ hasText: 'Swiggy' }).first();
  const box = await card.boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + 60;
  await p.mouse.move(x0, y); await p.mouse.down();
  for (let i = 0; i <= 18; i++) {
    await p.mouse.move(x0 + i * 9, y);
    await wait(40);
    await shot(`swipe-${String(i).padStart(2, '0')}.png`);
  }
  await p.mouse.up(); await wait(500);
  await shot('swipe-done.png');

  // Yearly bill.
  await p.goto(BASE + '/commitments'); await p.getByRole('button', { name: 'Add bill' }).click();
  const d = p.getByRole('dialog');
  await d.getByPlaceholder('Netflix, rent, EMI…').fill('Car insurance');
  await d.locator('input[inputmode=decimal]').first().fill('24000');
  const due = new Date(); due.setMonth(due.getMonth() + 5); due.setDate(15);
  await d.locator('input[type=date]').fill(due.toISOString().slice(0, 10));
  await d.getByRole('radio', { name: 'Yearly' }).click();
  await d.getByLabel('Already put aside for it').fill('6000');
  await d.getByRole('button', { name: 'Save' }).click(); await wait(500);
  await shot('bills-full.png', { fullPage: true });
  await p.getByText('Car insurance').scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, 160)); await wait(300);
  await shot('bills-mobile.png');

  // Money in: a refund back to Eating out.
  await p.locator('nav button[aria-label="Add spend"]').click();
  const q = p.getByRole('dialog');
  await q.getByRole('radio', { name: 'Money in' }).click();
  await q.getByPlaceholder('0', { exact: true }).fill('349');
  await q.getByPlaceholder('From? (optional)').fill('Swiggy');
  await q.getByRole('group', { name: 'Envelope' }).getByRole('button', { name: 'Eating out' }).click();
  await wait(400); await shot('money-in-mobile.png');
  await q.getByRole('button', { name: /^Add/ }).click(); await wait(400);

  // Payday months (shown, not saved).
  await p.goto(BASE + '/onboarding');
  await p.getByRole('radio', { name: 'Payday to payday' }).click();
  await p.getByLabel("What's in your bank right now?").fill('95000');
  await wait(400); await shot('payday-mobile.png');

  // Two bank accounts, then Reconcile.
  await p.goto(BASE + '/settings');
  await p.getByRole('button', { name: 'Add another account' }).click();
  await p.getByLabel('Savings now').waitFor();
  await p.getByLabel('Savings now').fill('42000');
  await p.getByRole('button', { name: 'Save plan' }).click(); await wait(400);
  await shot('settings-full.png', { fullPage: true });
  await p.goto(BASE + '/settings'); await wait(500);
  await shot('settings-mobile.png');
  await p.getByRole('heading', { name: 'Bank accounts' }).scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, 240)); await wait(300);
  await shot('accounts-mobile.png');
  await p.goto(BASE + '/reconcile'); await p.getByText('What does each bank app show right now?').waitFor(); await wait(300);
  await shot('reconcile-mobile.png');

  // Home again with the new data, then light theme.
  await p.goto(BASE + '/'); await ready(p);
  await shot('home-after-mobile.png');
  await p.goto(BASE + '/settings'); await p.getByRole('radio', { name: 'Light' }).click(); await wait(400);
  await p.goto(BASE + '/'); await ready(p);
  await shot('home-mobile-light.png');
  await p.goto(BASE + '/inbox'); await wait(600);
  await shot('inbox-mobile-light.png');

  // Desktop, dark then light.
  const desk = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const dp = await desk.newPage();
  dp.on('pageerror', (e) => errs.push(e.message));
  await dp.goto(BASE + '/'); await ready(dp);
  await dp.screenshot({ path: OUT + 'desktop.png' });
  await dp.goto(BASE + '/settings'); await dp.getByRole('radio', { name: 'Light' }).click(); await wait(300);
  await dp.goto(BASE + '/'); await ready(dp);
  await dp.screenshot({ path: OUT + 'desktop-light.png' });
  await dp.goto(BASE + '/commitments'); await wait(600);
  await dp.screenshot({ path: OUT + 'desktop-bills-light.png' });

  console.log('errors:', errs);
  await b.close();
})();
