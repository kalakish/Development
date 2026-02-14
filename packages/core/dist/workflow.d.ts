/// <reference types="node" />
import { EventEmitter } from 'events';
import { Session } from './session';
import { Record } from '@nova/orm/record';
export declare class WorkflowEngine extends EventEmitter {
    private workflows;
    private instances;
    private tasks;
    registerWorkflow(definition: WorkflowDefinition): Promise<string>;
    startWorkflow(workflowId: string, context: WorkflowContext, session: Session): Promise<string>;
    private executeWorkflow;
    private executeState;
    private determineNextState;
    private createTask;
    completeTask(taskId: string, result: any, session: Session): Promise<void>;
    failTask(taskId: string, error: string, session: Session): Promise<void>;
    reassignTask(taskId: string, assignedTo: string): Promise<void>;
    getPendingTasks(userId: string): Promise<WorkflowTask[]>;
    getWorkflowInstance(instanceId: string): Promise<WorkflowInstance | undefined>;
    getWorkflowInstances(workflowId: string): Promise<WorkflowInstance[]>;
    suspendWorkflow(instanceId: string): Promise<void>;
    resumeWorkflow(instanceId: string): Promise<void>;
    cancelWorkflow(instanceId: string): Promise<void>;
    setVariable(instanceId: string, name: string, value: any): Promise<void>;
    getVariable(instanceId: string, name: string): Promise<any>;
    private validateWorkflow;
    private handleWorkflowError;
    getWorkflowStats(workflowId?: string): Promise<WorkflowStats>;
    cleanupCompletedInstances(hours?: number): Promise<number>;
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
export declare enum WorkflowStatus {
    Active = "active",
    Inactive = "inactive",
    Deprecated = "deprecated",
    Draft = "draft"
}
export declare enum WorkflowInstanceStatus {
    Running = "running",
    Completed = "completed",
    Failed = "failed",
    Suspended = "suspended",
    Cancelled = "cancelled"
}
export declare enum TaskType {
    Approval = "approval",
    Review = "review",
    Validation = "validation",
    Manual = "manual",
    System = "system",
    Notification = "notification",
    Escalation = "escalation"
}
export declare enum TaskStatus {
    Pending = "pending",
    InProgress = "inProgress",
    Completed = "completed",
    Failed = "failed",
    Cancelled = "cancelled",
    Expired = "expired"
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
//# sourceMappingURL=workflow.d.ts.map