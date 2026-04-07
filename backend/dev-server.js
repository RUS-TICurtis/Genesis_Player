import app from './server.js';

const PORT = process.env.PORT || 1552;
const DEV_RELOAD_CLIENT = `
const DEV_RELOAD_KEY = '__genesis_dev_reload__';
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

if (isLocalHost) {
  let hadConnection = false;
  let shouldReloadOnReconnect = false;
  let reconnectTimer = null;

  const connect = () => {
    const source = new EventSource('/__dev/events');

    source.onopen = () => {
      if (hadConnection && shouldReloadOnReconnect) {
        sessionStorage.setItem(DEV_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }

      hadConnection = true;
      shouldReloadOnReconnect = false;
    };

    source.addEventListener('reload', () => {
      sessionStorage.setItem(DEV_RELOAD_KEY, String(Date.now()));
      window.location.reload();
    });

    source.onerror = () => {
      shouldReloadOnReconnect = hadConnection;
      source.close();
      clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 700);
    };
  };

  if (!sessionStorage.getItem(DEV_RELOAD_KEY)) {
    connect();
  } else {
    sessionStorage.removeItem(DEV_RELOAD_KEY);
    connect();
  }
}
`;

const devClients = new Set();

app.get('/__dev/client.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(DEV_RELOAD_CLIENT);
});

app.get('/__dev/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  devClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    devClients.delete(res);
    res.end();
  });
});

const notifyDevClients = () => {
  devClients.forEach((client) => {
    client.write('event: reload\n');
    client.write(`data: ${Date.now()}\n\n`);
  });
};

process.on('SIGTERM', notifyDevClients);
process.on('SIGINT', notifyDevClients);

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
