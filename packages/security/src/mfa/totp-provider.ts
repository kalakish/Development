import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

export interface TOTPConfig {
    algorithm?: 'sha1' | 'sha256' | 'sha512';
    digits?: number;
    step?: number;
    window?: number;
}

export class TOTPProvider {
    private config: TOTPConfig;
    
    constructor(config?: TOTPConfig) {
        this.config = {
            algorithm: config?.algorithm || 'sha1',
            digits: config?.digits || 6,
            step: config?.step || 30,
            window: config?.window || 1
        };
        
        // Configure otplib
        authenticator.options = {
            algorithm: this.config.algorithm,
            digits: this.config.digits,
            step: this.config.step,
            window: this.config.window
        };
    }
    
    // ============ Secret Management ============
    
    generateSecret(): string {
        return authenticator.generateSecret();
    }
    
    generateSecretWithEntropy(entropy: number = 128): string {
        return authenticator.generateSecret(entropy);
    }
    
    // ============ Token Operations ============
    
    generateToken(secret: string): string {
        return authenticator.generate(secret);
    }
    
    verifyToken(token: string, secret: string): boolean {
        return authenticator.verify({ token, secret });
    }
    
    verifyTokenWithWindow(token: string, secret: string, window?: number): boolean {
        return authenticator.verify({
            token,
            secret,
            window: window || this.config.window
        });
    }
    
    // ============ Time-Based Operations ============
    
    getRemainingSeconds(): number {
        return authenticator.timeRemaining();
    }
    
    getTimeSteps(): number {
        return authenticator.timeUsed();
    }
    
    // ============ URI & QR Code ============
    
    getOTPAuthURI(secret: string, account: string, issuer: string): string {
        return authenticator.keyuri(account, issuer, secret);
    }
    
    async getQRCode(secret: string, account: string, issuer: string): Promise<string> {
        const otpauth = this.getOTPAuthURI(secret, account, issuer);
        
        try {
            return await QRCode.toDataURL(otpauth);
        } catch (error) {
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }
    
    async getQRCodeBuffer(secret: string, account: string, issuer: string): Promise<Buffer> {
        const otpauth = this.getOTPAuthURI(secret, account, issuer);
        
        return new Promise((resolve, reject) => {
            QRCode.toBuffer(otpauth, (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    }
    
    // ============ Validation ============
    
    validateSecret(secret: string): boolean {
        // Check if secret is valid base32
        const base32Regex = /^[A-Z2-7]+=*$/i;
        return base32Regex.test(secret) && secret.length >= 16;
    }
    
    validateToken(token: string): boolean {
        const digitsRegex = new RegExp(`^\\d{${this.config.digits}}$`);
        return digitsRegex.test(token);
    }
    
    // ============ Recovery ============
    
    generateRecoveryCodes(count: number = 10, length: number = 8): string[] {
        const codes: string[] = [];
        
        for (let i = 0; i < count; i++) {
            const code = crypto.randomBytes(length)
                .toString('base64')
                .replace(/[+/=]/g, '')
                .substring(0, length)
                .toUpperCase();
            
            // Add hyphen every 4 characters
            const formatted = code.replace(/(.{4})/g, '$1-').slice(0, -1);
            codes.push(formatted);
        }
        
        return codes;
    }
    
    // ============ Configuration ============
    
    setAlgorithm(algorithm: 'sha1' | 'sha256' | 'sha512'): void {
        this.config.algorithm = algorithm;
        authenticator.options = { algorithm };
    }
    
    setDigits(digits: number): void {
        this.config.digits = digits;
        authenticator.options = { digits };
    }
    
    setStep(step: number): void {
        this.config.step = step;
        authenticator.options = { step };
    }
    
    setWindow(window: number): void {
        this.config.window = window;
        authenticator.options = { window };
    }
    
    getConfig(): TOTPConfig {
        return { ...this.config };
    }
}