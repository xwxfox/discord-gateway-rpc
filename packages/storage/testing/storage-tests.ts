import { DebugLogger } from '@paws/debug-logger';
import { createStorage } from '../index';
import { z } from "zod";
import { WebSocketStorageServer } from '../../../apps/ws-storage-server/src';
function getSelfName(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;

  const line = stack.split('\n')[2]; // caller
  return line?.match(/at (\w+)/)?.[1];
}
const schema = {
  test: {
    data: z.object({
      message: z.string(),
      timestamp: z.number()
    }),
    w: z.object({
      message: z.string(),
      timestamp: z.number()
    }),
  }
} as const;
const logger = new DebugLogger(true)
const sep = () => {
  logger.logInfo(`${"=".repeat(20)}${"\n".repeat(3)}`)
}

async function testRedis() {
  logger.logInfo("start test", getSelfName())
  try {
    const storage = createStorage('redis', {
      url: 'redis://localhost:6379',
      database: 0
    }, schema, logger);

    await storage.set('test', 'data', {
      message: 'Hello from Redis!',
      timestamp: Date.now()
    });

    const data = await storage.get('test', 'data');
    logger.logDebug('Redis adapter test:', data);

    const hasData = await storage.has('test', 'data');
    logger.logDebug('Has data:', hasData);

    const keys = await storage.keys('test');
    logger.logDebug('Keys:', keys);

    const size = await storage.size('test');
    logger.logDebug('Size:', size);

    await storage.close();
  } catch (error) {
    logger.logError('Redis test failed (Redis might not be running):', error);
  }
}
async function testMem() {
  logger.logInfo("start test", getSelfName())
  try {
    const storage = createStorage('memory', {}, schema, logger);

    await storage.set('test', 'data', {
      message: 'Hello from memory!',
      timestamp: Date.now()
    });

    const data = await storage.get('test', 'data');
    logger.logDebug('memory adapter test:', data);

    const hasData = await storage.has('test', 'data');
    logger.logDebug('Has data:', hasData);

    const keys = await storage.keys('test');
    logger.logDebug('Keys:', keys);

    const size = await storage.size('test');
    logger.logDebug('Size:', size);

    await storage.close();
  } catch (error) {
    logger.logError('memory test failed:', error);
  }
}
async function testFile() {
  logger.logInfo("start test", getSelfName())
  try {
    const storage = createStorage("file", {
      basePath: "./testing/fstest"
    }, schema, logger);

    await storage.set('test', 'data', {
      message: 'Hello from fs!',
      timestamp: Date.now()
    });

    const data = await storage.get('test', 'data');
    logger.logDebug('fs adapter test:', data);

    const hasData = await storage.has('test', 'data');
    logger.logDebug('Has data:', hasData);

    const keys = await storage.keys('test');
    logger.logDebug('Keys:', keys);

    const size = await storage.size('test');
    logger.logDebug('Size:', size);

    await storage.close();
  } catch (error) {
    logger.logError('fs test failed:', error);
  }
}
async function testWs() {
  logger.logInfo("start test", getSelfName())

  try {
    const remoteEvents: { [key: string]: number } = {
      'client1': 0,
      'client2': 0,
      'client3': 0
    };

    const storage = createStorage(
      "websocket",
      {
        url: "ws://localhost:6970/ws",
        reconnectInterval: 1000,
        maxReconnectAttempts: 10,
        token: "meow moew meow"
      },
      schema,
      logger
    );

    storage.on("connected", () => {
      logger.logDebug("Client 1 connected to storage ws");
    });

    storage.on("remote", (data) => {
      remoteEvents['client1'] = (remoteEvents['client1'] || 0) + 1;
      logger.logDebug(`Client 1 - Remote update received (#${remoteEvents['client1']}):`, data);
    });

    storage.on("error", (error) => {
      logger.logError("Client 1 - Storage error:", error);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // second client to test remote events
    const storage2 = createStorage(
      "websocket",
      {
        url: "ws://localhost:6970/ws",
        reconnectInterval: 1000,
        maxReconnectAttempts: 10,
        token: "meow moew meow"
      },
      schema,
      logger
    );

    storage2.on("connected", () => {
      logger.logDebug("Client 2 connected to storage ws");
    });

    storage2.on("remote", (data) => {
      remoteEvents['client2'] = (remoteEvents['client2'] || 0) + 1;
      logger.logDebug(`Client 2 - Remote update received (#${remoteEvents['client2']}):`, data);
    });

    storage2.on("error", (error) => {
      logger.logError("Client 2 - Storage error:", error);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Create client 3
    const storage3 = createStorage(
      "websocket",
      {
        url: "ws://localhost:6970/ws",
        reconnectInterval: 1000,
        maxReconnectAttempts: 10,
        token: "meow moew meow"
      },
      schema,
      logger
    );

    storage3.on("connected", () => {
      logger.logDebug("Client 3 connected to storage ws");
    });

    storage3.on("remote", (data) => {
      remoteEvents['client3'] = (remoteEvents['client3'] || 0) + 1;
      logger.logDebug(`Client 3 - Remote update received (#${remoteEvents['client3']}):`, data);
    });

    storage3.on("error", (error) => {
      logger.logError("Client 3 - Storage error:", error);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    logger.logDebug("Client 1 sets data");
    await storage.set('test', 'data', {
      message: 'Hello from client 1!',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.logDebug("Client 3 reads data");
    const dataFrom3 = await storage3.get('test', 'data');
    logger.logDebug('Client 3 read:', dataFrom3);

    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.logDebug("Client 2 sets data");
    await storage2.set('test', 'data', {
      message: 'Hello from client 2!',
      timestamp: Date.now()
    });
    await storage2.set('test', 'w', {
      message: 'Hello from client 2!',
      timestamp: Date.now()
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.logDebug("Results:")
    logger.logDebug(`Client 1 received ${remoteEvents['client1']} remote events (expected: 1)`);
    logger.logDebug(`Client 2 received ${remoteEvents['client2']} remote events (expected: 1)`);
    logger.logDebug(`Client 3 received ${remoteEvents['client3']} remote events (expected: 2)`);

    const data = await storage.get('test', 'data');
    logger.logDebug('ws adapter test:', data);

    await storage3.close();
    await storage2.close();

    const hasData = await storage.has('test', 'data');
    logger.logDebug('Has data:', hasData);

    const keys = await storage.keys('test');
    logger.logDebug('Keys:', keys);

    const size = await storage.size('test');
    logger.logDebug('Size:', size);

    await storage.close();
  } catch (error) {
    logger.logError('ws test failed:', error);
  }
}

await testRedis().catch(logger.logError).finally(sep)
await testMem().catch(logger.logError).finally(sep)
await testFile().catch(logger.logError).finally(sep)
await testWs().catch(logger.logError).finally(sep)


logger.logInfo("Finished");

await Bun.file("./testing/logs_for_storage_tests.log").write(logger.getLogsPretty())
process.exit(0)