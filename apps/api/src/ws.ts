const clients = new Set<{ send: (data: string) => void }>();

export function addClient(ws: { send: (data: string) => void }) {
  clients.add(ws);
}

export function removeClient(ws: { send: (data: string) => void }) {
  clients.delete(ws);
}

export function broadcast(data: unknown) {
  const json = JSON.stringify(data);
  for (const ws of clients) {
    try {
      ws.send(json);
    } catch {
      clients.delete(ws);
    }
  }
}

export function clientCount() {
  return clients.size;
}
