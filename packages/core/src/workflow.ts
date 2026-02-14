import { EventEmitter } from 'events';
import { Session } from './session';
import { Record } from '@nova/orm/record';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowEngine extends EventEmitter {
    private workflows: Map<string, WorkflowDefinition> = new Map();
    private instances: Map<string, WorkflowInstance> = new Map();
    private tasks: Map<string, WorkflowTask> = new Map();

    async registerWorkflow(definition: WorkflowDefinition): Promise<string> {
        const workflowId = definition.id || uuidv4();
        
        // Validate workflow
        this.validateWorkflow(definition);
        
        this.workflows.set(workflowId, {
            ...definition,
            id: workflowId,
            status: WorkflowStatus.Active,
            createdAt: new Date()
        });
        
        this.emit('workflowRegistered', {
            workflowId,
            name: definition.name,
            timestamp: new Date()
        });
        
        return workflowId;
    }

    async startWorkflow(
        workflowId: string,
        context: WorkflowContext,
        session: Session
    ): Promise<string> {
        const workflow = this.workflows.get(workflowId);
        
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.status !== WorkflowStatus.Active) {
            throw new Error(`Workflow is not active: ${workflow.status}`);
        }

        const instance: WorkflowInstance = {
            id: uuidv4(),
            workflowId,
            status: WorkflowInstanceStatus.Running,
            context,
            session,
            startedAt: new Date(),
            currentState: workflow.initialState,
            history: [],
            variables: {}
        };

        this.instances.set(instance.id, instance);
        
        // Execute workflow asynchronously
        setImmediate(() => this.executeWorkflow(instance).catch(error => {
            this.handleWorkflowError(instance, error);
        }));

        return instance.id;
    }

    private async executeWorkflow(instance: WorkflowInstance): Promise<void> {
        const workflow = this.workflows.get(instance.workflowId)!;
        
        try {
            // Execute initial state
            await this.executeState(instance, workflow.initialState);

            // Process workflow until completion
            while (instance.status === WorkflowInstanceStatus.Running) {
                const nextState = await this.determineNextState(instance);
                
                if (!nextState) {
                    // Workflow completed
                    instance.status = WorkflowInstanceStatus.Completed;
                    instance.completedAt = new Date();
                    
                    this.emit('workflowCompleted', {
                        instanceId: instance.id,
                        workflowId: instance.workflowId,
                        timestamp: new Date()
                    });
                    
                    break;
                }

                await this.executeState(instance, nextState);
            }

        } catch (error) {
            this.handleWorkflowError(instance, error);
        }
    }

    private async executeState(
        instance: WorkflowInstance,
        stateName: string
    ): Promise<void> {
        const workflow = this.workflows.get(instance.workflowId)!;
        const state = workflow.states.find(s => s.name === stateName);
        
        if (!state) {
            throw new Error(`State not found: ${stateName}`);
        }

        instance.currentState = stateName;

        // Execute state entry actions
        if (state.onEntry) {
            await state.onEntry(instance.context, instance);
        }

        // Create workflow tasks
        if (state.tasks) {
            for (const taskDef of state.tasks) {
                await this.createTask(instance, taskDef);
            }
        }

        // Execute state action
        if (state.action) {
            await state.action(instance.context, instance);
        }

        // Record state execution
        instance.history.push({
            state: stateName,
            timestamp: new Date(),
            action: 'entry',
            data: null
        });

        this.emit('workflowStateEntered', {
            instanceId: instance.id,
            workflowId: instance.workflowId,
            state: stateName,
            timestamp: new Date()
        });
    }

    private async determineNextState(
        instance: WorkflowInstance
    ): Promise<string | null> {
        const workflow = this.workflows.get(instance.workflowId)!;
        const currentState = instance.currentState;

        // Check if current state is final
        const state = workflow.states.find(s => s.name === currentState);
        if (state?.isFinal) {
            return null;
        }

        // Check transitions
        for (const transition of workflow.transitions || []) {
            if (transition.from === currentState) {
                // Evaluate condition
                if (transition.condition) {
                    const result = await transition.condition(instance.context, instance);
                    if (!result) continue;
                }

                // Check for timeout
                if (transition.timeout) {
                    const stateEntry = instance.history
                        .filter(h => h.state === currentState)
                        .pop();
                    
                    if (stateEntry) {
                        const elapsed = Date.now() - stateEntry.timestamp.getTime();
                        if (elapsed > transition.timeout) {
                            return transition.to;
                        }
                    }
                }

                // Execute transition action
                if (transition.action) {
                    await transition.action(instance.context, instance);
                }

                // Record transition
                instance.history.push({
                    state: transition.to,
                    timestamp: new Date(),
                    action: 'transition',
                    data: { from: transition.from, reason: transition.reason }
                });

                return transition.to;
            }
        }

        // No applicable transition
        return null;
    }

    private async createTask(
        instance: WorkflowInstance,
        taskDef: WorkflowTaskDefinition
    ): Promise<WorkflowTask> {
        const task: WorkflowTask = {
            id: uuidv4(),
            instanceId: instance.id,
            workflowId: instance.workflowId,
            name: taskDef.name,
            type: taskDef.type,
            status: TaskStatus.Pending,
            assignedTo: taskDef.assignedTo,
            dueDate: taskDef.dueDate,
            priority: taskDef.priority || 0,
            data: taskDef.data || {},
            form: taskDef.form,
            createdAt: new Date()
        };

        this.tasks.set(task.id, task);

        this.emit('taskCreated', {
            taskId: task.id,
            instanceId: instance.id,
            workflowId: instance.workflowId,
            taskName: task.name,
            assignedTo: task.assignedTo,
            timestamp: new Date()
        });

        return task;
    }

    async completeTask(
        taskId: string,
        result: any,
        session: Session
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.status !== TaskStatus.Pending) {
            throw new Error(`Task is not pending: ${task.status}`);
        }

        task.status = TaskStatus.Completed;
        task.completedAt = new Date();
        task.result = result;

        // Update task data
        if (result) {
            task.data = { ...task.data, ...result };
        }

        // Trigger workflow continuation
        const instance = this.instances.get(task.instanceId);
        if (instance) {
            // Set task result in context
            instance.context[`task_${taskId}_result`] = result;
            
            // Resume workflow
            await this.executeWorkflow(instance);
        }

        this.emit('taskCompleted', {
            taskId,
            instanceId: task.instanceId,
            workflowId: task.workflowId,
            result,
            timestamp: new Date()
        });
    }

    async failTask(taskId: string, error: string, session: Session): Promise<void> {
        const task = this.tasks.get(taskId);
        
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        task.status = TaskStatus.Failed;
        task.error = error;
        task.completedAt = new Date();

        const instance = this.instances.get(task.instanceId);
        if (instance) {
            instance.status = WorkflowInstanceStatus.Failed;
            instance.error = error;
            instance.completedAt = new Date();
        }

        this.emit('taskFailed', {
            taskId,
            instanceId: task.instanceId,
            workflowId: task.workflowId,
            error,
            timestamp: new Date()
        });
    }

    async reassignTask(taskId: string, assignedTo: string): Promise<void> {
        const task = this.tasks.get(taskId);
        
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        task.assignedTo = assignedTo;
        task.updatedAt = new Date();

        this.emit('taskReassigned', {
            taskId,
            assignedTo,
            timestamp: new Date()
        });
    }

    async getPendingTasks(userId: string): Promise<WorkflowTask[]> {
        const tasks: WorkflowTask[] = [];

        for (const task of this.tasks.values()) {
            if (task.status === TaskStatus.Pending) {
                if (task.assignedTo === userId || task.assignedTo === '*') {
                    tasks.push(task);
                }
            }
        }

        return tasks.sort((a, b) => b.priority - a.priority);
    }

    async getWorkflowInstance(instanceId: string): Promise<WorkflowInstance | undefined> {
        return this.instances.get(instanceId);
    }

    async getWorkflowInstances(workflowId: string): Promise<WorkflowInstance[]> {
        return Array.from(this.instances.values())
            .filter(i => i.workflowId === workflowId);
    }

    async suspendWorkflow(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        
        if (instance && instance.status === WorkflowInstanceStatus.Running) {
            instance.status = WorkflowInstanceStatus.Suspended;
            
            this.emit('workflowSuspended', {
                instanceId,
                workflowId: instance.workflowId,
                timestamp: new Date()
            });
        }
    }

    async resumeWorkflow(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        
        if (instance && instance.status === WorkflowInstanceStatus.Suspended) {
            instance.status = WorkflowInstanceStatus.Running;
            
            // Resume execution
            setImmediate(() => this.executeWorkflow(instance));
            
            this.emit('workflowResumed', {
                instanceId,
                workflowId: instance.workflowId,
                timestamp: new Date()
            });
        }
    }

    async cancelWorkflow(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        
        if (instance) {
            instance.status = WorkflowInstanceStatus.Cancelled;
            instance.completedAt = new Date();
            
            // Cancel pending tasks
            for (const task of this.tasks.values()) {
                if (task.instanceId === instanceId && 
                    task.status === TaskStatus.Pending) {
                    task.status = TaskStatus.Cancelled;
                    task.completedAt = new Date();
                }
            }
            
            this.emit('workflowCancelled', {
                instanceId,
                workflowId: instance.workflowId,
                timestamp: new Date()
            });
        }
    }

    async setVariable(instanceId: string, name: string, value: any): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (instance) {
            instance.variables[name] = value;
        }
    }

    async getVariable(instanceId: string, name: string): Promise<any> {
        const instance = this.instances.get(instanceId);
        return instance?.variables[name];
    }

    private validateWorkflow(workflow: WorkflowDefinition): void {
        if (!workflow.name) {
            throw new Error('Workflow name is required');
        }
        
        if (!workflow.states || workflow.states.length === 0) {
            throw new Error('Workflow must have at least one state');
        }
        
        if (!workflow.initialState) {
            throw new Error('Workflow must have an initial state');
        }

        // Validate initial state exists
        const initialState = workflow.states.find(
            s => s.name === workflow.initialState
        );
        if (!initialState) {
            throw new Error(`Initial state '${workflow.initialState}' not found`);
        }

        // Validate transitions
        const stateNames = new Set(workflow.states.map(s => s.name));
        
        for (const transition of workflow.transitions || []) {
            if (!stateNames.has(transition.from)) {
                throw new Error(`Transition from state '${transition.from}' not found`);
            }
            if (!stateNames.has(transition.to)) {
                throw new Error(`Transition to state '${transition.to}' not found`);
            }
        }
    }

    private handleWorkflowError(instance: WorkflowInstance, error: Error): void {
        instance.status = WorkflowInstanceStatus.Failed;
        instance.error = error.message;
        instance.completedAt = new Date();

        this.emit('workflowError', {
            instanceId: instance.id,
            workflowId: instance.workflowId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date()
        });
    }

    // ============ Analytics ============

    async getWorkflowStats(workflowId?: string): Promise<WorkflowStats> {
        let instances = Array.from(this.instances.values());
        
        if (workflowId) {
            instances = instances.filter(i => i.workflowId === workflowId);
        }

        const stats: WorkflowStats = {
            total: instances.length,
            running: instances.filter(i => i.status === WorkflowInstanceStatus.Running).length,
            completed: instances.filter(i => i.status === WorkflowInstanceStatus.Completed).length,
            failed: instances.filter(i => i.status === WorkflowInstanceStatus.Failed).length,
            suspended: instances.filter(i => i.status === WorkflowInstanceStatus.Suspended).length,
            cancelled: instances.filter(i => i.status === WorkflowInstanceStatus.Cancelled).length,
            averageDuration: 0,
            totalTasks: 0,
            completedTasks: 0,
            pendingTasks: 0
        };

        // Calculate average duration
        const completedInstances = instances.filter(i => i.completedAt);
        if (completedInstances.length > 0) {
            const totalDuration = completedInstances.reduce(
                (sum, i) => sum + (i.completedAt!.getTime() - i.startedAt.getTime()),
                0
            );
            stats.averageDuration = totalDuration / completedInstances.length;
        }

        // Task stats
        const tasks = Array.from(this.tasks.values())
            .filter(t => instances.some(i => i.id === t.instanceId));
        
        stats.totalTasks = tasks.length;
        stats.completedTasks = tasks.filter(t => t.status === TaskStatus.Completed).length;
        stats.pendingTasks = tasks.filter(t => t.status === TaskStatus.Pending).length;

        return stats;
    }

    async cleanupCompletedInstances(hours: number = 24): Promise<number> {
        const cutoff = new Date(Date.now() - hours * 3600000);
        let removedCount = 0;

        for (const [id, instance] of this.instances) {
            if (instance.completedAt && instance.completedAt < cutoff) {
                this.instances.delete(id);
                removedCount++;
            }
        }

        return removedCount;
    }
}

