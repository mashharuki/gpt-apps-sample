import { StreamableHTTPTransport } from "@hono/mcp";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Context, Hono } from "hono";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type PaymentRecord = {
    id: string;
    amountCents: number;
    currency: string;
    description: string;
    status: PaymentStatus;
    createdAtIso: string;
    provider: string;
    externalId?: string;
};

const DEFAULT_PORT_NUMBER: number = 8787;
const DASHBOARD_RESOURCE_URI: string = "ui://x402/payment-dashboard";

let serverInstance: Bun.Server | null = null;

const paymentStoreById: Map<string, PaymentRecord> = new Map();

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

const normalizeCurrencyCode = (value: string): string => value.trim().toUpperCase();

const createPaymentRecord = (input: AutoPayInput, response: X402AutoPayResponse): PaymentRecord => ({
    id: randomUUID(),
    amountCents: input.amountCents,
    currency: normalizeCurrencyCode(input.currency),
    description: input.description,
    status: response.status,
    createdAtIso: new Date().toISOString(),
    provider: response.provider,
    externalId: response.externalId,
});

const createAppServer = async (): Promise<{ app: Hono; server: McpServer }> => {
    const app: Hono = new Hono();
    const server: McpServer = new McpServer({ name: "x402-auto-pay-app", version: "1.0.0" });

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
            description: "x402の自動支払いを行うダッシュボードを開く",
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
                        text: "x402 payment dashboard opened",
                    },
                ],
                structuredContent: payload,
            };
        },
    );

    server.registerTool(
        "x402_auto_pay",
        {
            title: "x402 Auto Pay",
            description: "x402で自動支払いを実行する",
            inputSchema: {
                amountCents: z.number().int().positive(),
                currency: z.string().min(3).max(3),
                description: z.string().min(1),
                customerId: z.string().optional(),
            },
            outputSchema: {
                payment: z.object({
                    id: z.string(),
                    amountCents: z.number().int(),
                    currency: z.string(),
                    description: z.string(),
                    status: z.string(),
                    createdAtIso: z.string(),
                    provider: z.string(),
                    externalId: z.string().optional(),
                }),
            },
        },
        async (input: AutoPayInput) => {
            const response: X402AutoPayResponse = await callX402AutoPay(input);
            const payment: PaymentRecord = createPaymentRecord(input, response);
            paymentStoreById.set(payment.id, payment);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(payment),
                    },
                ],
                structuredContent: { payment },
            };
        },
    );

    server.registerTool(
        "x402_list_payments",
        {
            title: "x402 List Payments",
            description: "支払い履歴を取得する",
            inputSchema: {},
            outputSchema: {
                payments: z.array(
                    z.object({
                        id: z.string(),
                        amountCents: z.number().int(),
                        currency: z.string(),
                        description: z.string(),
                        status: z.string(),
                        createdAtIso: z.string(),
                        provider: z.string(),
                        externalId: z.string().optional(),
                    }),
                ),
            },
        },
        async () => {
            const payments: PaymentRecord[] = Array.from(paymentStoreById.values()).sort((left, right) =>
                right.createdAtIso.localeCompare(left.createdAtIso),
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ payments }),
                    },
                ],
                structuredContent: { payments },
            };
        },
    );

    server.registerTool(
        "x402_get_payment",
        {
            title: "x402 Get Payment",
            description: "支払いの詳細を取得する",
            inputSchema: {
                paymentId: z.string(),
            },
            outputSchema: {
                payment: z
                    .object({
                        id: z.string(),
                        amountCents: z.number().int(),
                        currency: z.string(),
                        description: z.string(),
                        status: z.string(),
                        createdAtIso: z.string(),
                        provider: z.string(),
                        externalId: z.string().optional(),
                    })
                    .nullable(),
            },
        },
        async ({ paymentId }: { paymentId: string }) => {
            const payment: PaymentRecord | undefined = paymentStoreById.get(paymentId);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ payment: payment ?? null }),
                    },
                ],
                structuredContent: { payment: payment ?? null },
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
