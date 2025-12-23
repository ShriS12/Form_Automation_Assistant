import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { queueManager } from "./queue.js";

export async function startMcpServer() {
    const server = new Server(
        {
            name: "form-automation-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "add_task",
                    description: "Enqueue a new form automation task",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "The URL of the form to automate",
                            },
                            formData: {
                                type: "array",
                                description: "List of form fields to fill",
                                items: {
                                    type: "object",
                                    properties: {
                                        selector: { type: "string", description: "CSS selector of the field" },
                                        value: { type: "string", description: "Value to fill" },
                                    },
                                    required: ["selector", "value"],
                                },
                            },
                        },
                        required: ["url", "formData"],
                    },
                },
                {
                    name: "view_task",
                    description: "Retrieve the status of an existing task or all tasks",
                    inputSchema: {
                        type: "object",
                        properties: {
                            taskId: {
                                type: "string",
                                description: "The ID of the task to view. If omitted, lists all tasks.",
                            },
                        },
                    },
                },
                {
                    name: "delete_task",
                    description: "Cancel or remove a task",
                    inputSchema: {
                        type: "object",
                        properties: {
                            taskId: {
                                type: "string",
                                description: "The ID of the task to delete",
                            },
                        },
                        required: ["taskId"],
                    },
                },
            ],
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            if (name === "add_task") {
                const { url, formData } = args;
                const task = queueManager.addTask(url, formData);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                message: "Task added successfully",
                                taskId: task.id,
                                status: task.status,
                            }, null, 2),
                        },
                    ],
                };
            }

            if (name === "view_task") {
                const { taskId } = args;
                if (taskId) {
                    const task = queueManager.getTask(taskId);
                    if (!task) {
                        return {
                            isError: true,
                            content: [{ type: "text", text: `Task with ID ${taskId} not found` }],
                        };
                    }
                    return {
                        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
                    };
                } else {
                    const tasks = queueManager.getAllTasks();
                    return {
                        content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
                    };
                }
            }

            if (name === "delete_task") {
                const { taskId } = args;
                const success = queueManager.deleteTask(taskId);
                if (!success) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Task with ID ${taskId} not found` }],
                    };
                }
                return {
                    content: [{ type: "text", text: `Task ${taskId} deleted successfully` }],
                };
            }

            throw new Error(`Unknown tool: ${name}`);
        } catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error: ${error.message}` }],
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
}
