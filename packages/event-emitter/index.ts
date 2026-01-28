export type EventCallback<T = void> = (data: T) => void;

export class EventEmitter<TEvents extends Record<string, unknown>> {
    private listeners: Map<keyof TEvents, Set<EventCallback<unknown>>> = new Map();

    on<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback as EventCallback<unknown>);
    }

    off<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.delete(callback as EventCallback<unknown>);
            if (eventListeners.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${String(event)}:`, error);
                }
            });
        }
    }

    removeAllListeners<K extends keyof TEvents>(event?: K): void {
        if (event === undefined) {
            this.listeners.clear();
        } else {
            this.listeners.delete(event);
        }
    }

    listenerCount<K extends keyof TEvents>(event: K): number {
        return this.listeners.get(event)?.size ?? 0;
    }
}
