import { Readable } from 'stream';

export class Blob {
    private data: Buffer;
    private metadata: BlobMetadata;
    private url?: string;

    constructor(data?: Buffer | string | NodeJS.ReadableStream) {
        if (data) {
            this.setData(data);
        } else {
            this.data = Buffer.alloc(0);
        }
    }

    setData(data: Buffer | string | NodeJS.ReadableStream): void {
        if (Buffer.isBuffer(data)) {
            this.data = data;
        } else if (typeof data === 'string') {
            if (data.startsWith('data:')) {
                // Data URL
                this.data = Buffer.from(data.split(',')[1], 'base64');
                this.url = data;
            } else {
                this.data = Buffer.from(data);
            }
        } else {
            // Stream
            this.data = Buffer.alloc(0);
            // Handle stream asynchronously
            this.loadFromStream(data);
        }
    }

    private async loadFromStream(stream: NodeJS.ReadableStream): Promise<void> {
        const chunks: Buffer[] = [];
        
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('end', () => {
                this.data = Buffer.concat(chunks);
                resolve();
            });
            stream.on('error', reject);
        });
    }

    // Content operations
    async saveToFile(path: string): Promise<void> {
        const fs = await import('fs-extra');
        await fs.writeFile(path, this.data);
    }

    async loadFromFile(path: string): Promise<void> {
        const fs = await import('fs-extra');
        this.data = await fs.readFile(path);
    }

    toBuffer(): Buffer {
        return this.data;
    }

    toString(encoding: BufferEncoding = 'utf8'): string {
        return this.data.toString(encoding);
    }

    toBase64(): string {
        return this.data.toString('base64');
    }

    toDataURL(mimeType: string = 'application/octet-stream'): string {
        return `data:${mimeType};base64,${this.toBase64()}`;
    }

    toStream(): Readable {
        const stream = new Readable();
        stream.push(this.data);
        stream.push(null);
        return stream;
    }

    // Metadata
    getSize(): number {
        return this.data.length;
    }

    getMimeType(): string {
        // Detect mime type from magic bytes
        if (this.data.length > 4) {
            const magic = this.data.toString('hex', 0, 4);
            
            const mimeTypes: Record<string, string> = {
                '89504e47': 'image/png',
                'ffd8ffe0': 'image/jpeg',
                'ffd8ffe1': 'image/jpeg',
                'ffd8ffe2': 'image/jpeg',
                '47494638': 'image/gif',
                '25504446': 'application/pdf',
                '504b0304': 'application/zip',
                '7b5b2272': 'application/json',
                '3c3f786d': 'application/xml'
            };

            return mimeTypes[magic] || 'application/octet-stream';
        }
        
        return this.metadata?.mimeType || 'application/octet-stream';
    }

    setMetadata(metadata: BlobMetadata): void {
        this.metadata = metadata;
    }

    getMetadata(): BlobMetadata | undefined {
        return this.metadata;
    }

    // Utility
    isEmpty(): boolean {
        return this.data.length === 0;
    }

    clear(): void {
        this.data = Buffer.alloc(0);
    }

    clone(): Blob {
        const blob = new Blob();
        blob.data = Buffer.from(this.data);
        blob.metadata = { ...this.metadata };
        return blob;
    }

    // Static factories
    static fromBuffer(buffer: Buffer): Blob {
        return new Blob(buffer);
    }

    static fromString(text: string, encoding: BufferEncoding = 'utf8'): Blob {
        return new Blob(Buffer.from(text, encoding));
    }

    static fromBase64(base64: string): Blob {
        return new Blob(Buffer.from(base64, 'base64'));
    }

    static fromDataURL(dataURL: string): Blob {
        const matches = dataURL.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid data URL');
        }
        
        const blob = new Blob(Buffer.from(matches[2], 'base64'));
        blob.metadata = { mimeType: matches[1] };
        blob.url = dataURL;
        
        return blob;
    }

    static async fromFile(path: string): Promise<Blob> {
        const blob = new Blob();
        await blob.loadFromFile(path);
        return blob;
    }

    static async fromUrl(url: string): Promise<Blob> {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return new Blob(Buffer.from(buffer));
    }
}

export interface BlobMetadata {
    mimeType?: string;
    fileName?: string;
    size?: number;
    createdAt?: Date;
    modifiedAt?: Date;
    [key: string]: any;
}