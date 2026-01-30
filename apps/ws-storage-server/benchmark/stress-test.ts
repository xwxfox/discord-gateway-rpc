import { DebugLogger } from '@paws/debug-logger';
import { createStorage } from '@paws/storage/index';
import { z } from "zod";
import { WebSocketStorageServer } from '../src';
import type { BaseStorage } from '@paws/storage/adapters/base';

type StressTestScenario = 'many-users-few-collections' | 'many-users-many-collections' | 'server-restart';

interface StressTestConfig {
  scenario: StressTestScenario;
  userCount: number;
  collectionsPerUser: number;
  keysPerCollection: number;
  durationMs: number;
  port: number;
  redisUrl: string;
  redisDatabase: number;
}

interface PerformanceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  startTime: number;
  endTime: number;
  operationsPerSecond: number;
  writeCount: number;
  readCount: number;
  deleteCount: number;
  latencies: number[];
  errors: Error[];
}

interface TestData {
  value: unknown;
  hash: string;
  timestamp: number;
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomObject(depth: number = 0): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const keys = generateRandomNumber(3, 8);

  for (let i = 0; i < keys; i++) {
    const key = `key_${generateRandomString(8)}`;
    const type = generateRandomNumber(0, 4);

    switch (type) {
      case 0:
        obj[key] = generateRandomString(generateRandomNumber(5, 20));
        break;
      case 1:
        obj[key] = generateRandomNumber(0, 10000);
        break;
      case 2:
        obj[key] = Math.random() > 0.5;
        break;
      case 3:
        obj[key] = [generateRandomNumber(0, 100), generateRandomString(5), null];
        break;
      case 4:
        if (depth < 2) {
          obj[key] = generateRandomObject(depth + 1);
        } else {
          obj[key] = generateRandomString(10);
        }
        break;
    }
  }

  return obj;
}

function generateRandomArray(length: number): unknown[] {
  const arr: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const type = generateRandomNumber(0, 3);
    switch (type) {
      case 0:
        arr.push(generateRandomString(10));
        break;
      case 1:
        arr.push(generateRandomNumber(0, 1000));
        break;
      case 2:
        arr.push(Math.random() > 0.5);
        break;
      case 3:
        arr.push(generateRandomObject());
        break;
    }
  }
  return arr;
}

function generateRandomData(): unknown {
  const type = generateRandomNumber(0, 5);
  switch (type) {
    case 0:
      return generateRandomString(generateRandomNumber(5, 50));
    case 1:
      return generateRandomNumber(0, 100000);
    case 2:
      return Math.random() > 0.5;
    case 3:
      return generateRandomArray(generateRandomNumber(2, 10));
    case 4:
      return generateRandomObject();
    case 5:
      return {
        string: generateRandomString(15),
        number: generateRandomNumber(0, 500),
        boolean: Math.random() > 0.5,
        array: generateRandomArray(3),
        nested: generateRandomObject(1)
      };
    default:
      return generateRandomString(10);
  }
}

