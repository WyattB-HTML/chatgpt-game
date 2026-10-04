const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Engine = require('./server/engine.js');

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = path.join(__dirname, 'public');
const rooms = new Map();
const peers = new Set();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.readFile(file, (error, contents) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contents);
  });
});

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload);
  let header;
  if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  return Buffer.concat([header, payload]);
}

function send(peer, payload) {
  if (peer.socket.destroyed || !peer.socket.writable) return;
  peer.socket.write(encodeFrame(1, Buffer.from(JSON.stringify(payload))));
}

function sendError(peer, message) { send(peer, { type: 'error', message }); }

function peerSetFor(game) { return new Set([...peers].filter((peer) => peer.roomCode === game.code && peer.playerId)); }

function broadcast(game) {
  const connected = peerSetFor(game);
  const connectedPlayers = [...connected].map((peer) => peer.playerId);
  for (const peer of connected) {
    send(peer, { type: 'state', game: Engine.publicState(game, peer.playerId), connected: connectedPlayers });
  }
}

function roomCode(raw) { return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); }

function bindPeer(peer, game, playerId) {
  peer.roomCode = game.code; peer.playerId = playerId;
  broadcast(game);
}

function uniquePlayerName(game, rawName) {
  const name = String(rawName || '').trim();
  if (name) return name.slice(0, 18);
  const used = new Set(game.players.map((player) => player.name.toLowerCase()));
  let number = game.players.length + 1;
  while (used.has(`adventurer ${number}`.toLowerCase())) number++;
  return `Adventurer ${number}`;
}

function receive(peer, raw) {
  let message;
  try { message = JSON.parse(raw.toString('utf8')); } catch { sendError(peer, 'Could not read that message.'); return; }
  if (message.type === 'create') {
    const playerId = String(message.playerId || crypto.randomUUID()).slice(0, 64);
    const game = Engine.createLobby({ hostId: playerId, name: message.name });
    game.onStateChange = () => broadcast(game);
    rooms.set(game.code, game); bindPeer(peer, game, playerId); return;
  }
  if (message.type === 'join') {
    const code = roomCode(message.code), game = rooms.get(code);
    if (!game) { sendError(peer, 'No open game has that room code.'); return; }
    game.onStateChange ||= () => broadcast(game);
    const playerId = String(message.playerId || crypto.randomUUID()).slice(0, 64);
    const existing = game.players.find((player) => player.id === playerId);
    if (existing?.left) { sendError(peer, 'That seat has left the run. A new player can take an open seat before the heist starts.'); return; }
    if (existing) { Engine.noteJoin(game, playerId, true); bindPeer(peer, game, playerId); return; }
    if (game.phase !== 'lobby') { sendError(peer, 'That run has already begun; reconnect with the seat you used before.'); return; }
    if (game.players.length >= Engine.MAX_PLAYERS) { sendError(peer, 'This party is full.'); return; }
    const player = Engine.newPlayer({ playerId, name: uniquePlayerName(game, message.name), colorIndex: game.players.length });
    game.players.push(player); Engine.noteJoin(game, playerId); bindPeer(peer, game, playerId); return;
  }
  if (message.type === 'leave') {
    if (!peer.roomCode || !peer.playerId) return;
    const code = peer.roomCode, game = rooms.get(code);
    if (game) {
      Engine.leavePlayer(game, peer.playerId);
      peer.roomCode = null; peer.playerId = null;
      if (game.phase === 'lobby' && game.players.length === 0) rooms.delete(code);
      else broadcast(game);
    } else { peer.roomCode = null; peer.playerId = null; }
    return;
  }
  if (!peer.roomCode || !peer.playerId) { sendError(peer, 'Create a game or join a room first.'); return; }
  const game = rooms.get(peer.roomCode);
  if (!game) { sendError(peer, 'That game session has expired.'); return; }
  if (message.type === 'chat') {
    const text = String(message.text || '').trim().slice(0, 300);
    if (!text) return;
    const player = game.players.find((member) => member.id === peer.playerId);
    if (!player || player.left) { sendError(peer, 'Your seat cannot send chat right now.'); return; }
    game.chat ||= [];
    game.chat.push({ id: crypto.randomUUID(), playerId: player.id, name: player.name, text, at: Date.now() });
    game.chat = game.chat.slice(-100);
    broadcast(game);
    return;
  }
  if (message.type === 'action') {
    const action = { ...message.action, playerId: peer.playerId };
    if (action.kind === 'start' && peer.playerId !== game.hostId) { sendError(peer, 'Only the host can begin the run.'); return; }
    const error = Engine.handleAction(game, action);
    if (error) { sendError(peer, error); return; }
    game.lastAction = { kind: action.kind, by: peer.playerId, at: Date.now() };
    broadcast(game);
    return;
  }
  sendError(peer, 'That message type is not recognized.');
}

function frameParser(peer) {
  let buffer = Buffer.alloc(0);
  let fragmented = [];
  let fragmentedOpcode = 0;
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const first = buffer[0], second = buffer[1];
      const fin = !!(first & 0x80), opcode = first & 0x0f, masked = !!(second & 0x80);
      let length = second & 0x7f, offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; const n = buffer.readBigUInt64BE(2); if (n > 4_000_000n) { peer.socket.destroy(); return; } length = Number(n); offset = 10; }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      let body = buffer.subarray(offset, offset + length);
      if (masked) { body = Buffer.from(body); const mask = buffer.subarray(maskOffset, maskOffset + 4); for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4]; }
      buffer = buffer.subarray(offset + length);
      if (opcode === 8) { peer.socket.end(encodeFrame(8, body)); return; }
      if (opcode === 9) { peer.socket.write(encodeFrame(10, body)); continue; }
      if (opcode === 10) { peer.lastPong = Date.now(); continue; }
      if (opcode === 0) {
        fragmented.push(body);
        if (!fin) continue;
        const completed = Buffer.concat(fragmented); fragmented = [];
        if (fragmentedOpcode === 1) receive(peer, completed);
        fragmentedOpcode = 0; continue;
      }
      if (opcode === 1 && !fin) { fragmentedOpcode = 1; fragmented = [body]; continue; }
      if (opcode === 1) receive(peer, body);
    }
  };
}

server.on('upgrade', (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  const peer = { socket, roomCode: null, playerId: null, lastPong: Date.now() };
  peers.add(peer); const parse = frameParser(peer);
  socket.on('data', parse);
  socket.on('error', () => peers.delete(peer));
  socket.on('close', () => peers.delete(peer));
});

setInterval(() => {
  for (const peer of peers) {
    if (Date.now() - peer.lastPong > 70_000) { peer.socket.destroy(); peers.delete(peer); continue; }
    peer.socket.write(encodeFrame(9));
  }
}, 25_000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Crownfall is listening on ${PORT}`));
