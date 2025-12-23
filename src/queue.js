import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.queue = [];
    this.isProcessing = false;
  }

  addTask(url, formData) {
    const id = uuidv4();
    const task = {
      id,
      url,
      formData,
      status: 'QUEUED', // QUEUED, PROCESSING, COMPLETED, FAILED
      createdAt: new Date(),
      logs: []
    };

    this.tasks.set(id, task);
    this.queue.push(id);
    this.emit('taskAdded', task);
    this.processQueue();
    return task;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteTask(id) {
    if (this.tasks.has(id)) {
      const task = this.tasks.get(id);

      // Remove from queue if pending
      const queueIndex = this.queue.indexOf(id);
      if (queueIndex > -1) {
        this.queue.splice(queueIndex, 1);
      }

      // If processing, we can't easily kill the worker promise in this simple implementation
      // but we can mark it as cancelled so the worker knows not to save results if possible
      // For now, we just delete the record.

      this.tasks.delete(id);
      this.emit('taskDeleted', id);
      return true;
    }
    return false;
  }

  updateTaskStatus(id, status, result = null, error = null) {
    if (this.tasks.has(id)) {
      const task = this.tasks.get(id);
      task.status = status;
      if (result) task.result = result;
      if (error) task.error = error;
      task.updatedAt = new Date();

      this.emit('taskUpdated', task);
    }
  }

  addTaskLog(id, message) {
    if (this.tasks.has(id)) {
      const task = this.tasks.get(id);
      const logEntry = { timestamp: new Date(), message };
      task.logs.push(logEntry);
      // We emit taskUpdated so UI can refresh logs
      this.emit('taskUpdated', task);
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const taskId = this.queue.shift();
    const task = this.tasks.get(taskId);

    if (!task) {
      this.isProcessing = false;
      this.processQueue();
      return;
    }

    try {
      this.updateTaskStatus(taskId, 'PROCESSING');
      this.emit('processTask', task); // Worker listens to this
    } catch (error) {
      console.error('Error starting task processing:', error);
      this.isProcessing = false;
    }
  }

  completeTask(id, result) {
    this.updateTaskStatus(id, 'COMPLETED', result);
    this.isProcessing = false;
    this.processQueue();
  }

  failTask(id, error) {
    this.updateTaskStatus(id, 'FAILED', null, error);
    this.isProcessing = false;
    this.processQueue();
  }

  handleFileUpload(id, selector, filePath) {
    if (this.tasks.has(id)) {
      console.log(`QueueManager: Emitting fileUploaded for ${id}, selector: ${selector}`);
      this.addTaskLog(id, `File uploaded for ${selector}`);
      this.emit('fileUploaded', id, selector, filePath);
    } else {
      console.error(`QueueManager: Task ${id} not found for file upload`);
    }
  }
}

export const queueManager = new QueueManager();
