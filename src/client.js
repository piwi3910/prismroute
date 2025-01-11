import WebSocket from 'ws';
import { request } from 'http';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8081';
const LOCAL_SERVICE = process.env.LOCAL_SERVICE || 'http://localhost:3000';
const HOSTNAME = process.env.HOSTNAME || 'myapp.local';

function connectTunnel() {
    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('Connected to tunnel server');
        
        // Register tunnel with hostname
        ws.send(JSON.stringify({
            type: 'register',
            hostname: HOSTNAME
        }));
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'registered') {
                console.log(`Tunnel registered with ID: ${data.tunnelId}`);
            }
            else if (data.type === 'request') {
                // Forward request to local service
                const options = {
                    hostname: new URL(LOCAL_SERVICE).hostname,
                    port: new URL(LOCAL_SERVICE).port,
                    path: data.path,
                    method: data.method,
                    headers: {
                        ...data.headers,
                        host: new URL(LOCAL_SERVICE).host
                    }
                };

                const localReq = request(options, (localRes) => {
                    let body = '';
                    localRes.on('data', (chunk) => {
                        body += chunk;
                    });

                    localRes.on('end', () => {
                        // Send response back through tunnel
                        ws.send(JSON.stringify({
                            type: 'response',
                            requestPath: data.path,
                            status: localRes.statusCode,
                            headers: localRes.headers,
                            body: body
                        }));
                    });
                });

                localReq.on('error', (err) => {
                    console.error('Error forwarding request:', err);
                    ws.send(JSON.stringify({
                        type: 'response',
                        requestPath: data.path,
                        status: 502,
                        headers: { 'Content-Type': 'text/plain' },
                        body: 'Bad Gateway'
                    }));
                });

                localReq.end();
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Disconnected from tunnel server. Reconnecting in 5 seconds...');
        setTimeout(connectTunnel, 5000);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
}

// Start tunnel connection
connectTunnel();