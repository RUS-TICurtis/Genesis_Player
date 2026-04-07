const localHosts = new Set(['localhost', '127.0.0.1']);

if (localHosts.has(window.location.hostname)) {
    import('/__dev/client.js').catch(() => {
        // Dev reload is optional and should never block the app.
    });
}
