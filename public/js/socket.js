export function connectSocket({ onMessage, onOpen, onClose }) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => onOpen?.();
  ws.onclose = () => onClose?.();
  ws.onmessage = (e) => {
    try {
      onMessage?.(JSON.parse(e.data));
    } catch {
      /* mensaje no-JSON, se ignora */
    }
  };
  return {
    send: (obj) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    raw: ws,
  };
}