export interface WorkflowDefinition {
    id?: string;
    name: string;
    description?: string;
    version: string;
    states: WorkflowState[];
    transitions: WorkflowTransition[];
    initialState: string;
    status?: WorkflowStatus;
    createdAt?: Date;
    updatedAt?: Date;
    metadata?: Record<string, any>;
}

export interface WorkflowState {
    name: string;
    type?: 'human' | 'automated' | 'system' | 'approval';
    isFinal?: boolean;
    onEntry?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<void>;
    onExit?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<void>;
    action?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<void>;
    tasks?: WorkflowTaskDefinition[];
    timeout?: number;
    metadata?: Record<string, any>;
}

export interface WorkflowTransition {
    from: string;
    to: string;
    condition?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<boolean> | boolean;
    action?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<void>;
    event?: string;
    reason?: string;
    timeout?: number;
}

export interface WorkflowTaskDefinition {
    name: string;
    type: TaskType;
    assignedTo?: string;
    dueDate?: Date;
    priority?: number;
    data?: any;
    form?: any;
    metadata?: Record<string, any>;
}

export interface WorkflowContext {
    [key: string]: any;
}

export interface WorkflowInstance {
    id: string;
    workflowId: string;
    status: WorkflowInstanceStatus;
    context: WorkflowContext;
    session: Session;
    startedAt: Date;
    completedAt?: Date;
    currentState?: string;
    error?: string;
    history: WorkflowHistoryEntry[];
    variables: Record<string, any>;
}

