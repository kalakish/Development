import crypto from 'crypto';

export interface EncryptionOptions {
    algorithm?: string;
    encoding?: 'hex' | 'base64' | 'latin1';
    keyDerivation?: 'pbkdf2' | 'scrypt' | 'direct';
    iterations?: number;
    saltLength?: number;
    keyLength?: number;
}

export class EncryptionService {
    private algorithm: string;
    private encoding: 'hex' | 'base64' | 'latin1';
    private keyDerivation: 'pbkdf2' | 'scrypt' | 'direct';
    private iterations: number;
    private saltLength: number;
    private keyLength: number;
    
    constructor(options?: EncryptionOptions) {
        this.algorithm = options?.algorithm || 'aes-256-gcm';
        this.encoding = options?.encoding || 'hex';
        this.keyDerivation = options?.keyDerivation || 'pbkdf2';
        this.iterations = options?.iterations || 100000;
        this.saltLength = options?.saltLength || 16;
        this.keyLength = options?.keyLength || 32;
    }
    
    // ============ Symmetric Encryption ============
    
    encrypt(text: string, secretKey: string | Buffer): EncryptedData {
        const iv = crypto.randomBytes(16);
        const salt = crypto.randomBytes(this.saltLength);
        const key = this.deriveKey(secretKey, salt);
        
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        const encrypted = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final()
        ]);
        
        const authTag = this.algorithm.includes('gcm') 
            ? cipher.getAuthTag() 
            : null;
        
        return {
            encrypted: encrypted.toString(this.encoding),
            iv: iv.toString(this.encoding),
            salt: salt.toString(this.encoding),
            authTag: authTag?.toString(this.encoding),
            algorithm: this.algorithm,
            encoding: this.encoding
        };
    }
    
    decrypt(encryptedData: EncryptedData, secretKey: string | Buffer): string {
        const iv = Buffer.from(encryptedData.iv, this.encoding);
        const salt = Buffer.from(encryptedData.salt, this.encoding);
        const encrypted = Buffer.from(encryptedData.encrypted, this.encoding);
        const key = this.deriveKey(secretKey, salt);
        
        const decipher = crypto.createDecipheriv(
            encryptedData.algorithm || this.algorithm,
            key,
            iv
        );
        
        if (encryptedData.authTag) {
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, this.encoding));
        }
        
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
        
        return decrypted.toString('utf8');
    }
    
    // ============ Asymmetric Encryption ============
    
    generateKeyPair(): KeyPair {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        
        return { publicKey, privateKey };
    }
    
    encryptWithPublicKey(text: string, publicKey: string): string {
        const buffer = Buffer.from(text, 'utf8');
        const encrypted = crypto.publicEncrypt(publicKey, buffer);
        return encrypted.toString('base64');
    }
    
    decryptWithPrivateKey(encryptedData: string, privateKey: string): string {
        const buffer = Buffer.from(encryptedData, 'base64');
        const decrypted = crypto.privateDecrypt(privateKey, buffer);
        return decrypted.toString('utf8');
    }
    
    // ============ Key Derivation ============
    
    private deriveKey(secret: string | Buffer, salt: Buffer): Buffer {
        const secretBuffer = typeof secret === 'string' 
            ? Buffer.from(secret, 'utf8') 
            : secret;
        
        switch (this.keyDerivation) {
            case 'pbkdf2':
                return crypto.pbkdf2Sync(
                    secretBuffer,
                    salt,
                    this.iterations,
                    this.keyLength,
                    'sha256'
                );
            case 'scrypt':
                return crypto.scryptSync(
                    secretBuffer,
                    salt,
                    this.keyLength,
                    { N: 16384, r: 8, p: 1 }
                );
            case 'direct':
                // Not recommended for production - use only for testing
                return crypto.createHash('sha256')
                    .update(Buffer.concat([secretBuffer, salt]))
                    .digest()
                    .slice(0, this.keyLength);
            default:
                throw new Error(`Unsupported key derivation: ${this.keyDerivation}`);
        }
    }
    
    // ============ Hashing ============
    
    hash(data: string | Buffer, algorithm: string = 'sha256'): string {
        const buffer = typeof data === 'string' 
            ? Buffer.from(data, 'utf8') 
            : data;
        
        return crypto.createHash(algorithm).update(buffer).digest(this.encoding);
    }
    
    hmac(data: string | Buffer, key: string | Buffer, algorithm: string = 'sha256'): string {
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
        const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
        
        return crypto.createHmac(algorithm, keyBuffer)
            .update(dataBuffer)
            .digest(this.encoding);
    }
    
    // ============ Utility ============
    
    generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }
    
    generateUUID(): string {
        return crypto.randomUUID();
    }
    
    createChecksum(data: string | Buffer): string {
        const buffer = typeof data === 'string' 
            ? Buffer.from(data, 'utf8') 
            : data;
        
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
    
    // ============ Data Masking ============
    
    maskSensitiveData(data: string, visibleChars: number = 4, maskChar: string = '*'): string {
        if (data.length <= visibleChars) {
            return maskChar.repeat(data.length);
        }
        
        const visible = data.slice(-visibleChars);
        const masked = maskChar.repeat(data.length - visibleChars);
        
        return masked + visible;
    }
    
    maskEmail(email: string): string {
        const [localPart, domain] = email.split('@');
        
        if (!domain) {
            return this.maskSensitiveData(email, 2);
        }
        
        const maskedLocal = this.maskSensitiveData(localPart, 2);
        return `${maskedLocal}@${domain}`;
    }
    
    maskPhone(phone: string): string {
        // Keep last 4 digits visible
        return this.maskSensitiveData(phone, 4);
    }
    
    maskCreditCard(cardNumber: string): string {
        // Remove non-digits
        const digits = cardNumber.replace(/\D/g, '');
        
        if (digits.length <= 4) {
            return '****';
        }
        
        const last4 = digits.slice(-4);
        return `**** **** **** ${last4}`;
    }
}

export interface EncryptedData {
    encrypted: string;
    iv: string;
    salt: string;
    authTag?: string;
    algorithm?: string;
    encoding?: string;
}

export interface KeyPair {
    publicKey: string;
    privateKey: string;
}