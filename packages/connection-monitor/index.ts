export interface ConnectionMetrics {
    connectAttempts: number;
    connectSuccesses: number;
    connectFailures: number;
    disconnects: number;
    heartbeatSuccessCount: number;
    heartbeatFailureCount: number;
    messagesReceived: number;
    messagesSent: number;
    bytesReceived: number;
    bytesSent: number;
    averageLatency: number;
    lastHeartbeatLatency: number;
    uptime: number;
    lastConnectedAt: number | null;
    lastDisconnectedAt: number | null;
}

export class ConnectionMonitor {
    private metrics: ConnectionMetrics = {
        connectAttempts: 0,
        connectSuccesses: 0,
        connectFailures: 0,
        disconnects: 0,
        heartbeatSuccessCount: 0,
        heartbeatFailureCount: 0,
        messagesReceived: 0,
        messagesSent: 0,
        bytesReceived: 0,
        bytesSent: 0,
        averageLatency: 0,
        lastHeartbeatLatency: 0,
        uptime: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null
    };

    private heartbeatTimestamps: number[] = [];
    private maxHeartbeatHistory = 10;

    recordConnectAttempt(): void {
        this.metrics.connectAttempts++;
    }

    recordConnectSuccess(): void {
        this.metrics.connectSuccesses++;
        this.metrics.lastConnectedAt = Date.now();
        this.metrics.lastDisconnectedAt = null;
    }

    recordConnectFailure(): void {
        this.metrics.connectFailures++;
    }

    recordDisconnect(): void {
        this.metrics.disconnects++;
        this.metrics.lastDisconnectedAt = Date.now();

        if (this.metrics.lastConnectedAt !== null) {
            const sessionUptime = Date.now() - this.metrics.lastConnectedAt;
            this.metrics.uptime = sessionUptime;
        }
    }

    recordHeartbeatSuccess(latency: number): void {
        this.metrics.heartbeatSuccessCount++;
        this.metrics.lastHeartbeatLatency = latency;

        this.heartbeatTimestamps.push(latency);

        if (this.heartbeatTimestamps.length > this.maxHeartbeatHistory) {
            this.heartbeatTimestamps.shift();
        }

        this.updateAverageLatency();
    }

    recordHeartbeatFailure(): void {
        this.metrics.heartbeatFailureCount++;
    }

    recordMessageReceived(byteSize: number = 0): void {
        this.metrics.messagesReceived++;
        this.metrics.bytesReceived += byteSize;
    }

    recordMessageSent(byteSize: number = 0): void {
        this.metrics.messagesSent++;
        this.metrics.bytesSent += byteSize;
    }

    private updateAverageLatency(): void {
        if (this.heartbeatTimestamps.length === 0) {
            return;
        }

        const sum = this.heartbeatTimestamps.reduce((acc, val) => acc + val, 0);
        this.metrics.averageLatency = sum / this.heartbeatTimestamps.length;
    }

    getMetrics(): Readonly<ConnectionMetrics> {
        return { ...this.metrics };
    }

    getHealthStatus(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: {
            message: string;
            heartbeatSuccessRate: number;
            connectSuccessRate: number;
            averageLatency: number;
        };
    } {
        const totalHeartbeats = this.metrics.heartbeatSuccessCount + this.metrics.heartbeatFailureCount;
        const heartbeatSuccessRate = totalHeartbeats > 0
            ? (this.metrics.heartbeatSuccessCount / totalHeartbeats) * 100
            : 100;

        const connectSuccessRate = this.metrics.connectAttempts > 0
            ? (this.metrics.connectSuccesses / this.metrics.connectAttempts) * 100
            : 100;

        const details = {
            message: '',
            heartbeatSuccessRate,
            connectSuccessRate,
            averageLatency: this.metrics.averageLatency
        };

        if (heartbeatSuccessRate >= 95 && connectSuccessRate >= 90) {
            return {
                status: 'healthy',
                details: {
                    ...details,
                    message: 'Connection is healthy'
                }
            };
        }

        if (heartbeatSuccessRate >= 80 && connectSuccessRate >= 70) {
            return {
                status: 'degraded',
                details: {
                    ...details,
                    message: 'Connection quality is degraded'
                }
            };
        }

        return {
            status: 'unhealthy',
            details: {
                ...details,
                message: 'Connection is unhealthy'
            }
        };
    }

    reset(): void {
        this.metrics = {
            connectAttempts: 0,
            connectSuccesses: 0,
            connectFailures: 0,
            disconnects: 0,
            heartbeatSuccessCount: 0,
            heartbeatFailureCount: 0,
            messagesReceived: 0,
            messagesSent: 0,
            bytesReceived: 0,
            bytesSent: 0,
            averageLatency: 0,
            lastHeartbeatLatency: 0,
            uptime: 0,
            lastConnectedAt: null,
            lastDisconnectedAt: null
        };
        this.heartbeatTimestamps = [];
    }

    getUptime(): number {
        if (this.metrics.lastConnectedAt === null) {
            return 0;
        }

        if (this.metrics.lastDisconnectedAt !== null) {
            return this.metrics.uptime;
        }

        return Date.now() - this.metrics.lastConnectedAt;
    }
}
