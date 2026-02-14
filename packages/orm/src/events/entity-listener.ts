import { Record } from '../record';
import { ORMEvents } from './orm-events';

export interface EntityListenerMetadata {
    entity: string;
    event: EntityEventType;
    method: string;
    priority?: number;
}

export type EntityEventType = 
    | 'beforeInsert'
    | 'afterInsert'
    | 'beforeUpdate'
    | 'afterUpdate'
    | 'beforeDelete'
    | 'afterDelete'
    | 'beforeLoad'
    | 'afterLoad'
    | 'beforeValidate'
    | 'afterValidate';

export interface EntityEvent<T = any> {
    entity: string;
    record: Record<T>;
    data?: T;
    oldData?: T;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export class EntityListener {
    private listeners: Map<string, Map<EntityEventType, ListenerHandler[]>> = new Map();
    private ormEvents: ORMEvents;

    constructor(ormEvents: ORMEvents) {
        this.ormEvents = ormEvents;
        this.setupDefaultListeners();
    }

    // ============ Listener Registration ============

    registerListener(
        entity: string,
        event: EntityEventType,
        handler: ListenerHandler,
        priority: number = 0
    ): string {
        if (!this.listeners.has(entity)) {
            this.listeners.set(entity, new Map());
        }

        const entityListeners = this.listeners.get(entity)!;
        
        if (!entityListeners.has(event)) {
            entityListeners.set(event, []);
        }

        const handlers = entityListeners.get(event)!;
        const listenerId = this.generateListenerId(entity, event);
        
        handlers.push({
            id: listenerId,
            handler,
            priority
        });

        // Sort by priority
        handlers.sort((a, b) => b.priority - a.priority);

        return listenerId;
    }

    unregisterListener(listenerId: string): boolean {
        for (const [entity, entityListeners] of this.listeners) {
            for (const [event, handlers] of entityListeners) {
                const index = handlers.findIndex(h => h.id === listenerId);
                if (index !== -1) {
                    handlers.splice(index, 1);
                    return true;
                }
            }
        }
        return false;
    }

    unregisterAll(entity?: string): void {
        if (entity) {
            this.listeners.delete(entity);
        } else {
            this.listeners.clear();
        }
    }

    // ============ Event Execution ============

    async beforeInsert<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('beforeInsert', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async afterInsert<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('afterInsert', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async beforeUpdate<T>(record: Record<T>, oldData?: T): Promise<void> {
        await this.executeListeners('beforeUpdate', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            oldData,
            timestamp: new Date()
        });
    }

    async afterUpdate<T>(record: Record<T>, oldData?: T): Promise<void> {
        await this.executeListeners('afterUpdate', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            oldData,
            timestamp: new Date()
        });
    }

    async beforeDelete<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('beforeDelete', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async afterDelete<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('afterDelete', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async beforeLoad<T>(entity: string, id: string): Promise<void> {
        await this.executeListeners('beforeLoad', {
            entity,
            record: null as any,
            data: { id },
            timestamp: new Date()
        });
    }

    async afterLoad<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('afterLoad', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async beforeValidate<T>(record: Record<T>): Promise<void> {
        await this.executeListeners('beforeValidate', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            timestamp: new Date()
        });
    }

    async afterValidate<T>(record: Record<T>, isValid: boolean): Promise<void> {
        await this.executeListeners('afterValidate', {
            entity: record.getMetadata().name,
            record,
            data: record.getData(),
            metadata: { isValid },
            timestamp: new Date()
        });
    }

    private async executeListeners<T>(
        event: EntityEventType,
        eventData: EntityEvent<T>
    ): Promise<void> {
        const entityListeners = this.listeners.get(eventData.entity);
        
        if (!entityListeners) return;

        const handlers = entityListeners.get(event);
        
        if (!handlers) return;

        for (const listener of handlers) {
            try {
                await listener.handler(eventData);
            } catch (error) {
                console.error(`Error in entity listener ${listener.id}:`, error);
                
                await this.ormEvents.emit('entity:listenerError', {
                    entity: eventData.entity,
                    event,
                    listener: listener.id,
                    error: error.message,
                    timestamp: new Date()
                });

                throw error;
            }
        }
    }

    // ============ Default Listeners ============

    private setupDefaultListeners(): void {
        // Audit timestamps
        this.registerListener('*', 'beforeInsert', async (event) => {
            if (!event.record.getField('SystemCreatedAt')) {
                event.record.setField('SystemCreatedAt', new Date());
            }
        }, 1000);

        this.registerListener('*', 'beforeUpdate', async (event) => {
            event.record.setField('SystemModifiedAt', new Date());
        }, 1000);

        // Version increment
        this.registerListener('*', 'beforeUpdate', async (event) => {
            const version = event.record.getField('SystemRowVersion') || 0;
            event.record.setField('SystemRowVersion', version + 1);
        }, 900);

        // Soft delete
        this.registerListener('*', 'beforeDelete', async (event) => {
            // Allow override for hard delete
            if (!event.metadata?.hardDelete) {
                event.record.setField('SystemDeletedAt', new Date());
                await event.record.modify();
                throw new Error('Soft delete handled, stopping execution');
            }
        }, 800);
    }

    // ============ Helper Methods ============

    private generateListenerId(entity: string, event: string): string {
        return `${entity}_${event}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getListeners(entity?: string): Map<string, Map<EntityEventType, ListenerHandler[]>> {
        if (entity) {
            const result = new Map<string, Map<EntityEventType, ListenerHandler[]>>();
            const entityListeners = this.listeners.get(entity);
            if (entityListeners) {
                result.set(entity, entityListeners);
            }
            
            // Add global listeners
            const globalListeners = this.listeners.get('*');
            if (globalListeners) {
                result.set('*', globalListeners);
            }
            
            return result;
        }
        
        return new Map(this.listeners);
    }

    hasListeners(entity: string, event?: EntityEventType): boolean {
        const entityListeners = this.listeners.get(entity);
        if (!entityListeners) return false;

        if (event) {
            return entityListeners.has(event) && entityListeners.get(event)!.length > 0;
        }

        return entityListeners.size > 0;
    }

    clear(): void {
        this.listeners.clear();
        this.setupDefaultListeners();
    }
}

export interface ListenerHandler {
    id: string;
    handler: (event: EntityEvent) => Promise<void>;
    priority: number;
}

// ============ Decorators ============

export function BeforeInsert(): MethodDecorator {
    return createListenerDecorator('beforeInsert');
}

export function AfterInsert(): MethodDecorator {
    return createListenerDecorator('afterInsert');
}

export function BeforeUpdate(): MethodDecorator {
    return createListenerDecorator('beforeUpdate');
}

export function AfterUpdate(): MethodDecorator {
    return createListenerDecorator('afterUpdate');
}

export function BeforeDelete(): MethodDecorator {
    return createListenerDecorator('beforeDelete');
}

export function AfterDelete(): MethodDecorator {
    return createListenerDecorator('afterDelete');
}

export function BeforeLoad(): MethodDecorator {
    return createListenerDecorator('beforeLoad');
}

export function AfterLoad(): MethodDecorator {
    return createListenerDecorator('afterLoad');
}

export function BeforeValidate(): MethodDecorator {
    return createListenerDecorator('beforeValidate');
}

export function AfterValidate(): MethodDecorator {
    return createListenerDecorator('afterValidate');
}

function createListenerDecorator(event: EntityEventType): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const entityName = target.constructor.name;
        
        if (!target.__listeners) {
            target.__listeners = [];
        }

        target.__listeners.push({
            entity: entityName,
            event,
            method: propertyKey as string,
            handler: descriptor.value
        });
    };
}