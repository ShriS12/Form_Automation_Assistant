import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { queueManager } from './queue.js';
import multer from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer(port = 3000) {
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer);

    // Serve static files from public directory
    app.use(express.static(path.join(__dirname, '../public')));
    app.use(express.json());

    // API Routes
    app.post('/api/tasks', (req, res) => {
        try {
            const { url, formData } = req.body;
            if (!url || !formData) {
                return res.status(400).json({ error: 'URL and formData are required' });
            }
            const task = queueManager.addTask(url, formData);
            res.json(task);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.delete('/api/tasks/:id', (req, res) => {
        const { id } = req.params;
        const success = queueManager.deleteTask(id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    });

    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir)
        },
        filename: function (req, file, cb) {
            cb(null, `${Date.now()}-${file.originalname}`)
        }
    });

    const upload = multer({ storage: storage });

    app.post('/api/tasks/:id/upload', upload.single('file'), (req, res) => {
        try {
            const { id } = req.params;
            const { selector } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            queueManager.handleFileUpload(id, selector, req.file.path);
            res.json({ success: true, path: req.file.path });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Socket.io connection
    io.on('connection', (socket) => {
        // Send initial state
        socket.emit('initialState', queueManager.getAllTasks());
    });

    // Listen to queue events and broadcast
    queueManager.on('taskAdded', (task) => io.emit('taskAdded', task));
    queueManager.on('taskUpdated', (task) => io.emit('taskUpdated', task));
    queueManager.on('taskDeleted', (id) => io.emit('taskDeleted', id));
    queueManager.on('processTask', (task) => io.emit('taskProcessing', task));

    httpServer.listen(port, () => {
        console.error(`Dashboard running at http://localhost:${port}`);
    });

    return { app, io };
}
