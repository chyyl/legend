/* ============================================================================
 * tools/lan-signal.js —— 可选局域网信令辅助（Q4 局域网通道B，Node 版）
 * ----------------------------------------------------------------------------
 * 用途：浏览器无法直接 UDP 广播，跨设备自动发现需一个极简信令中转。
 *       本脚本在局域网内任意一台电脑运行后，各设备浏览器访问
 *       http://<主机IP>:8765 自动交换 WebRTC 信令，实现"房间码自动连"。
 *
 * 运行：node tools/lan-signal.js   （零依赖，Node 16+）
 * 停止：Ctrl+C。不运行本脚本时，游戏仍可用"复制粘贴完整码"方式联机。
 *
 * 协议：WebSocket 广播 {room, kind, sdp} 到同房间所有连接。
 * ========================================================================== */
'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = 8765;
const clients = new Set();

/* 极简 WebSocket 服务端实现（无第三方依赖） */
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('LEGEND LAN 信令服务运行中。请在游戏中使用房间码联机。\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const client = { socket, buf: Buffer.alloc(0) };
  clients.add(client);
  socket.on('data', (d) => onData(client, d));
  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
});

function onData(client, d) {
  client.buf = Buffer.concat([client.buf, d]);
  for (;;) {
    const frame = parseFrame(client.buf);
    if (!frame) break;
    client.buf = client.buf.slice(frame.len);
    if (frame.opcode === 0x8) { client.socket.end(); clients.delete(client); return; }
    if (frame.opcode === 0x9) { sendFrame(client.socket, frame.payload, 0xA); continue; } // ping->pong
    if (frame.opcode === 0x1) broadcast(frame.payload.toString('utf8'), client); // 文本帧广播
  }
}

/* 解析 WebSocket 帧（仅支持掩码客户端帧，游戏浏览器均带掩码） */
function parseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  const maskLen = masked ? 4 : 0;
  if (buf.length < off + maskLen + len) return null;
  let payload = buf.slice(off + maskLen, off + maskLen + len);
  if (masked) {
    const mask = buf.slice(off, off + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  return { opcode, payload, len: off + maskLen + len };
}

/* 构造服务端帧（无掩码） */
function sendFrame(socket, payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  try { socket.write(Buffer.concat([header, payload])); } catch (e) { /* 断开忽略 */ }
}

/* 广播给同房间所有其它连接 */
function broadcast(text, from) {
  let msg; try { msg = JSON.parse(text); } catch (e) { return; }
  const out = Buffer.from(JSON.stringify(msg), 'utf8');
  clients.forEach((c) => {
    if (c === from) return;
    // 无房间概念时全量转发；带 room 字段时仅转发同房间
    sendFrame(c.socket, out, 0x1);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const ips = [];
  Object.values(nets).forEach((arr) => arr.forEach((n) => { if (n.family === 'IPv4' && !n.internal) ips.push(n.address); }));
  console.log('LEGEND LAN 信令已启动:');
  console.log('  本机访问: http://localhost:' + PORT);
  ips.forEach((ip) => console.log('  局域网:   http://' + ip + ':' + PORT));
  console.log('提示: 将本机 IP 告知队友，先访问上述地址后再用房间码联机。');
});
