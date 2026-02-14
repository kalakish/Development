"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Media = exports.MediaSet = void 0;
const blob_1 = require("./blob");
class MediaSet {
    items = [];
    maxItems = 100;
    constructor(items) {
        if (items) {
            this.items = items;
        }
    }
    // Collection operations
    add(media) {
        if (this.items.length >= this.maxItems) {
            throw new Error(`MediaSet cannot exceed ${this.maxItems} items`);
        }
        this.items.push(media);
        return this.items.length;
    }
    remove(index) {
        if (index >= 0 && index < this.items.length) {
            this.items.splice(index, 1);
        }
    }
    removeById(id) {
        const index = this.items.findIndex(m => m.getId() === id);
        if (index !== -1) {
            this.items.splice(index, 1);
        }
    }
    get(index) {
        return this.items[index];
    }
    getById(id) {
        return this.items.find(m => m.getId() === id);
    }
    getFirst() {
        return this.items[0];
    }
    getLast() {
        return this.items[this.items.length - 1];
    }
    getAll() {
        return [...this.items];
    }
    // Query
    count() {
        return this.items.length;
    }
    isEmpty() {
        return this.items.length === 0;
    }
    contains(id) {
        return this.items.some(m => m.getId() === id);
    }
    // Sorting
    sort(compareFn) {
        this.items.sort(compareFn || ((a, b) => a.getOrdinal() - b.getOrdinal()));
    }
    // Reordering
    moveUp(index) {
        if (index > 0 && index < this.items.length) {
            [this.items[index - 1], this.items[index]] =
                [this.items[index], this.items[index - 1]];
        }
    }
    moveDown(index) {
        if (index >= 0 && index < this.items.length - 1) {
            [this.items[index], this.items[index + 1]] =
                [this.items[index + 1], this.items[index]];
        }
    }
    moveTo(index, newIndex) {
        if (index >= 0 && index < this.items.length &&
            newIndex >= 0 && newIndex < this.items.length) {
            const [item] = this.items.splice(index, 1);
            this.items.splice(newIndex, 0, item);
        }
    }
    // Filters
    filter(predicate) {
        return this.items.filter(predicate);
    }
    findByType(mimeType) {
        return this.items.filter(m => m.getMimeType().includes(mimeType));
    }
    // Pagination
    page(page, pageSize) {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return this.items.slice(start, end);
    }
    // Clear
    clear() {
        this.items = [];
    }
    // Serialization
    toJSON() {
        return this.items.map(m => m.toJSON());
    }
    // Configuration
    setMaxItems(max) {
        this.maxItems = max;
    }
    getMaxItems() {
        return this.maxItems;
    }
    // Static factories
    static fromArray(items) {
        return new MediaSet(items);
    }
}
exports.MediaSet = MediaSet;
class Media {
    id;
    blob;
    filename;
    ordinal;
    caption;
    metadata;
    constructor(blob, filename) {
        this.id = this.generateId();
        this.blob = blob;
        this.filename = filename;
        this.ordinal = 0;
        this.metadata = {};
    }
    generateId() {
        return `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Getters
    getId() {
        return this.id;
    }
    getBlob() {
        return this.blob;
    }
    getFilename() {
        return this.filename;
    }
    getOrdinal() {
        return this.ordinal;
    }
    getCaption() {
        return this.caption;
    }
    getMetadata() {
        return { ...this.metadata };
    }
    getMimeType() {
        return this.blob.getMimeType();
    }
    getSize() {
        return this.blob.getSize();
    }
    // Setters
    setOrdinal(ordinal) {
        this.ordinal = ordinal;
    }
    setCaption(caption) {
        this.caption = caption;
    }
    setMetadata(key, value) {
        this.metadata[key] = value;
    }
    // Content operations
    async saveToFile(path) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs-extra')));
        await fs.writeFile(path, this.blob.toBuffer());
    }
    toBuffer() {
        return this.blob.toBuffer();
    }
    toBase64() {
        return this.blob.toBase64();
    }
    toDataURL() {
        return this.blob.toDataURL(this.getMimeType());
    }
    // Serialization
    toJSON() {
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
    static async fromFile(filePath) {
        const blob = await blob_1.Blob.fromFile(filePath);
        const filename = filePath.split('/').pop() || 'file';
        return new Media(blob, filename);
    }
    static fromBuffer(buffer, filename) {
        const blob = blob_1.Blob.fromBuffer(buffer);
        return new Media(blob, filename);
    }
    static fromBase64(base64, filename) {
        const blob = blob_1.Blob.fromBase64(base64);
        return new Media(blob, filename);
    }
    static fromDataURL(dataURL, filename) {
        const blob = blob_1.Blob.fromDataURL(dataURL);
        return new Media(blob, filename);
    }
}
exports.Media = Media;
//# sourceMappingURL=mediaset.js.map