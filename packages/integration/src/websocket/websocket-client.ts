import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';

export interface WebSocketClientOptions {
    url: string;
    path?: string;
    transports?: string[];
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    timeout?: number;
    auth?: Record<string, any>;
}

export class WebSocketClient extends EventEmitter {
    private socket: Socket;
    private logger: Logger;
    private options: WebSocketClientOptions;
    private authenticated: boolean = false;
    private connected: boolean = false;

    constructor(options: WebSocketClientOptions) {
        super();
        this.options = options;
        this.logger = new Logger('WebSocketClient');

        this.socket = io(options.url, {
            path: options.path || '/ws',
            transports: options.transports || ['websocket', 'polling'],
            reconnection: options.reconnection ?? true,
            reconnectionAttempts: options.reconnectionAttempts || 5,
            reconnectionDelay: options.reconnectionDelay || 1000,
            timeout: options.timeout || 20000,
            auth: options.auth
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.socket.on('connect', () => {
            this.connected = true;
            this.logger.success(`Connected to WebSocket server: ${this.options.url}`);
            this.emit('connect');
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            this.authenticated = false;
            this.logger.warn(`Disconnected from WebSocket server: ${reason}`);
            this.emit('disconnect', reason);
        });

        this.socket.on('error', (error) => {
            this.logger.error(`WebSocket error: ${error}`);
            this.emit('error', error);
        });

        this.socket.on('reconnect', (attempt) => {
            this.logger.info(`Reconnected after ${attempt} attempts`);
            this.emit('reconnect', attempt);
        });

        this.socket.on('reconnect_attempt', (attempt) => {
            this.logger.debug(`Reconnection attempt ${attempt}`);
            this.emit('reconnect_attempt', attempt);
        });

        this.socket.on('reconnect_error', (error) => {
            this.logger.error(`Reconnection error: ${error}`);
            this.emit('reconnect_error', error);
        });

        this.socket.on('reconnect_failed', () => {
            this.logger.error('Reconnection failed');
            this.emit('reconnect_failed');
        });

        this.socket.on('authenticated', (data) => {
            this.authenticated = data.success;
            this.emit('authenticated', data);
        });

        // Handle custom events
        this.socket.onAny((event, ...args) => {
            this.emit(event, ...args);
        });
    }

    // ============ Authentication ============

    async authenticate(token: string): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket.emit('authenticate', token, (response: any) => {
                this.authenticated = response.success;
                resolve(response.success);
            });
        });
    }

    // ============ Connection Management ============

    connect(): void {
        this.socket.connect();
    }

    disconnect(): void {
        this.socket.disconnect();
    }

    reconnect(): void {
        this.socket.disconnect();
        this.socket.connect();
    }

    // ============ Room Management ============

    joinRoom(room: string): void {
        this.socket.emit('join', room);
    }

    leaveRoom(room: string): void {
        this.socket.emit('leave', room);
    }

    // ============ Messaging ============

    send(event: string, data: any): void {
        this.socket.emit(event, data);
    }

    emit(event: string, ...args: any[]): void {
        this.socket.emit(event, ...args);
    }

    on(event: string, handler: (...args: any[]) => void): void {
        this.socket.on(event, handler);
    }

    off(event: string, handler?: (...args: any[]) => void): void {
        this.socket.off(event, handler);
    }

    once(event: string, handler: (...args: any[]) => void): void {
        this.socket.once(event, handler);
    }

    // ============ Promise-based Requests ============

    request<T = any>(event: string, data?: any, timeout: number = 30000): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Request timeout: ${event}`));
            }, timeout);

            this.socket.emit(event, data, (response: any) => {
                clearTimeout(timeoutId);
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // ============ Status ============

    isConnected(): boolean {
        return this.connected;
    }

    isAuthenticated(): boolean {
        return this.authenticated;
    }

    getId(): string | undefined {
        return this.socket.id;
    }

    // ============ Cleanup ============

    removeAllListeners(event?: string): void {
        if (event) {
            this.socket.off(event);
        } else {
            this.socket.removeAllListeners();
        }
    }

    close(): void {
        this.removeAllListeners();
        this.disconnect();
    }
}