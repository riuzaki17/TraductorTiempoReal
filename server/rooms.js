// Estado de salas en memoria. Para el MVP no hace falta persistencia:
// las salas son efímeras (una reunión = una sala) y se limitan a 2 participantes.

const rooms = new Map(); // code -> { code, peers: Map<peerId, { ws, lang, listenLang }> }

function generateCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = generateCode();
  rooms.set(code, { code, peers: new Map() });
  return code;
}

function getRoom(code) {
  return rooms.get(code);
}

function joinRoom(code, peerId, ws) {
  const room = rooms.get(code);
  if (!room) return null;
  if (room.peers.size >= 2) return null; // solo 2 participantes por sala
  room.peers.set(peerId, { ws, lang: null, listenLang: null, provider: "mymemory", apiKey: "" });
  return room;
}

function leaveRoom(code, peerId) {
  const room = rooms.get(code);
  if (!room) return;
  room.peers.delete(peerId);
  if (room.peers.size === 0) rooms.delete(code);
}

function otherPeer(room, peerId) {
  for (const [id, peer] of room.peers) {
    if (id !== peerId) return peer;
  }
  return null;
}

module.exports = { createRoom, getRoom, joinRoom, leaveRoom, otherPeer };
