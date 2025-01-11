import { createServer } from 'http';

const PORT = 3000;

const server = createServer((req, res) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    
    // Echo request details as response
    const response = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
});

server.listen(PORT, () => {
    console.log(`Test service running on http://localhost:${PORT}`);
});