function hashData(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function validateStoredValue(original: unknown, retrieved: unknown): boolean {
  const originalHash = hashData(original);
  const retrievedHash = hashData(retrieved);
  return originalHash === retrievedHash;
}

class PerformanceTracker {
  private logger: DebugLogger;
  private operations: Array<{ operation: string; duration: number; success: boolean; error?: string }> = [];
  private startTime: number = Date.now();

  constructor(logger: DebugLogger) {
    this.logger = logger;
  }

  start(): void {
    this.startTime = Date.now();
    this.operations = [];
  }

  record(operation: string, duration: number, success: boolean, error?: Error): void {
    this.operations.push({
      operation,
      duration,
      success,
      error: error?.message
    });
  }

  getMetrics(): PerformanceMetrics {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    const successfulOps = this.operations.filter(op => op.success);
    const failedOps = this.operations.filter(op => !op.success);
    const writeOps = this.operations.filter(op => op.operation === 'write');
    const readOps = this.operations.filter(op => op.operation === 'read');
    const deleteOps = this.operations.filter(op => op.operation === 'delete');

    const latencies = successfulOps.map(op => op.duration);
    latencies.sort((a, b) => a - b);

    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    const avg = latencies.length > 0 ? latencies.reduce((sum, val) => sum + val, 0) / latencies.length : 0;
    const min = latencies.length > 0 ? latencies[0] : 0;
    const max = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

    return {
      totalOperations: this.operations.length,
      successfulOperations: successfulOps.length,
      failedOperations: failedOps.length,
      startTime: this.startTime,
      endTime,
      operationsPerSecond: (this.operations.length / totalDuration) * 1000,
      writeCount: writeOps.length,
      readCount: readOps.length,
      deleteCount: deleteOps.length,
      latencies,
      errors: failedOps.map(op => new Error(op.error || 'Unknown error'))
    };
  }

  logMetrics(scenario: string): void {
    const metrics = this.getMetrics();
    const duration = (metrics.endTime - metrics.startTime) / 1000;

    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo(`STRESS TEST METRICS: ${scenario}`);
    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo(`Duration: ${duration.toFixed(2)}s`);
    this.logger.logInfo(`Total Operations: ${metrics.totalOperations}`);
    this.logger.logInfo(`Successful: ${metrics.successfulOperations} (${((metrics.successfulOperations / metrics.totalOperations) * 100).toFixed(2)}%)`);
    this.logger.logInfo(`Failed: ${metrics.failedOperations} (${((metrics.failedOperations / metrics.totalOperations) * 100).toFixed(2)}%)`);
    this.logger.logInfo('');
    this.logger.logInfo(`Operations/Second: ${metrics.operationsPerSecond.toFixed(2)}`);
    this.logger.logInfo(`  - Writes: ${metrics.writeCount} (${(metrics.writeCount / duration).toFixed(2)} ops/sec)`);
    this.logger.logInfo(`  - Reads: ${metrics.readCount} (${(metrics.readCount / duration).toFixed(2)} ops/sec)`);
    this.logger.logInfo(`  - Deletes: ${metrics.deleteCount} (${(metrics.deleteCount / duration).toFixed(2)} ops/sec)`);
    this.logger.logInfo('');
    this.logger.logInfo('Latency (ms):');

    if (metrics.latencies.length > 0) {
      const p50 = metrics.latencies[Math.floor(metrics.latencies.length * 0.5)]!;
      const p95 = metrics.latencies[Math.floor(metrics.latencies.length * 0.95)]!;
      const p99 = metrics.latencies[Math.floor(metrics.latencies.length * 0.99)]!;
      const avg = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
      const min = metrics.latencies[0]!;
      const max = metrics.latencies[metrics.latencies.length - 1]!;

      this.logger.logInfo(`  - Avg: ${avg.toFixed(2)}`);
      this.logger.logInfo(`  - Min: ${min.toFixed(2)}`);
      this.logger.logInfo(`  - Max: ${max.toFixed(2)}`);
      this.logger.logInfo(`  - p50: ${p50.toFixed(2)}`);
      this.logger.logInfo(`  - p95: ${p95.toFixed(2)}`);
      this.logger.logInfo(`  - p99: ${p99.toFixed(2)}`);
    } else {
      this.logger.logInfo('  - N/A (no successful operations)');
    }

    this.logger.logInfo('='.repeat(60));
  }
}

class StressTestRunner {
  private logger: DebugLogger;
  private server: WebSocketStorageServer | null = null;
  private port: number;
  private redisUrl: string;
  private redisDatabase: number;
  private testData: Map<string, Map<string, Map<string, TestData>>> = new Map();

  constructor(logger: DebugLogger, port: number = 3000, redisUrl: string = 'redis://default:changeme@localhost:6769', redisDatabase: number = 1) {
    this.logger = logger;
    this.port = port;
    this.redisUrl = redisUrl;
    this.redisDatabase = redisDatabase;
  }

  async startServer(): Promise<void> {
    this.logger.logInfo('Starting WebSocket storage server...');
    this.server = new WebSocketStorageServer({
      port: this.port,
      storage: {
        url: `${this.redisUrl}/${this.redisDatabase}`,
        database: this.redisDatabase
      },
      validateToken: async (token: string) => {
        return true;
      },
      logger: this.logger
    });

    await this.server.start();
    this.logger.logInfo(`WebSocket storage server started on ws://localhost:${this.port}`);
  }

  async stopServer(): Promise<void> {
    this.logger.logInfo('Stopping WebSocket storage server...');
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    this.logger.logInfo('Server stopped');
  }

  async restartServer(): Promise<void> {
    this.logger.logInfo('Restarting WebSocket storage server...');
    await this.stopServer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startServer();
    this.logger.logInfo('WebSocket storage server restarted');
  }

  async runScenario(config: StressTestConfig): Promise<{ passed: boolean; metrics: PerformanceMetrics | null }> {
    this.logger.logInfo('');
    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo(`STRESS TEST: ${config.scenario}`);
    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo(`Users: ${config.userCount}`);
    this.logger.logInfo(`Collections/User: ${config.collectionsPerUser}`);
    this.logger.logInfo(`Keys/Collection: ${config.keysPerCollection}`);
    this.logger.logInfo(`Duration: ${config.durationMs / 1000}s`);
    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo('');

    const tracker = new PerformanceTracker(this.logger);
    tracker.start();

    const schema: Record<string, Record<string, z.ZodTypeAny>> = {};

    const users: Array<{ id: string; token: string; storage: BaseStorage }> = [];
    this.logger.logInfo(`Creating ${config.userCount} users...`);

    for (let i = 0; i < config.userCount; i++) {
      const userId = `user_${i}`;
      const token = `token_${generateRandomString(32)}`;

      this.logger.logDebug(`Connecting user ${i + 1}/${config.userCount} (${userId})...`);

      try {
        const storage = createStorage(
          "websocket",
          {
            url: `ws://localhost:${this.port}/ws`,
            reconnectInterval: 100,
            maxReconnectAttempts: 100,
            token
          },
          schema,
          this.logger
        );

        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            const wsAdapter = storage as any;
            if (wsAdapter.connected) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });

        users.push({ id: userId, token, storage: storage as BaseStorage });
        this.logger.logDebug(`User ${userId} connected`);
      } catch (error) {
        this.logger.logError(`Failed to connect user ${userId}:`, error);
        tracker.record('connect', 0, false, error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.logger.logInfo(`Connected ${users.length}/${config.userCount} users`);

    this.logger.logInfo('Waiting for all connections to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 500));

    this.testData.clear();
    for (const user of users) {
      this.testData.set(user.id, new Map());
      for (let c = 0; c < config.collectionsPerUser; c++) {
        const collection = `collection_${c}`;
        this.testData.get(user.id)!.set(collection, new Map());
        for (let k = 0; k < config.keysPerCollection; k++) {
          const key = `key_${k}`;
          const value = generateRandomData();
          this.testData.get(user.id)!.get(collection)!.set(key, {
            value,
            hash: hashData(value),
            timestamp: Date.now()
          });
        }
      }
    }

    this.logger.logInfo(`Generated test data for ${this.testData.size} users`);

    if (config.scenario !== 'server-restart') {
      this.logger.logInfo('Pre-populating storage with initial data...');
      await this.populateInitialData(users, tracker);
      this.logger.logInfo('Initial data populated successfully');
    }

    if (config.scenario === 'server-restart') {
      const result = await this.runServerRestartScenario(users, config, tracker, schema);
      return { passed: result, metrics: tracker.getMetrics() };
    }

    const endTime = Date.now() + config.durationMs;
    let operationsCompleted = 0;

    this.logger.logInfo(`Starting ${config.durationMs / 1000}s stress test...`);
    this.logger.logInfo('Hammering with reads and writes as fast as possible...');

    while (Date.now() < endTime) {
      const operationsPerBatch = 10;
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < operationsPerBatch; i++) {
        if (Date.now() >= endTime) break;

        const userIndex = generateRandomNumber(0, users.length - 1);
        const user = users[userIndex];
        if (!user) continue;

        const collectionIndex = generateRandomNumber(0, config.collectionsPerUser - 1);
        const collection = `collection_${collectionIndex}`;
        const keyIndex = generateRandomNumber(0, config.keysPerCollection - 1);
        const key = `key_${keyIndex}`;

        const operationType = generateRandomNumber(0, 2);

        const promise = this.executeOperation(user.storage, collection, key, operationType, tracker);
        batchPromises.push(promise);
      }

      await Promise.all(batchPromises);
      operationsCompleted += batchPromises.length;

      if (operationsCompleted % 500 === 0) {
        const elapsed = Date.now() - tracker.getMetrics().startTime;
        const remaining = endTime - Date.now();
        this.logger.logDebug(`Progress: ${operationsCompleted} ops completed, ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`);
      }
    }

    this.logger.logInfo('Validating data integrity...');
    const validationResult = await this.validateDataIntegrity(users, tracker, false);

    this.logger.logInfo('Closing all user connections...');
    for (const user of users) {
      try {
        await user.storage.close();
        this.logger.logDebug(`Closed user ${user.id}`);
      } catch (error) {
        this.logger.logError(`Failed to close user ${user.id}:`, error);
      }
    }

    tracker.logMetrics(config.scenario);

    if (validationResult) {
      this.logger.logInfo('[OK] Data integrity validation PASSED');
    } else {
      this.logger.logError('[ERR] Data integrity validation FAILED');
    }

    return { passed: validationResult, metrics: tracker.getMetrics() };
  }

  private async runServerRestartScenario(users: Array<{ id: string; token: string; storage: BaseStorage }>, config: StressTestConfig, tracker: PerformanceTracker, schema: any): Promise<boolean> {
    this.logger.logInfo('=== SERVER RESTART SCENARIO ===');

    this.logger.logInfo('Phase 1: Populating data...');
    let populatedCount = 0;

    for (const user of users) {
      for (let c = 0; c < config.collectionsPerUser; c++) {
        const collection = `collection_${c}`;
        for (let k = 0; k < config.keysPerCollection; k++) {
          const key = `key_${k}`;
          const testData = this.testData.get(user.id)!.get(collection)!.get(key)!;

          try {
            const start = Date.now();
            await user.storage.set(collection as any, key as any, testData.value);
            tracker.record('write', Date.now() - start, true);
            populatedCount++;
          } catch (error) {
            tracker.record('write', 0, false, error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }

    this.logger.logInfo(`Populated ${populatedCount} items`);

    this.logger.logInfo('Phase 2: Validating initial data...');
    const initialValidation = await this.validateDataIntegrity(users, tracker, true);
    if (!initialValidation) {
      this.logger.logError('Initial validation failed!');
      return false;
    }
    this.logger.logInfo('[OK] Initial validation PASSED');

    this.logger.logInfo('Phase 3: Stopping server...');
    await this.stopServer();

    this.logger.logInfo('Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.logger.logInfo('Phase 4: Restarting server...');
    await this.startServer();

    this.logger.logInfo('Phase 5: Waiting for reconnections...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.logger.logInfo('Phase 6: Validating data recovery...');
    const recoveryValidation = await this.validateDataIntegrity(users, tracker, true);

    if (!recoveryValidation) {
      this.logger.logError('Recovery validation failed!');
      return false;
    }
    this.logger.logInfo('[OK] Recovery validation PASSED');

    this.logger.logInfo('Phase 7: Performing post-recovery operations...');
    let opsCompleted = 0;
    const targetOps = 500;

    while (opsCompleted < targetOps) {
      const userIndex = generateRandomNumber(0, users.length - 1);
      const user = users[userIndex];
      if (!user) continue;

      const collectionIndex = generateRandomNumber(0, config.collectionsPerUser - 1);
      const collection = `collection_${collectionIndex}`;
      const keyIndex = generateRandomNumber(0, config.keysPerCollection - 1);
      const key = `key_${keyIndex}`;

      const operationType = generateRandomNumber(0, 1);

      try {
        const start = Date.now();
        if (operationType === 0) {
          await user.storage.set(collection as any, key as any, generateRandomData());
          tracker.record('write', Date.now() - start, true);
        } else {
          await user.storage.get(collection as any, key as any);
          tracker.record('read', Date.now() - start, true);
        }
        opsCompleted++;
      } catch (error) {
        tracker.record(operationType === 0 ? 'write' : 'read', 0, false, error instanceof Error ? error : new Error(String(error)));
      }

      if (opsCompleted % 50 === 0) {
        this.logger.logDebug(`Post-recovery ops: ${opsCompleted}/${targetOps}`);
      }
    }

    this.logger.logInfo(`Post-recovery operations completed: ${opsCompleted}`);

    this.logger.logInfo('Closing all user connections...');
    for (const user of users) {
      try {
        await user.storage.close();
      } catch (error) {
        this.logger.logError(`Failed to close user ${user.id}:`, error);
      }
    }

    tracker.logMetrics(config.scenario);

    return recoveryValidation;
  }

  private async executeOperation(storage: BaseStorage, collection: string, key: string, operationType: number, tracker: PerformanceTracker): Promise<void> {
    const start = Date.now();

    try {
      if (operationType === 0) {
        const value = generateRandomData();
        await storage.set(collection as any, key as any, value);
        tracker.record('write', Date.now() - start, true);
      } else if (operationType === 1) {
        await storage.get(collection as any, key as any);
        tracker.record('read', Date.now() - start, true);
      } else {
        await storage.delete(collection as any, key as any);
        tracker.record('delete', Date.now() - start, true);
      }
    } catch (error) {
      const operationName = operationType === 0 ? 'write' : operationType === 1 ? 'read' : 'delete';
      tracker.record(operationName, Date.now() - start, false, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async close(): Promise<void> {
    if (this.server) {
      this.logger.logInfo('Closing stress test runner...');
      await this.server.stop();
      this.server = null;
    }
  }

  private async populateInitialData(users: Array<{ id: string; token: string; storage: BaseStorage }>, tracker: PerformanceTracker): Promise<void> {
    let populatedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      const userData = this.testData.get(user.id);
      if (!userData) {
        this.logger.logDebug(`No test data for user ${user.id}`);
        continue;
      }

      for (const [collection, keyMap] of userData.entries()) {
        for (const [key, testData] of keyMap.entries()) {
          try {
            const start = Date.now();
            await user.storage.set(collection as any, key as any, testData.value);
            tracker.record('write', Date.now() - start, true);
            populatedCount++;
          } catch (error) {
            errorCount++;
            this.logger.logError(`Failed to set ${user.id}.${collection}.${key}:`, error);
            tracker.record('write', 0, false, error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }

    this.logger.logInfo(`Populated ${populatedCount} items to storage, ${errorCount} errors`);
  }

  private async validateDataIntegrity(users: Array<{ id: string; token: string; storage: BaseStorage }>, tracker: PerformanceTracker, strictValidation: boolean): Promise<boolean> {
    let validatedCount = 0;
    let failedCount = 0;
    let checkedCount = 0;
    const totalExpected = this.testData.size * Array.from(this.testData.values()).reduce((sum, collMap) => sum + Array.from(collMap.values()).reduce((sum2, keyMap) => sum2 + keyMap.size, 0), 0);

    this.logger.logDebug(`Validating ${totalExpected} data points (strict: ${strictValidation})...`);

    for (const user of users) {
      const userData = this.testData.get(user.id);
      if (!userData) continue;

      for (const [collection, keyMap] of userData.entries()) {
        for (const [key, testData] of keyMap.entries()) {
          try {
            const start = Date.now();
            const retrieved = await user.storage.get(collection as any, key as any);
            tracker.record('read', Date.now() - start, true);
            checkedCount++;

            if (retrieved === null) {
              if (strictValidation) {
                this.logger.logDebug(`[ERR] Missing data: ${user.id}.${collection}.${key}`);
                failedCount++;
              }
            } else if (!validateStoredValue(testData.value, retrieved)) {
              if (strictValidation) {
                this.logger.logDebug(`[ERR] Data mismatch: ${user.id}.${collection}.${key}`);
                failedCount++;
              } else {
                validatedCount++;
              }
            } else {
              validatedCount++;
            }
          } catch (error) {
            this.logger.logError(`Error validating ${user.id}.${collection}.${key}:`, error);
            if (strictValidation) {
              failedCount++;
            }
            tracker.record('read', 0, false, error instanceof Error ? error : new Error(String(error)));
          }

          if (checkedCount % 100 === 0) {
            this.logger.logDebug(`Validation progress: ${checkedCount}/${totalExpected}`);
          }
        }
      }
    }

    const successRate = checkedCount > 0 ? (validatedCount / checkedCount) * 100 : 100;
    this.logger.logDebug(`Validation complete: ${validatedCount} passed, ${failedCount} failed, ${checkedCount} checked (${successRate.toFixed(2)}%)`);

    return failedCount === 0;
  }
}

async function findAvailablePort(startPort: number): Promise<number> {
  const server = Bun.serve({
    port: startPort,
    fetch() {
      return new Response("OK");
    }
  });
  const actualPort = server.port ?? startPort;
  await server.stop(true);
  return actualPort;
}

async function main() {
  const logger = new DebugLogger(true);
  logger.logInfo('Starting WebSocket Storage Stress Test');
  logger.logInfo('='.repeat(60));

  const availablePort = await findAvailablePort(3001);
  logger.logInfo(`Using available port: ${availablePort}`);

  const runner = new StressTestRunner(logger, availablePort, 'redis://default:changeme@localhost:6769', 0);

  try {
    await runner.startServer();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const scenarios: Array<{ name: StressTestScenario; config: Omit<StressTestConfig, 'scenario'> }> = [
      {
        name: 'many-users-few-collections',
        config: {
          userCount: 50,
          collectionsPerUser: 3,
          keysPerCollection: 15,
          durationMs: 60000,
          port: availablePort,
          redisUrl: 'redis://default:changeme@localhost:6769',
          redisDatabase: 0
        }
      },
      {
        name: 'many-users-many-collections',
        config: {
          userCount: 30,
          collectionsPerUser: 12,
          keysPerCollection: 8,
          durationMs: 60000,
          port: availablePort,
          redisUrl: 'redis://default:changeme@localhost:6769',
          redisDatabase: 0
        }
      },
      {
        name: 'server-restart',
        config: {
          userCount: 20,
          collectionsPerUser: 5,
          keysPerCollection: 10,
          durationMs: 60000,
          port: availablePort,
          redisUrl: 'redis://default:changeme@localhost:6769',
          redisDatabase: 0
        }
      }
    ];

    const results: Array<{ scenario: StressTestScenario; passed: boolean; metrics: PerformanceMetrics | null }> = [];

    for (const scenario of scenarios) {
      logger.logInfo('');
      logger.logInfo('='.repeat(60));
      logger.logInfo(`Running scenario: ${scenario.name}`);
      logger.logInfo('='.repeat(60));

      try {
        const { passed, metrics } = await runner.runScenario({ ...scenario.config, scenario: scenario.name });
        results.push({ scenario: scenario.name, passed, metrics });
      } catch (error) {
        logger.logError(`Scenario ${scenario.name} failed with error:`, error);
        results.push({ scenario: scenario.name, passed: false, metrics: null });
      }

      logger.logInfo('Waiting 2 seconds before next scenario...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await runner.close();

    logger.logInfo('');
    logger.logInfo('='.repeat(60));
    logger.logInfo('Results');
    logger.logInfo('='.repeat(60));

    for (const result of results) {
      const status = result.passed ? '[OK] PASSED' : '[ERR] FAILED';
      logger.logInfo('');
      logger.logInfo(`${result.scenario}: ${status}`);

      if (result.metrics) {
        const duration = (result.metrics.endTime - result.metrics.startTime) / 1000;
        logger.logInfo(`  Duration: ${duration.toFixed(2)}s`);
        logger.logInfo(`  Total Operations: ${result.metrics.totalOperations}`);
        logger.logInfo(`  Operations/Second: ${result.metrics.operationsPerSecond.toFixed(2)}`);
        logger.logInfo(`  Breakdown: ${result.metrics.writeCount} writes, ${result.metrics.readCount} reads, ${result.metrics.deleteCount} deletes`);

        if (result.metrics.latencies.length > 0) {
          const p50 = result.metrics.latencies[Math.floor(result.metrics.latencies.length * 0.5)]!;
          const p95 = result.metrics.latencies[Math.floor(result.metrics.latencies.length * 0.95)]!;
          const p99 = result.metrics.latencies[Math.floor(result.metrics.latencies.length * 0.99)]!;
          const avg = result.metrics.latencies.reduce((a, b) => a + b, 0) / result.metrics.latencies.length;
          logger.logInfo(`  Latency (ms): avg=${avg.toFixed(2)}, p50=${p50.toFixed(2)}, p95=${p95.toFixed(2)}, p99=${p99.toFixed(2)}`);
        }

        if (result.metrics.failedOperations > 0) {
          logger.logInfo(`  Failed Operations: ${result.metrics.failedOperations} (${((result.metrics.failedOperations / result.metrics.totalOperations) * 100).toFixed(2)}%)`);
        }
      }
    }

    const allPassed = results.every(r => r.passed);
    logger.logInfo('='.repeat(60));
    logger.logInfo(allPassed ? 'All tests PASSED [OK]' : 'Some tests FAILED [ERR]');
    logger.logInfo('='.repeat(60));

    await Bun.file("./testing/logs_for_stress_tests.log").write(logger.getLogsPretty());
    logger.logInfo('Logs written to: ./testing/logs_for_stress_tests.log');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    logger.logError('Stress test failed:', error);
    await runner.close();
    process.exit(1);
  }
}

main();
