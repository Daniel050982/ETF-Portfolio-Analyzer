import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const allLogs = [];
page.on('console', msg => allLogs.push(msg.text()));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

await page.locator('text=Alle Wertpapiere').first().click();
await page.waitForTimeout(1500);

// Click first row to select a WP
const rows = await page.locator('table tbody tr').all();
if (rows.length > 0) {
  await rows[0].click();
  await page.waitForTimeout(1000);
}

// Inject kursHistorie data into the selected WP via React state
await page.evaluate(() => {
  // Generate mock kursHistorie
  const kurse = [];
  let price = 100;
  for (let i = 0; i < 200; i++) {
    const d = new Date(2024, 0, 2 + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    price += (Math.random() - 0.48) * 2;
    kurse.push({ datum: d, kurs: Math.round(price * 100) / 100 });
  }

  // Find React fiber root and dispatch
  const root = document.getElementById('root');
  const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$'));
  let fiber = root[fiberKey];

  // Walk up to find the PortfolioContext provider
  let found = false;
  while (fiber) {
    const state = fiber.memoizedState;
    if (state?.queue?.lastRenderedState?.wertpapiere) {
      console.log('[INJECT] Found portfolio state');
      const wpState = state.queue.lastRenderedState;
      const keys = Object.keys(wpState.wertpapiere);
      if (keys.length > 0) {
        console.log(`[INJECT] Setting kursHistorie on ${keys[0]} (${kurse.length} entries)`);
        wpState.wertpapiere[keys[0]].kursHistorie = kurse;

        // Trigger re-render by dispatching a setState
        if (state.queue.dispatch) {
          state.queue.dispatch({ type: 'ADD_KURS_HISTORIE', wpKey: keys[0], kurse });
        }
      }
      found = true;
      break;
    }
    fiber = fiber.return;
  }

  if (!found) {
    // Alternative: directly modify and force update via localStorage trick
    console.log('[INJECT] Could not find state via fiber, trying dispatch approach');
  }
});

await page.waitForTimeout(2000);
await page.screenshot({ path: 'injected.png' });

// Check if chart appeared
const wrapperCount = await page.locator('.recharts-wrapper').count();
const pathCount = await page.locator('.recharts-wrapper path').count();
console.log(`After inject: wrappers=${wrapperCount} paths=${pathCount}`);

// If still no chart, try a different approach: add a debug button
if (pathCount < 3) {
  console.log('Direct injection failed. Adding temporary debug log to check chartSize and kursChartData...');

  // Check the chartSize by reading from the DOM
  const containerInfo = await page.evaluate(() => {
    const el = document.querySelector('.flex-1.relative.overflow-hidden');
    if (!el) return 'NOT FOUND';
    return {
      rect: el.getBoundingClientRect(),
      style: el.style.cssText,
      computed: { w: getComputedStyle(el).width, h: getComputedStyle(el).height }
    };
  });
  console.log('Chart container:', JSON.stringify(containerInfo));
}

// Cleanup
await page.evaluate(() => {
  // Remove injected data
});

await browser.close();
