import { WebSocketStorageServer } from "../src";
import { DebugLogger } from "@paws/debug-logger";

const logger = new DebugLogger(process.env.DEBUG === "true" ? true : false)

if (process.env.PORT !== "3000" && typeof process.env.PORT !== "undefined") {
    logger.logWarn(`Internally listening on port 3000, but exposed as ${process.env.PORT}`)
}

logger.logDebug("Starting with: ", {
    port: 3000,
    storage: {
        url: `${process.env.REDIS_URL ?? "redis://localhost:6379"}`,
        database: Number(process.env.REDIS_DB) ?? 0
    },
})

const ws = new WebSocketStorageServer({
    port: 3000,
    storage: {
        url: `${process.env.REDIS_URL ?? "redis://localhost:6379"}`,
        database: Number(process.env.REDIS_DB) ?? 0
    },
    validateToken: async (token: string) => {
        return true;
    },
    logger
});

await ws.start().then(() => void logger.logInfo("WebSocket Storage Server running :3"));
