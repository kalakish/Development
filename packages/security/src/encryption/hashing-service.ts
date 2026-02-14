import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface HashOptions {
    algorithm?: 'bcrypt' | 'argon2' | 'sha256' | 'sha512';
    saltRounds?: number;
    pepper?: string;
}

export class HashingService {
    private algorithm: 'bcrypt' | 'argon2' | 'sha256' | 'sha512';
    private saltRounds: number;
    private pepper: string;
    
    constructor(options?: HashOptions) {
        this.algorithm = options?.algorithm || 'bcrypt';
        this.saltRounds = options?.saltRounds || 10;
        this.pepper = options?.pepper || '';
    }
    
    // ============ Password Hashing ============
    
    async hashPassword(password: string): Promise<string> {
        // Add pepper to password
        const pepperedPassword = this.addPepper(password);
        
        switch (this.algorithm) {
            case 'bcrypt':
                return this.hashBcrypt(pepperedPassword);
            case 'argon2':
                return this.hashArgon2(pepperedPassword);
            case 'sha256':
            case 'sha512':
                return this.hashSimple(pepperedPassword);
            default:
                throw new Error(`Unsupported hashing algorithm: ${this.algorithm}`);
        }
    }
    
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        const pepperedPassword = this.addPepper(password);
        
        // Detect algorithm from hash format
        if (hash.startsWith('$2b$') || hash.startsWith('$2a$') || hash.startsWith('$2y$')) {
            return bcrypt.compare(pepperedPassword, hash);
        } else if (hash.startsWith('$argon2')) {
            // Implement Argon2 verification
            return this.verifyArgon2(pepperedPassword, hash);
        } else {
            // Simple hash comparison
            const hashed = this.hashSimple(pepperedPassword, this.algorithm);
            return crypto.timingSafeEqual(
                Buffer.from(hashed),
                Buffer.from(hash)
            );
        }
    }
    
    private addPepper(password: string): string {
        return this.pepper ? `${password}${this.pepper}` : password;
    }
    
    private async hashBcrypt(password: string): Promise<string> {
        return bcrypt.hash(password, this.saltRounds);
    }
    
    private async hashArgon2(password: string): Promise<string> {
        // This would use the argon2 library
        // For now, fallback to bcrypt
        return this.hashBcrypt(password);
    }
    
    private async verifyArgon2(password: string, hash: string): Promise<boolean> {
        // This would use the argon2 library
        // For now, fallback to bcrypt comparison
        return bcrypt.compare(password, hash);
    }
    
    private hashSimple(password: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
        return crypto.createHash(algorithm).update(password).digest('hex');
    }
    
    // ============ General Purpose Hashing ============
    
    hashData(data: string | Buffer, algorithm: string = 'sha256'): string {
        const buffer = typeof data === 'string' 
            ? Buffer.from(data, 'utf8') 
            : data;
        
        return crypto.createHash(algorithm).update(buffer).digest('hex');
    }
    
    hashWithSalt(data: string, salt: string, algorithm: string = 'sha256'): string {
        const combined = `${data}${salt}`;
        return this.hashData(combined, algorithm);
    }
    
    // ============ HMAC ============
    
    createHMAC(data: string | Buffer, key: string | Buffer, algorithm: string = 'sha256'): string {
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
        const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
        
        return crypto.createHmac(algorithm, keyBuffer)
            .update(dataBuffer)
            .digest('hex');
    }
    
    verifyHMAC(data: string | Buffer, key: string | Buffer, hmac: string, algorithm: string = 'sha256'): boolean {
        const computed = this.createHMAC(data, key, algorithm);
        
        return crypto.timingSafeEqual(
            Buffer.from(computed),
            Buffer.from(hmac)
        );
    }
    
    // ============ Password Strength Validation ============
    
    validatePasswordStrength(password: string): PasswordStrengthResult {
        const checks = {
            minLength: password.length >= 8,
            hasUppercase: /[A-Z]/.test(password),
            hasLowercase: /[a-z]/.test(password),
            hasNumbers: /\d/.test(password),
            hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password),
            noCommonPasswords: !this.isCommonPassword(password),
            noSequentialChars: !this.hasSequentialChars(password),
            noRepeatingChars: !this.hasRepeatingChars(password)
        };
        
        const score = Object.values(checks).filter(Boolean).length;
        let strength: 'weak' | 'medium' | 'strong' | 'very-strong';
        
        if (score <= 2) strength = 'weak';
        else if (score <= 4) strength = 'medium';
        else if (score <= 6) strength = 'strong';
        else strength = 'very-strong';
        
        const failedChecks = Object.entries(checks)
            .filter(([_, passed]) => !passed)
            .map(([check]) => check);
        
        return {
            isValid: score >= 4,
            strength,
            score,
            checks,
            failedChecks,
            suggestions: this.getPasswordSuggestions(failedChecks)
        };
    }
    
    private isCommonPassword(password: string): boolean {
        const commonPasswords = [
            'password', '123456', '12345678', 'qwerty', 'abc123',
            'password1', 'admin', 'welcome', 'monkey', 'dragon'
        ];
        
        return commonPasswords.includes(password.toLowerCase());
    }
    
    private hasSequentialChars(password: string): boolean {
        const sequences = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
        
        for (const seq of sequences) {
            for (let i = 0; i < seq.length - 2; i++) {
                const subSeq = seq.substring(i, i + 3);
                if (password.toLowerCase().includes(subSeq)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    private hasRepeatingChars(password: string): boolean {
        return /(.)\1{2,}/.test(password);
    }
    
    private getPasswordSuggestions(failedChecks: string[]): string[] {
        const suggestions: Record<string, string> = {
            minLength: 'Use at least 8 characters',
            hasUppercase: 'Include at least one uppercase letter',
            hasLowercase: 'Include at least one lowercase letter',
            hasNumbers: 'Include at least one number',
            hasSpecialChars: 'Include at least one special character',
            noCommonPasswords: 'Avoid common passwords',
            noSequentialChars: 'Avoid sequential characters (e.g., "123", "abc")',
            noRepeatingChars: 'Avoid repeating characters (e.g., "aaa")'
        };
        
        return failedChecks.map(check => suggestions[check]).filter(Boolean);
    }
    
    // ============ Utility ============
    
    generateSalt(length: number = 16): string {
        return crypto.randomBytes(length).toString('hex');
    }
    
    generateSecurePassword(length: number = 12): string {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        
        return password;
    }
}

export interface PasswordStrengthResult {
    isValid: boolean;
    strength: 'weak' | 'medium' | 'strong' | 'very-strong';
    score: number;
    checks: Record<string, boolean>;
    failedChecks: string[];
    suggestions: string[];
}