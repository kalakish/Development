export interface APIRoute {
    id: string;
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    handler: (req: any, res: any, next: any) => Promise<any>;
    controller?: string;
    controllerInstance?: any;
    middleware?: any[];
    isPublic?: boolean;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: APIParameter[];
    requestBody?: APIRequestBody;
    responses?: Record<string, APIResponse>;
}

export interface APIParameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    schema: {
        type: string;
        format?: string;
    };
    description?: string;
}

export interface APIRequestBody {
    required?: boolean;
    content: {
        'application/json': {
            schema: any;
        };
    };
}

export interface APIResponse {
    description: string;
    content?: {
        'application/json'?: {
            schema: any;
        };
    };
}