export interface WorkflowTask {
    id: string;
    instanceId: string;
    workflowId: string;
    name: string;
    type: TaskType;
    status: TaskStatus;
    assignedTo?: string;
    dueDate?: Date;
    priority: number;
    data: any;
    result?: any;
    error?: string;
    form?: any;
    createdAt: Date;
    completedAt?: Date;
    updatedAt?: Date;
}

export interface WorkflowHistoryEntry {
    state: string;
    timestamp: Date;
    action: 'entry' | 'exit' | 'transition';
    data: any;
}

export enum WorkflowStatus {
    Active = 'active',
    Inactive = 'inactive',
    Deprecated = 'deprecated',
    Draft = 'draft'
}

export enum WorkflowInstanceStatus {
    Running = 'running',
    Completed = 'completed',
    Failed = 'failed',
    Suspended = 'suspended',
    Cancelled = 'cancelled'
}

export enum TaskType {
    Approval = 'approval',
    Review = 'review',
    Validation = 'validation',
    Manual = 'manual',
    System = 'system',
    Notification = 'notification',
    Escalation = 'escalation'
}

export enum TaskStatus {
    Pending = 'pending',
    InProgress = 'inProgress',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled',
    Expired = 'expired'
}

export interface WorkflowStats {
    total: number;
    running: number;
    completed: number;
    failed: number;
    suspended: number;
    cancelled: number;
    averageDuration: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
}