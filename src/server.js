import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

const tunnels = new Map();
const PORT = process.env.PORT || 8081;

// Create HTTP server to handle incoming traffic
const httpServer = createServer((req, res) => {
    const host = req.headers.host;
    if (!host) {
        res.writeHead(400);
        res.end('No host header provided');
        return;
    }

    // Find tunnel for this host
    const tunnel = Array.from(tunnels.values()).find(t => t.hostname === host);
    if (!tunnel) {
        res.writeHead(404);
        res.end('No tunnel found for this hostname');
        return;
    }

    // Forward request through tunnel
    const requestData = {
        method: req.method,
        path: req.url,
        headers: req.headers,
        type: 'request'
    };

    // Send request through WebSocket
    tunnel.ws.send(JSON.stringify(requestData));

    // Store callback to handle response
    tunnel.pendingRequests.set(req.url, {
        res,
        timestamp: Date.now()
    });
});

// Create WebSocket server for tunnel connections
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
    console.log('New tunnel connection established');
    const tunnelId = uuidv4();
    
    const tunnel = {
        id: tunnelId,
        ws,
        hostname: null,
        pendingRequests: new Map()
    };

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'register') {
                // Register tunnel with hostname
                tunnel.hostname = data.hostname;
                tunnels.set(tunnelId, tunnel);
                console.log(`Registered tunnel for hostname: ${data.hostname}`);
                ws.send(JSON.stringify({ type: 'registered', tunnelId }));
            }
            else if (data.type === 'response') {
                // Handle response from tunnel
                const pendingRequest = tunnel.pendingRequests.get(data.requestPath);
                if (pendingRequest) {
                    const { res } = pendingRequest;
                    res.writeHead(data.status, data.headers);
                    res.end(data.body);
                    tunnel.pendingRequests.delete(data.requestPath);
                }
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log(`Tunnel ${tunnelId} disconnected`);
        tunnels.delete(tunnelId);
    });
});

// Clean up stale pending requests periodically
setInterval(() => {
    const now = Date.now();
    tunnels.forEach(tunnel => {
        tunnel.pendingRequests.forEach((request, path) => {
            if (now - request.timestamp > 30000) { // 30 second timeout
                request.res.writeHead(504);
                request.res.end('Gateway Timeout');
                tunnel.pendingRequests.delete(path);
            }
        });
    });
}, 5000);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});