export type EventCallback<T = void> = (data: T) => void;

/**
 * Type-safe event emitter for subscribing to typed events.
 * Uses Map<Set> for O(1) add/remove and deduplication.
 */
export class EventEmitter<TEvents extends object> {
    private listeners = new Map<keyof TEvents, Set<EventCallback<unknown>>>();

    on<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(callback as EventCallback<unknown>);
    }

    off<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): void {
        this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
    }

    emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        this.listeners.get(event)?.forEach(cb => void cb(data));
    }

    removeAllListeners<K extends keyof TEvents>(event?: K): void {
        event === undefined ? this.listeners.clear() : this.listeners.delete(event);
    }

    listenerCount<K extends keyof TEvents>(event: K): number {
        return this.listeners.get(event)?.size ?? 0;
    }
}