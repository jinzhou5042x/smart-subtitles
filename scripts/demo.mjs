// A fixture server only; ordinary extension users never run this.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/demo': ['demo.html', 'text/html'], '/demo.vtt': ['demo.vtt', 'text/vtt'], '/demo.mp4': ['demo.mp4', 'video/mp4'] };
const server = http.createServer(async (req, res) => {
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry) { res.writeHead(404); return res.end(); }
  try { const data = await readFile(new URL('../tests/fixtures/' + entry[0], import.meta.url)); res.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': data.length }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
server.listen(43128, '127.0.0.1', () => console.log('Test clip: http://127.0.0.1:43128/demo (no translator service)'));
