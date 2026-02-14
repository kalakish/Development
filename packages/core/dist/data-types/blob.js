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
exports.Blob = void 0;
const stream_1 = require("stream");
class Blob {
    data;
    metadata;
    url;
    constructor(data) {
        if (data) {
            this.setData(data);
        }
        else {
            this.data = Buffer.alloc(0);
        }
    }
    setData(data) {
        if (Buffer.isBuffer(data)) {
            this.data = data;
        }
        else if (typeof data === 'string') {
            if (data.startsWith('data:')) {
                // Data URL
                this.data = Buffer.from(data.split(',')[1], 'base64');
                this.url = data;
            }
            else {
                this.data = Buffer.from(data);
            }
        }
        else {
            // Stream
            this.data = Buffer.alloc(0);
            // Handle stream asynchronously
            this.loadFromStream(data);
        }
    }
    async loadFromStream(stream) {
        const chunks = [];
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
    async saveToFile(path) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs-extra')));
        await fs.writeFile(path, this.data);
    }
    async loadFromFile(path) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs-extra')));
        this.data = await fs.readFile(path);
    }
    toBuffer() {
        return this.data;
    }
    toString(encoding = 'utf8') {
        return this.data.toString(encoding);
    }
    toBase64() {
        return this.data.toString('base64');
    }
    toDataURL(mimeType = 'application/octet-stream') {
        return `data:${mimeType};base64,${this.toBase64()}`;
    }
    toStream() {
        const stream = new stream_1.Readable();
        stream.push(this.data);
        stream.push(null);
        return stream;
    }
    // Metadata
    getSize() {
        return this.data.length;
    }
    getMimeType() {
        // Detect mime type from magic bytes
        if (this.data.length > 4) {
            const magic = this.data.toString('hex', 0, 4);
            const mimeTypes = {
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
    setMetadata(metadata) {
        this.metadata = metadata;
    }
    getMetadata() {
        return this.metadata;
    }
    // Utility
    isEmpty() {
        return this.data.length === 0;
    }
    clear() {
        this.data = Buffer.alloc(0);
    }
    clone() {
        const blob = new Blob();
        blob.data = Buffer.from(this.data);
        blob.metadata = { ...this.metadata };
        return blob;
    }
    // Static factories
    static fromBuffer(buffer) {
        return new Blob(buffer);
    }
    static fromString(text, encoding = 'utf8') {
        return new Blob(Buffer.from(text, encoding));
    }
    static fromBase64(base64) {
        return new Blob(Buffer.from(base64, 'base64'));
    }
    static fromDataURL(dataURL) {
        const matches = dataURL.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid data URL');
        }
        const blob = new Blob(Buffer.from(matches[2], 'base64'));
        blob.metadata = { mimeType: matches[1] };
        blob.url = dataURL;
        return blob;
    }
    static async fromFile(path) {
        const blob = new Blob();
        await blob.loadFromFile(path);
        return blob;
    }
    static async fromUrl(url) {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return new Blob(Buffer.from(buffer));
    }
}
exports.Blob = Blob;
//# sourceMappingURL=blob.js.map