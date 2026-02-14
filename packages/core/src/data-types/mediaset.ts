import { Blob } from './blob';

export class MediaSet {
    private items: Media[] = [];
    private maxItems: number = 100;

    constructor(items?: Media[]) {
        if (items) {
            this.items = items;
        }
    }

    // Collection operations
    add(media: Media): number {
        if (this.items.length >= this.maxItems) {
            throw new Error(`MediaSet cannot exceed ${this.maxItems} items`);
        }
        this.items.push(media);
        return this.items.length;
    }

    remove(index: number): void {
        if (index >= 0 && index < this.items.length) {
            this.items.splice(index, 1);
        }
    }

    removeById(id: string): void {
        const index = this.items.findIndex(m => m.getId() === id);
        if (index !== -1) {
            this.items.splice(index, 1);
        }
    }

    get(index: number): Media | undefined {
        return this.items[index];
    }

    getById(id: string): Media | undefined {
        return this.items.find(m => m.getId() === id);
    }

    getFirst(): Media | undefined {
        return this.items[0];
    }

    getLast(): Media | undefined {
        return this.items[this.items.length - 1];
    }

    getAll(): Media[] {
        return [...this.items];
    }

    // Query
    count(): number {
        return this.items.length;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    contains(id: string): boolean {
        return this.items.some(m => m.getId() === id);
    }

    // Sorting
    sort(compareFn?: (a: Media, b: Media) => number): void {
        this.items.sort(compareFn || ((a, b) => 
            a.getOrdinal() - b.getOrdinal()
        ));
    }

    // Reordering
    moveUp(index: number): void {
        if (index > 0 && index < this.items.length) {
            [this.items[index - 1], this.items[index]] = 
            [this.items[index], this.items[index - 1]];
        }
    }

    moveDown(index: number): void {
        if (index >= 0 && index < this.items.length - 1) {
            [this.items[index], this.items[index + 1]] = 
            [this.items[index + 1], this.items[index]];
        }
    }

    moveTo(index: number, newIndex: number): void {
        if (index >= 0 && index < this.items.length &&
            newIndex >= 0 && newIndex < this.items.length) {
            const [item] = this.items.splice(index, 1);
            this.items.splice(newIndex, 0, item);
        }
    }

    // Filters
    filter(predicate: (media: Media) => boolean): Media[] {
        return this.items.filter(predicate);
    }

    findByType(mimeType: string): Media[] {
        return this.items.filter(m => m.getMimeType().includes(mimeType));
    }

    // Pagination
    page(page: number, pageSize: number): Media[] {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return this.items.slice(start, end);
    }

    // Clear
    clear(): void {
        this.items = [];
    }

    // Serialization
    toJSON(): object[] {
        return this.items.map(m => m.toJSON());
    }

    // Configuration
    setMaxItems(max: number): void {
        this.maxItems = max;
    }

    getMaxItems(): number {
        return this.maxItems;
    }

    // Static factories
    static fromArray(items: Media[]): MediaSet {
        return new MediaSet(items);
    }
}

export class Media {
    private id: string;
    private blob: Blob;
    private filename: string;
    private ordinal: number;
    private caption?: string;
    private metadata: Record<string, any>;

    constructor(blob: Blob, filename: string) {
        this.id = this.generateId();
        this.blob = blob;
        this.filename = filename;
        this.ordinal = 0;
        this.metadata = {};
    }

    private generateId(): string {
        return `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getters
    getId(): string {
        return this.id;
    }

    getBlob(): Blob {
        return this.blob;
    }

    getFilename(): string {
        return this.filename;
    }

    getOrdinal(): number {
        return this.ordinal;
    }

    getCaption(): string | undefined {
        return this.caption;
    }

    getMetadata(): Record<string, any> {
        return { ...this.metadata };
    }

    getMimeType(): string {
        return this.blob.getMimeType();
    }

    getSize(): number {
        return this.blob.getSize();
    }

    // Setters
    setOrdinal(ordinal: number): void {
        this.ordinal = ordinal;
    }

    setCaption(caption: string): void {
        this.caption = caption;
    }

    setMetadata(key: string, value: any): void {
        this.metadata[key] = value;
    }

    // Content operations
    async saveToFile(path: string): Promise<void> {
        const fs = await import('fs-extra');
        await fs.writeFile(path, this.blob.toBuffer());
    }

    toBuffer(): Buffer {
        return this.blob.toBuffer();
    }

    toBase64(): string {
        return this.blob.toBase64();
    }

    toDataURL(): string {
        return this.blob.toDataURL(this.getMimeType());
    }

    // Serialization
    toJSON(): object {
        return {
            id: this.id,
            filename: this.filename,
            ordinal: this.ordinal,
            caption: this.caption,
            mimeType: this.getMimeType(),
            size: this.getSize(),
            metadata: this.metadata,
            url: this.toDataURL()
        };
    }

    // Static factories
    static async fromFile(filePath: string): Promise<Media> {
        const blob = await Blob.fromFile(filePath);
        const filename = filePath.split('/').pop() || 'file';
        return new Media(blob, filename);
    }

    static fromBuffer(buffer: Buffer, filename: string): Media {
        const blob = Blob.fromBuffer(buffer);
        return new Media(blob, filename);
    }

    static fromBase64(base64: string, filename: string): Media {
        const blob = Blob.fromBase64(base64);
        return new Media(blob, filename);
    }

    static fromDataURL(dataURL: string, filename: string): Media {
        const blob = Blob.fromDataURL(dataURL);
        return new Media(blob, filename);
    }
}