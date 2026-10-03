import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shim = `
const saves = new Map();
globalThis.browser = { runtime: { id: 'glance-local-preview', async sendMessage(message) {
  switch (message.type) {
    case 'capture-visible-tab': {
      // The preview exercises the real inspector UI, with no extension permissions or cloud access.
      const canvas = document.createElement('canvas');
      canvas.width = innerWidth; canvas.height = innerHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f5f4ef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#315b48'; ctx.font = '24px sans-serif';
      ctx.fillText('Glance interaction preview — simulated screenshot', 32, 64);
      return { ok: true, imageDataUrl: canvas.toDataURL() };
    }
    case 'save-reference': saves.set(message.reference.id, message.reference); return { ok: true, userId: 'local-preview' };
    case 'delete-reference': saves.delete(message.id); return { ok: true };
    case 'open-library': alert('Local preview: ' + saves.size + ' simulated save(s). Nothing is sent to your account.'); return { ok: true };
    default: return { ok: false, error: 'Unavailable in the local preview.' };
  }
} } };
document.querySelector('#restart-preview').addEventListener('click', () => location.reload());
`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/inspector.js') {
      response.setHeader('Content-Type', 'text/javascript');
      return response.end(await readFile(new URL('apps/extension/.output/chrome-mv3/inspector.js', root)));
    }
    if (path === '/preview.js') {
      response.setHeader('Content-Type', 'text/javascript');
      return response.end(shim);
    }
    if (path !== '/') { response.writeHead(404).end(); return; }
    let html = await readFile(new URL('fixtures/inspector-playground.html', root), 'utf8');
    html = html.replaceAll('Refer', 'Glance');
    html = html.replace('</body>', `<aside style="position:fixed;bottom:12px;left:12px;padding:10px 14px;background:#fff;border:1px solid #ccc;border-radius:6px;font:13px/1.5 system-ui;z-index:10;">Glance local preview · Saves are simulated in this tab<br>Hover → click to inspect → click again to save · Esc to go back / exit <button id="restart-preview" style="font-size:12px;padding:6px 10px;">Restart</button></aside><script src="/preview.js"></script><script src="/inspector.js"></script></body>`);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
  } catch (error) {
    response.writeHead(500).end('Build the extension first with pnpm build. ' + error.message);
  }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') server.listen(0, '127.0.0.1');
  else { console.error(error); process.exitCode = 1; }
});
server.on('listening', () => console.log('Glance inspector preview: http://127.0.0.1:' + server.address().port));
server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
