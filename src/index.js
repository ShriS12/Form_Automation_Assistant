import { startServer } from './server.js';
import { startWorker } from './worker.js';

async function main() {
    try {
        console.log('Starting Form Automation System (Core)...');

        // Start the worker
        startWorker();

        // Start the dashboard server
        startServer(3000);

        console.log('Core System initialized. Dashboard at http://localhost:3000');
    } catch (error) {
        console.error('Failed to start system:', error);
        process.exit(1);
    }
}

main();
