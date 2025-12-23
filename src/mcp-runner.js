import { startServer } from './server.js';
import { startMcpServer } from './mcp.js';
import { startWorker } from './worker.js';

// Redirect console.log to console.error to avoid interfering with MCP Stdio
const originalLog = console.log;
console.log = (...args) => {
    console.error(...args);
};

async function main() {
    try {
        console.error('Starting Form Automation System with MCP...');

        // Start the worker
        startWorker();

        // Start the dashboard server
        startServer(3000);

        // Start the MCP server
        await startMcpServer();

        console.error('MCP System initialized successfully.');
    } catch (error) {
        console.error('Failed to start system:', error);
        process.exit(1);
    }
}

main();
