/// <reference types="node" />
/// <reference types="node" />
import { Blob } from './blob';
export declare class MediaSet {
    private items;
    private maxItems;
    constructor(items?: Media[]);
    add(media: Media): number;
    remove(index: number): void;
    removeById(id: string): void;
    get(index: number): Media | undefined;
    getById(id: string): Media | undefined;
    getFirst(): Media | undefined;
    getLast(): Media | undefined;
    getAll(): Media[];
    count(): number;
    isEmpty(): boolean;
    contains(id: string): boolean;
    sort(compareFn?: (a: Media, b: Media) => number): void;
    moveUp(index: number): void;
    moveDown(index: number): void;
    moveTo(index: number, newIndex: number): void;
    filter(predicate: (media: Media) => boolean): Media[];
    findByType(mimeType: string): Media[];
    page(page: number, pageSize: number): Media[];
    clear(): void;
    toJSON(): object[];
    setMaxItems(max: number): void;
    getMaxItems(): number;
    static fromArray(items: Media[]): MediaSet;
}
export declare class Media {
    private id;
    private blob;
    private filename;
    private ordinal;
    private caption?;
    private metadata;
    constructor(blob: Blob, filename: string);
    private generateId;
    getId(): string;
    getBlob(): Blob;
    getFilename(): string;
    getOrdinal(): number;
    getCaption(): string | undefined;
    getMetadata(): Record<string, any>;
    getMimeType(): string;
    getSize(): number;
    setOrdinal(ordinal: number): void;
    setCaption(caption: string): void;
    setMetadata(key: string, value: any): void;
    saveToFile(path: string): Promise<void>;
    toBuffer(): Buffer;
    toBase64(): string;
    toDataURL(): string;
    toJSON(): object;
    static fromFile(filePath: string): Promise<Media>;
    static fromBuffer(buffer: Buffer, filename: string): Media;
    static fromBase64(base64: string, filename: string): Media;
    static fromDataURL(dataURL: string, filename: string): Media;
}
//# sourceMappingURL=mediaset.d.ts.map