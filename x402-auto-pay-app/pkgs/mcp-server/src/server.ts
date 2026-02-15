import { StreamableHTTPTransport } from "@hono/mcp";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type X402ServerResponse = {
    ok: boolean;
    statusCode: number;
    body: unknown;
};

const DEFAULT_PORT_NUMBER: number = 8787;
const DASHBOARD_RESOURCE_URI: string = "ui://x402/payment-dashboard";
const DEFAULT_X402_SERVER_BASE_URL: string = "http://localhost:4021";
const DEFAULT_X402_SERVER_TIMEOUT_MS: number = 8000;

let serverInstance: Bun.Server | null = null;

const parsePortNumber = (value: string | undefined): number => {
    if (!value) {
        return DEFAULT_PORT_NUMBER;
    }
    const parsedPortNumber: number = Number.parseInt(value, 10);
    if (Number.isNaN(parsedPortNumber)) {
        return DEFAULT_PORT_NUMBER;
    }
    return parsedPortNumber;
};

const fetchWithTimeout = async (input: RequestInfo | URL, timeoutMs: number, init?: RequestInit): Promise<Response> => {
    const controller: AbortController = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
};

const createX402ServerClient = () => {
    const baseUrl: string = process.env.X402_SERVER_BASE_URL ?? DEFAULT_X402_SERVER_BASE_URL;
    const timeoutMs: number =
        Number.parseInt(process.env.X402_SERVER_TIMEOUT_MS ?? "", 10) || DEFAULT_X402_SERVER_TIMEOUT_MS;

    const request = async (path: string): Promise<X402ServerResponse> => {
        const url: string = `${baseUrl.replace(/\/$/, "")}${path}`;
        try {
            const response: Response = await fetchWithTimeout(url, timeoutMs);
            const body: unknown = await response.json().catch(() => null);
            return { ok: response.ok, statusCode: response.status, body };
        } catch (error) {
            return { ok: false, statusCode: 0, body: { error: "X402_SERVER_UNREACHABLE", detail: String(error) } };
        }
    };

    return {
        getHealth: () => request("/health"),
        getWeather: () => request("/weather"),
    };
};

const createAppServer = async (): Promise<{ app: Hono; server: McpServer }> => {
    const app: Hono = new Hono();
    const server: McpServer = new McpServer({ name: "x402-auto-pay-app", version: "1.0.0" });
    const x402ServerClient = createX402ServerClient();

    const __filename: string = fileURLToPath(import.meta.url);
    const __dirname: string = dirname(__filename);
    const uiPath: string = join(__dirname, "ui", "payment-dashboard.html");
    const uiHtml: string = await readFile(uiPath, "utf-8");

    registerAppResource(
        server,
        "x402_payment_dashboard",
        DASHBOARD_RESOURCE_URI,
        { mimeType: RESOURCE_MIME_TYPE },
        async () => ({
            contents: [
                {
                    uri: DASHBOARD_RESOURCE_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: uiHtml,
                },
            ],
        }),
    );

    registerAppTool(
        server,
        "open_x402_dashboard",
        {
            title: "Open x402 Payment Dashboard",
            description: "x402サーバーのステータスとWeatherを確認するダッシュボードを開く",
            inputSchema: {
                sessionId: z.string().optional(),
            },
            _meta: {
                ui: {
                    resourceUri: DASHBOARD_RESOURCE_URI,
                    csp: {
                        "default-src": ["'self'"],
                        "script-src": ["'self'", "https://esm.sh"],
                        "style-src": ["'self'", "'unsafe-inline'"],
                    },
                },
            },
        },
        async (params: { sessionId?: string }) => {
            const payload: { sessionId: string } = { sessionId: params.sessionId ?? randomUUID() };
            return {
                content: [
                    {
                        type: "text",
                        text: "x402 dashboard opened",
                    },
                ],
                structuredContent: payload,
            };
        },
    );

    server.registerTool(
        "x402_get_health",
        {
            title: "x402 Get Health",
            description: "x402サーバーのヘルスチェックを取得する",
            inputSchema: {},
            outputSchema: {
                ok: z.boolean(),
                statusCode: z.number(),
                body: z.unknown(),
            },
        },
        async () => {
            const response: X402ServerResponse = await x402ServerClient.getHealth();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response),
                    },
                ],
                structuredContent: response,
            };
        },
    );

    server.registerTool(
        "x402_get_weather",
        {
            title: "x402 Get Weather",
            description: "x402サーバーのWeatherを取得する",
            inputSchema: {},
            outputSchema: {
                ok: z.boolean(),
                statusCode: z.number(),
                body: z.unknown(),
            },
        },
        async () => {
            const response: X402ServerResponse = await x402ServerClient.getWeather();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response),
                    },
                ],
                structuredContent: response,
            };
        },
    );

    const transport: StreamableHTTPTransport = new StreamableHTTPTransport();

    app.all("/mcp", async (c: Context) => {
        if (!server.isConnected()) {
            await server.connect(transport);
        }
        return transport.handleRequest(c);
    });

    app.get("/", (c: Context) => c.json({ status: "ok", service: "x402-auto-pay-app" }));

    return { app, server };
};

const startServer = async (): Promise<void> => {
    const { app } = await createAppServer();
    const portNumber: number = parsePortNumber(process.env.PORT);
    try {
        serverInstance = Bun.serve({ fetch: app.fetch, port: portNumber });
    } catch {
        serverInstance = Bun.serve({ fetch: app.fetch, port: 0 });
    }
    console.log(`x402 auto-pay app listening on http://localhost:${serverInstance.port}`);
    process.stdin.resume();
    await new Promise<void>(() => undefined);
};

await startServer();
