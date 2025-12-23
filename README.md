# Form Automation System

A robust, modernized Node.js application for automating complex web forms. This system features a real-time dashboard, manual intervention for file uploads, and intelligent form-filling logic.


## Features

- **Real-time Dashboard**: 
  - Modern, responsive UI (`http://localhost:3000`) built with vanilla JS and socket.io.
  - Live task status updates (Queued, Processing, User Action Required, Completed, Failed).
  - Ability to delete/cancel active tasks immediately.

- **Intelligent Form Filling**:
  - **Dynamic Field Recognition**: Automatically acts on text inputs, dropdowns, radios, checkboxes, and React-based components.
  - **Smart Name Handling**: Combines "First Name" and "Last Name" values if only a "Full Name" field is found.

- **Advanced Workflows**:
  - **File Upload Intervention**: Detects file inputs and pauses automation, prompting the user via the Dashboard UI to upload the file. Once uploaded, the automation resumes instantly.
  - **Auto-Submission & Verification**: Automatically detects submit buttons and waits for "Success"/"Thank You" confirmation messages before marking tasks as complete.
  - **Queue Management**: Reliable in-memory queue. Deleting a task immediately stops the worker and closes the browser instance.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ShriS12/Form_Automation_Assistant.git
   cd Form_Automation_Assistant
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### 1. Start the System
Run the application to start the server, queue manager, and dashboard:
```bash
npm start
```
- **Dashboard**: Open `http://localhost:3000` in your web browser.

### 2. Submit a Task
1. In the Dashboard "Add New Task" section:
2. Enter the **Form URL**.
3. Upload a **JSON configuration file** defining the data to fill.

**Example `formData.json`:**
```json
[
    { "selector": "#firstName", "value": "John" },
    { "selector": "#lastName", "value": "Doe" },
    { "selector": "#email", "value": "john.doe@example.com" },
    { "selector": "#uploadField", "value": "file" } 
]
```
*Note: If a value is set to "file", the system will pause and ask for a file upload.*

### 3. File Upload Handling
If the automation encounters a file input:
1. The status will change to **WAITING_FOR_FILE**.
2. A modal will appear on the Dashboard.
3. Select the file you want to upload and click "Upload & Resume".
4. The worker will receive the file path, upload it to the form, and continue.

## Architecture

- **Frontend**: HTML5, CSS3, Vanilla JavaScript.
- **Backend**: Node.js, Express.
- **Real-time**: Socket.IO for bidirectional events (logs, status updates).
- **Automation**: Puppeteer (Headless Chrome).

## Project Structure

- `src/server.js`: Express server setup and API routes.
- `src/queue.js`: Core queue logic and state management.
- `src/worker.js`: Puppeteer automation logic (navigation, filling, submission).
- `public/`: Dashboard assets (HTML, CSS, JS).
- `test-data.json`: Sample data for testing.

## Architecture Diagram

<img width="3088" height="822" alt="image" src="https://github.com/user-attachments/assets/cc48fcc8-e827-4159-9255-7c108d2118df" />

## Application Demo

https://github.com/user-attachments/assets/ff62259c-d593-4d47-8ab7-468a0872a6b0

## Application Demo : Form-Filling Automation using Claude via MCP

https://github.com/user-attachments/assets/bd7ba12b-c7a9-40ed-9013-ccda2dead657







