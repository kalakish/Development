/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { Readable } from 'stream';
export declare class Blob {
    private data;
    private metadata;
    private url?;
    constructor(data?: Buffer | string | NodeJS.ReadableStream);
    setData(data: Buffer | string | NodeJS.ReadableStream): void;
    private loadFromStream;
    saveToFile(path: string): Promise<void>;
    loadFromFile(path: string): Promise<void>;
    toBuffer(): Buffer;
    toString(encoding?: BufferEncoding): string;
    toBase64(): string;
    toDataURL(mimeType?: string): string;
    toStream(): Readable;
    getSize(): number;
    getMimeType(): string;
    setMetadata(metadata: BlobMetadata): void;
    getMetadata(): BlobMetadata | undefined;
    isEmpty(): boolean;
    clear(): void;
    clone(): Blob;
    static fromBuffer(buffer: Buffer): Blob;
    static fromString(text: string, encoding?: BufferEncoding): Blob;
    static fromBase64(base64: string): Blob;
    static fromDataURL(dataURL: string): Blob;
    static fromFile(path: string): Promise<Blob>;
    static fromUrl(url: string): Promise<Blob>;
}
export interface BlobMetadata {
    mimeType?: string;
    fileName?: string;
    size?: number;
    createdAt?: Date;
    modifiedAt?: Date;
    [key: string]: any;
}
//# sourceMappingURL=blob.d.ts.map