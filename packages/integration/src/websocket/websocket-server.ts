import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import { Session } from '@nova/core/session';
import { SecurityManager } from '@nova/security/security-manager';

export interface WebSocketServerOptions {
    path?: string;
    cors?: {
        origin?: string | string[];
        credentials?: boolean;
    };
    pingTimeout?: number;
    pingInterval?: number;
    transports?: string[];
}

export interface WebSocketClient {
    id: string;
    socket: Socket;
    session?: Session;
    userId?: string;
    companyId?: string;
    connectedAt: Date;
    lastActivity: Date;
}

export class WebSocketServer extends EventEmitter {
    private io: SocketIOServer;
    private logger: Logger;
    private clients: Map<string, WebSocketClient> = new Map();
    private rooms: Map<string, Set<string>> = new Map();
    private securityManager: SecurityManager;

    constructor(httpServer: HTTPServer, options: WebSocketServerOptions = {}) {
        super();
        this.logger = new Logger('WebSocketServer');

        this.io = new SocketIOServer(httpServer, {
            path: options.path || '/ws',
            cors: options.cors || {
                origin: '*',
                credentials: true
            },
            pingTimeout: options.pingTimeout || 60000,
            pingInterval: options.pingInterval || 25000,
            transports: options.transports || ['websocket', 'polling']
        });

        this.securityManager = SecurityManager.getInstance();
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.io.on('connection', (socket: Socket) => {
            this.handleConnection(socket);
        });
    }

    private async handleConnection(socket: Socket): Promise<void> {
        const clientId = socket.id;
        
        const client: WebSocketClient = {
            id: clientId,
            socket,
            connectedAt: new Date(),
            lastActivity: new Date()
        };

        this.clients.set(clientId, client);
        this.logger.debug(`Client connected: ${clientId}`);

        socket.on('authenticate', async (token: string) => {
            try {
                const user = await this.securityManager.validateToken(token);
                if (user) {
                    client.session = await this.securityManager['application'].createSession(user);
                    client.userId = user.id;
                    
                    socket.emit('authenticated', { 
                        success: true, 
                        userId: user.id 
                    });
                    
                    this.logger.info(`Client authenticated: ${clientId} (${user.username})`);
                    this.emit('authenticated', client);
                }
            } catch (error) {
                socket.emit('authenticated', { 
                    success: false, 
                    error: error.message 
                });
            }
        });

        socket.on('join', (room: string) => {
            socket.join(room);
            
            if (!this.rooms.has(room)) {
                this.rooms.set(room, new Set());
            }
            this.rooms.get(room)!.add(clientId);
            
            this.logger.debug(`Client ${clientId} joined room: ${room}`);
            this.emit('joined', { clientId, room });
        });

        socket.on('leave', (room: string) => {
            socket.leave(room);
            
            const roomClients = this.rooms.get(room);
            if (roomClients) {
                roomClients.delete(clientId);
                if (roomClients.size === 0) {
                    this.rooms.delete(room);
                }
            }
            
            this.logger.debug(`Client ${clientId} left room: ${room}`);
            this.emit('left', { clientId, room });
        });

        socket.on('message', async (data: any) => {
            client.lastActivity = new Date();
            
            if (!client.session) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            this.emit('message', {
                clientId,
                data,
                timestamp: new Date()
            });
        });

        socket.on('disconnect', () => {
            this.handleDisconnect(clientId);
        });

        socket.on('error', (error) => {
            this.logger.error(`Socket error (${clientId}): ${error.message}`);
            this.emit('error', { clientId, error });
        });

        this.emit('connected', client);
    }

    private handleDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        
        if (client) {
            // Remove from rooms
            this.rooms.forEach((clients, room) => {
                if (clients.has(clientId)) {
                    clients.delete(clientId);
                    if (clients.size === 0) {
                        this.rooms.delete(room);
                    }
                }
            });

            // Close session
            if (client.session) {
                client.session.close().catch(error => {
                    this.logger.error(`Failed to close session: ${error.message}`);
                });
            }

            this.clients.delete(clientId);
            this.logger.debug(`Client disconnected: ${clientId}`);
            this.emit('disconnected', client);
        }
    }

    // ============ Public API ============

    broadcast(event: string, data: any): void {
        this.io.emit(event, data);
    }

    sendTo(clientId: string, event: string, data: any): boolean {
        const client = this.clients.get(clientId);
        if (client) {
            client.socket.emit(event, data);
            return true;
        }
        return false;
    }

    sendToRoom(room: string, event: string, data: any): void {
        this.io.to(room).emit(event, data);
    }

    sendToUser(userId: string, event: string, data: any): void {
        const userClients = Array.from(this.clients.values())
            .filter(c => c.userId === userId);
        
        userClients.forEach(client => {
            client.socket.emit(event, data);
        });
    }

    sendToCompany(companyId: string, event: string, data: any): void {
        const companyClients = Array.from(this.clients.values())
            .filter(c => c.companyId === companyId);
        
        companyClients.forEach(client => {
            client.socket.emit(event, data);
        });
    }

    createRoom(room: string): void {
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
            this.logger.debug(`Room created: ${room}`);
        }
    }

    deleteRoom(room: string): void {
        const clients = this.rooms.get(room);
        if (clients) {
            clients.forEach(clientId => {
                const client = this.clients.get(clientId);
                if (client) {
                    client.socket.leave(room);
                }
            });
            this.rooms.delete(room);
            this.logger.debug(`Room deleted: ${room}`);
        }
    }

    getClients(): WebSocketClient[] {
        return Array.from(this.clients.values());
    }

    getClient(clientId: string): WebSocketClient | undefined {
        return this.clients.get(clientId);
    }

    getClientsInRoom(room: string): WebSocketClient[] {
        const clientIds = this.rooms.get(room) || new Set();
        return Array.from(clientIds)
            .map(id => this.clients.get(id))
            .filter((c): c is WebSocketClient => c !== undefined);
    }

    getRooms(): string[] {
        return Array.from(this.rooms.keys());
    }

    getRoomSize(room: string): number {
        return this.rooms.get(room)?.size || 0;
    }

    getConnectionCount(): number {
        return this.clients.size;
    }

    async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.clients.values())
            .map(client => new Promise<void>((resolve) => {
                client.socket.disconnect();
                resolve();
            }));

        await Promise.all(disconnectPromises);
        this.clients.clear();
        this.rooms.clear();
        this.logger.info('All clients disconnected');
    }

    async shutdown(): Promise<void> {
        await this.disconnectAll();
        await this.io.close();
        this.logger.info('WebSocket server shutdown');
    }
}