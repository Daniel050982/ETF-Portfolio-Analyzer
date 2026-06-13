import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const allLogs = [];
page.on('console', msg => allLogs.push(msg.text()));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Navigate to Alle Wertpapiere
await page.locator('text=Alle Wertpapiere').first().click();
await page.waitForTimeout(1500);

// Try each WP until we find one with chart data
const rows = await page.locator('table tbody tr').all();
console.log(`Total rows: ${rows.length}`);
let foundChart = false;
for (let ri = 0; ri < rows.length && !foundChart; ri++) {
  const text = await rows[ri].innerText().catch(() => '');
  await rows[ri].click();
  await page.waitForTimeout(1500);

  // Check if chart appeared
  const wCount = await page.locator('.recharts-wrapper').count();
  const pathCount = await page.locator('.recharts-wrapper path').count();
  if (wCount > 0 && pathCount > 2) {
    console.log(`Found chart at row ${ri}: ${text.substring(0, 50)} (${wCount} wrappers, ${pathCount} paths)`);
    foundChart = true;
  }
}
if (!foundChart) {
  console.log('No WP with chart data found!');
  await page.screenshot({ path: 'no-chart.png' });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1000);

// Find our LineChart wrapper (has recharts-line children)
const wrappers = await page.locator('.recharts-wrapper').all();
let lineChartWrapper = null;
let lineChartBox = null;
for (const w of wrappers) {
  const hasLine = await w.locator('.recharts-line').count();
  if (hasLine > 0) {
    lineChartWrapper = w;
    lineChartBox = await w.boundingBox();
    break;
  }
}

if (!lineChartWrapper || !lineChartBox) {
  console.log('No LineChart found via .recharts-line. Checking wrappers...');
  for (let i = 0; i < wrappers.length; i++) {
    const box = await wrappers[i].boundingBox();
    const classes = await wrappers[i].evaluate(el => {
      const all = el.querySelectorAll('[class*="recharts"]');
      return Array.from(all).map(e => e.className?.baseVal || e.className || '').filter(Boolean).slice(0, 10);
    });
    console.log(`Wrapper ${i}: ${JSON.stringify(box)} classes: ${JSON.stringify(classes)}`);
    // Use first wrapper with an SVG path
    const paths = await wrappers[i].locator('path').count();
    if (paths > 2 && !lineChartWrapper) {
      lineChartWrapper = wrappers[i];
      lineChartBox = box;
    }
  }
  if (!lineChartWrapper) {
    await page.screenshot({ path: 'no-linechart.png' });
    await browser.close();
    process.exit(1);
  }
}

console.log(`LineChart at: ${JSON.stringify(lineChartBox)}`);

// Check wrapper style - especially width/height
const wrapperInfo = await lineChartWrapper.evaluate(el => ({
  style: el.style.cssText,
  computedW: getComputedStyle(el).width,
  computedH: getComputedStyle(el).height,
  svgW: el.querySelector('svg')?.getAttribute('width'),
  svgH: el.querySelector('svg')?.getAttribute('height'),
}));
console.log('Wrapper info:', JSON.stringify(wrapperInfo));

// Inject a console.log into the onMouseMove to verify it fires
await page.evaluate(() => {
  const wrapper = document.querySelector('.recharts-wrapper');
  if (!wrapper) return;
  // Add native listener to verify DOM events reach the wrapper
  wrapper.addEventListener('mousemove', () => {
    console.log('[NATIVE] mousemove on wrapper');
  }, { once: true });
  wrapper.addEventListener('click', () => {
    console.log('[NATIVE] click on wrapper');
  }, { once: true });
});

// Test 1: Move mouse and click WITHOUT crosshair tool
allLogs.length = 0;
console.log('\n--- Test 1: Mouse events without tool ---');
await page.mouse.move(lineChartBox.x + lineChartBox.width / 2, lineChartBox.y + lineChartBox.height / 2);
await page.waitForTimeout(500);
await page.mouse.click(lineChartBox.x + lineChartBox.width / 2, lineChartBox.y + lineChartBox.height / 2);
await page.waitForTimeout(500);

const nativeLogs = allLogs.filter(l => l.includes('NATIVE'));
const chartLogs = allLogs.filter(l => l.includes('CHART_DEBUG'));
console.log(`Native events: ${nativeLogs.length}, CHART_DEBUG: ${chartLogs.length}`);
nativeLogs.forEach(l => console.log(`  ${l}`));
chartLogs.forEach(l => console.log(`  ${l}`));

// Test 2: Activate Fadenkreuz then move
const crosshairBtn = page.locator('button[title="Fadenkreuz"]');
if (await crosshairBtn.count() > 0 && await crosshairBtn.isVisible()) {
  await crosshairBtn.click();
  console.log('\n--- Test 2: Crosshair activated ---');
  await page.waitForTimeout(300);

  allLogs.length = 0;
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(lineChartBox.x + 80 + i * (lineChartBox.width / 6), lineChartBox.y + lineChartBox.height / 2);
    await page.waitForTimeout(200);
  }
  await page.mouse.click(lineChartBox.x + lineChartBox.width / 2, lineChartBox.y + lineChartBox.height / 2);
  await page.waitForTimeout(800);

  const debugLogs2 = allLogs.filter(l => l.includes('CHART_DEBUG'));
  console.log(`CHART_DEBUG with crosshair: ${debugLogs2.length}`);
  debugLogs2.slice(0, 5).forEach(l => console.log(`  ${l}`));

  // Check if any crosshair elements appeared in the SVG
  const refLines = await lineChartWrapper.locator('.recharts-reference-line').count();
  const refDots = await lineChartWrapper.locator('.recharts-reference-dot').count();
  console.log(`ReferenceLine: ${refLines}, ReferenceDot: ${refDots}`);
} else {
  console.log('Fadenkreuz button not found or not visible!');
  const allBtns = await page.locator('button').all();
  for (const b of allBtns) {
    const t = await b.getAttribute('title');
    if (t) console.log(`  Button: "${t}" visible=${await b.isVisible()}`);
  }
}

// Check all size warnings
const sizeWarns = allLogs.filter(l => l.includes('greater than 0'));
console.log(`\nSize warnings: ${sizeWarns.length}`);

await page.screenshot({ path: 'event-test.png' });
await browser.close();
