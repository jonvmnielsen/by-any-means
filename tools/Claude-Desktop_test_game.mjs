import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const site = path.resolve(process.env.SITE || "."); const nm = path.resolve('node_modules');
const page_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fs.readFileSync(path.join(site, 'index.html'), 'utf8') + '</body></html>';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
const page = await ctx.newPage(); const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === 'cdn.jsdelivr.net') { const m = u.pathname.match(/^\/npm\/(three(?:-mesh-bvh)?|es-module-shims)@[^/]+\/(.*)$/); return route.fulfill({ body: fs.readFileSync(path.join(nm, m[1], m[2])), contentType: 'application/javascript' }); }
  if (u.hostname === 'game.test') {
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ body: page_html, contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com" } });
    const f = path.join(site, decodeURIComponent(u.pathname));
    if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : f.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream' });
    return route.fulfill({ status: 404 }); }
  if (u.hostname.includes('fonts.g')) return route.fulfill({ body: '', contentType: 'text/css' });
  return route.abort();
});
globalThis.page = page; globalThis.logs = logs;
const t0 = Date.now();
await page.goto('http://game.test/?lo' + (process.env.Q || ''));
try { await page.waitForFunction(() => (window.__bam && window.__bam.ready) || /Fejl/.test(document.getElementById('status').textContent), null, { timeout: +(process.env.TO || 300000) }); } catch (e) { console.log('TIMEOUT', await page.$eval('#status', (e) => e.textContent)); console.log(logs.slice(0, 30).join('\n')); await browser.close(); process.exit(1); }
console.log('loaded', (Date.now() - t0) / 1000, 's;', await page.$eval('#status', (e) => e.textContent));
if (process.env.SCRIPT) { const fn = (await import(path.resolve(process.env.SCRIPT))).default; await fn(page, logs); }
console.log(logs.filter((l) => !/GPU stall|GL_|WebGL-|Failed to load resource/.test(l)).slice(0, 40).join('\n'));
await browser.close();
