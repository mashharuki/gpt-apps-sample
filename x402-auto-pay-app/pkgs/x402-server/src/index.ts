import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { config } from "dotenv";
import { Hono } from "hono";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}` | undefined;
const facilitatorUrl = process.env.FACILITATOR_URL;
const missingConfig = {
  evmAddress: !evmAddress,
  facilitatorUrl: !facilitatorUrl,
};

const app = new Hono();

if (!missingConfig.evmAddress && !missingConfig.facilitatorUrl) {
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const payTo = evmAddress as `0x${string}`;
  app.use(
    paymentMiddleware(
      {
        "GET /weather": {
          accepts: [
            {
              scheme: "exact",
              price: "$0.001",
              network: "eip155:84532",
              payTo,
            },
          ],
          description: "Weather data",
          mimeType: "application/json",
        },
      },
      new x402ResourceServer(facilitatorClient).register("eip155:84532", new ExactEvmScheme()),
    ),
  );
}

app.get("/weather", c => {
  if (missingConfig.evmAddress || missingConfig.facilitatorUrl) {
    return c.json(
      {
        status: "error",
        message: "Missing required environment variables",
        missing: missingConfig,
      },
      503,
    );
  }
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.get("/health", c => {
  return c.json({
    status: "ok",
    missing: missingConfig,
  });
});

serve({
  fetch: app.fetch,
  port: 4021,
});

console.log(`Server listening at http://localhost:4021`);
