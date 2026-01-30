type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: number;
    direction: 'incoming' | 'outgoing' | 'internal';
    stage: string;
    level: LogLevel;
    message: string;
    data?: unknown;
}

export class DebugLogger {
    private enabled: boolean;
    private logs: LogEntry[] = [];
    private maxLogs = 1000;
    private wsDebugEnabled: boolean;

    constructor(wsDebugEnabled?: boolean) {
        this.enabled = true
        this.wsDebugEnabled = wsDebugEnabled ?? process.env.WSDEBUG === 'true';
    }

    enable(): void {
        this.enabled = true;
        this.wsDebugEnabled = true;
    }

    disable(): void {
        this.enabled = false;
    }

    logIncoming(payload: unknown, stage: 'application' | 'websocket' | 'network'): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'incoming',
            stage,
            level: 'debug',
            message: 'Received gateway payload',
            data: payload
        });
    }

    logOutgoing(op: number | string, data: unknown, stage: 'application' | 'websocket' | 'network'): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'outgoing',
            stage,
            level: 'debug',
            message: `Sending gateway payload (op: ${op})`,
            data: { op, data }
        });
    }

    logStateChange(state: string, data?: unknown): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'internal',
            stage: 'state',
            level: 'info',
            message: `State changed to: ${state}`,
            data
        });
    }

    logError(message: string, error?: unknown): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'internal',
            stage: 'error',
            level: 'error',
            message,
            data: error
        });
    }

    logWarn(message: string, data?: unknown): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'internal',
            stage: 'warning',
            level: 'warn',
            message,
            data
        });
    }

    logInfo(message: string, data?: unknown): void {
        if (!this.enabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'internal',
            stage: 'info',
            level: 'info',
            message,
            data
        });
    }

    logDebug(message: string, data?: unknown): void {
        if (!this.enabled || !this.wsDebugEnabled) return;

        this.addLog({
            timestamp: Date.now(),
            direction: 'internal',
            stage: 'debug',
            level: 'debug',
            message,
            data
        });
    }

    private addLog(entry: LogEntry): void {
        this.logs.push(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        console.log(this.formatLogEntry(entry));
    }

    private formatLogEntry(entry: LogEntry): string {
        const timestamp = new Date(entry.timestamp).toISOString();
        const directionIcon =
            entry.direction === 'incoming' ? '[IN ]' :
                entry.direction === 'outgoing' ? '[OUT]' :
                    '[INT]';
        const stage = `[${entry.stage}]`;

        let message = `[${timestamp}] ${directionIcon} ${stage} ${entry.message}`;

        if (entry.data !== undefined) {
            const dataString = JSON.stringify(entry.data, null, 2);
            message += ` ${dataString}`;
        }

        return message;
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    getLogsPretty(): string {
        return this.logs.map((entry) => this.formatLogEntry(entry)).join("\n")
    }

    clearLogs(): void {
        this.logs = [];
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    isWSDebugEnabled(): boolean {
        return this.wsDebugEnabled;
    }
}
