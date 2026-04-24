// Peer-to-peer networking via PeerJS (no backend, uses free public broker).
// Host creates a peer with a fixed ID derived from the game code.
// Players connect to that ID and exchange messages.

const BROKER_HOST = '0.peerjs.com';
const BROKER_PORT = 443;
const BROKER_SECURE = true;
const PEER_ID_PREFIX = 'adva-trivia-10-';

// Free public STUN + open TURN servers. TURN is the key to crossing strict NAT/firewalls.
// openrelay.metered.ca is a free public TURN (no signup, rate-limited but fine for <20 clients).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const PEER_OPTS = {
  host: BROKER_HOST, port: BROKER_PORT, secure: BROKER_SECURE, debug: 1,
  config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 }
};

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function peerIdFor(code) {
  return PEER_ID_PREFIX + code;
}

// HOST side
function hostStart(code, handlers) {
  const peer = new Peer(peerIdFor(code), PEER_OPTS);
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

// PLAYER side - with retry (broker+connection attempts up to MAX_TRIES)
function playerJoin(code, handlers) {
  const MAX_TRIES = 4;
  const RETRY_DELAY_MS = 2000;
  let attempt = 0;
  let peer = null;
  let conn = null;
  let openAcked = false;
  let closedByUser = false;

  function notifyStatus(msg) { handlers.onStatus && handlers.onStatus(msg); }

  function tryConnect() {
    attempt++;
    notifyStatus('מתחבר (ניסיון ' + attempt + '/' + MAX_TRIES + ')...');
    if (peer) { try { peer.destroy(); } catch (_){} peer = null; }

    peer = new Peer(undefined, PEER_OPTS);
    let brokerOpened = false;
    let connAttemptTimer = null;

    const brokerTimeout = setTimeout(() => {
      if (!brokerOpened) {
        console.warn('Broker open timeout');
        retry();
      }
    }, 8000);

    peer.on('open', () => {
      brokerOpened = true;
      clearTimeout(brokerTimeout);
      conn = peer.connect(peerIdFor(code), { reliable: true });

      const connTimeout = setTimeout(() => {
        if (!openAcked) {
          console.warn('Data connection open timeout');
          retry();
        }
      }, 8000);

      conn.on('open', () => {
        openAcked = true;
        clearTimeout(connTimeout);
        handlers.onOpen && handlers.onOpen(conn);
      });
      conn.on('data', data => handlers.onMessage && handlers.onMessage(data));
      conn.on('close', () => {
        if (!closedByUser && openAcked) handlers.onClose && handlers.onClose();
      });
      conn.on('error', e => { console.warn('conn error', e); });
    });

    peer.on('error', err => {
      console.warn('peer error', err && err.type, err && err.message);
      // Errors that are fatal (no point retrying):
      if (err && err.type === 'peer-unavailable') {
        handlers.onError && handlers.onError(new Error('קוד המשחק שגוי או שהמשחק עוד לא נפתח'));
        return;
      }
      retry();
    });
  }

  function retry() {
    if (openAcked || closedByUser) return;
    if (attempt >= MAX_TRIES) {
      handlers.onError && handlers.onError(new Error('החיבור נכשל אחרי ' + MAX_TRIES + ' ניסיונות. נסי WiFi אחר או חבילת סלולר.'));
      return;
    }
    setTimeout(tryConnect, RETRY_DELAY_MS);
  }

  tryConnect();

  return {
    get peer() { return peer; },
    send(msg) { if (conn && conn.open) conn.send(msg); },
    close() { closedByUser = true; if (conn) { try { conn.close(); } catch (_){} } if (peer) peer.destroy(); }
  };
}

window.Net = { makeCode, peerIdFor, hostStart, playerJoin };
