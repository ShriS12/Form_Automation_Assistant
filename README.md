# MCP Form Automation System

A Node.js application that automates form filling using a queue-based system controlled entirely through Model Context Protocol (MCP).

## Features

- **MCP Controlled**: Add, View, and Delete tasks using MCP tools.
- **Queue System**: Robust in-memory queue management.
- **Browser Automation**: Uses Puppeteer to fill forms.
- **Real-time Dashboard**: View task status at `http://localhost:3000`.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### 1. Start the Core System
To run the standalone automation system (Queue + Dashboard + Worker):
```bash
npm start
```
- **Dashboard**: `http://localhost:3000`
- **Worker**: Runs in background

### 2. Start with MCP (Optional)
To run the system with the MCP layer enabled (for AI agents):
```bash
npm run start:mcp
```
This starts everything above plus the MCP Server on Stdio.

### 3. Dashboard Usage
Open `http://localhost:3000` in your browser.
- **Add Task**: 
  - Enter the target URL.
  - Upload a JSON file containing the form data (see `test-data.json` for format).
- **Monitor**: Watch the task status update in real-time.

### 4. MCP Tools
The server exposes the following tools:

- **`add_task`**: Enqueue a new automation task.
  - Arguments:
    - `url`: String (URL of the form)
    - `formData`: Array of objects `{ selector, value }`
  
- **`view_task`**: View task status.
  - Arguments:
    - `taskId`: String (optional, returns all if omitted)

- **`delete_task`**: Remove a task.
  - Arguments:
    - `taskId`: String

## Project Structure

- `src/mcp.js`: MCP Server implementation.
- `src/queue.js`: Queue management logic.
- `src/worker.js`: Puppeteer automation worker.
- `src/server.js`: Web dashboard server.
- `public/`: Dashboard frontend assets.
