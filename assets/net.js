// Peer-to-peer networking via PeerJS (no backend, uses free public broker).
// Host creates a peer with a fixed ID derived from the game code.
// Players connect to that ID and exchange messages.

const BROKER_HOST = '0.peerjs.com';
const BROKER_PORT = 443;
const BROKER_SECURE = true;
const PEER_ID_PREFIX = 'adva-trivia-10-';

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function peerIdFor(code) {
  return PEER_ID_PREFIX + code;
}

// HOST side
function hostStart(code, handlers) {
  const peer = new Peer(peerIdFor(code), {
    host: BROKER_HOST, port: BROKER_PORT, secure: BROKER_SECURE, debug: 1
  });
  const conns = new Map(); // connId -> DataConnection

  peer.on('open', id => handlers.onOpen && handlers.onOpen(id));
  peer.on('error', err => handlers.onError && handlers.onError(err));
  peer.on('connection', conn => {
    conn.on('open', () => {
      conns.set(conn.peer, conn);
      handlers.onPlayerConnect && handlers.onPlayerConnect(conn);
    });
    conn.on('data', data => handlers.onMessage && handlers.onMessage(conn, data));
    conn.on('close', () => {
      conns.delete(conn.peer);
      handlers.onPlayerDisconnect && handlers.onPlayerDisconnect(conn);
    });
    conn.on('error', e => console.warn('conn error', e));
  });

  return {
    peer,
    conns,
    broadcast(msg) {
      for (const c of conns.values()) {
        try { c.send(msg); } catch (e) { console.warn(e); }
      }
    },
    sendTo(peerId, msg) {
      const c = conns.get(peerId);
      if (c) { try { c.send(msg); } catch (e) { console.warn(e); } }
    },
    close() {
      for (const c of conns.values()) { try { c.close(); } catch (_) {} }
      peer.destroy();
    }
  };
}

// PLAYER side
function playerJoin(code, handlers) {
  const peer = new Peer(undefined, {
    host: BROKER_HOST, port: BROKER_PORT, secure: BROKER_SECURE, debug: 1
  });
  let conn;

  peer.on('open', () => {
    conn = peer.connect(peerIdFor(code), { reliable: true });
    conn.on('open', () => handlers.onOpen && handlers.onOpen(conn));
    conn.on('data', data => handlers.onMessage && handlers.onMessage(data));
    conn.on('close', () => handlers.onClose && handlers.onClose());
    conn.on('error', e => handlers.onError && handlers.onError(e));
  });
  peer.on('error', err => handlers.onError && handlers.onError(err));

  return {
    peer,
    send(msg) { if (conn && conn.open) conn.send(msg); },
    close() { if (conn) { try { conn.close(); } catch (_){} } peer.destroy(); }
  };
}

window.Net = { makeCode, peerIdFor, hostStart, playerJoin };
