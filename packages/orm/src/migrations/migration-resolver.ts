import { SQLServerProvider } from '../sqlserver-provider';
import { Migration, MigrationFile } from './migration-generator';
import { MigrationExecutor } from './migration-executor';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import { createHash } from 'crypto';

export interface MigrationConflict {
    migrationId: string;
    type: 'version' | 'checksum' | 'dependency' | 'order';
    description: string;
    resolution?: 'skip' | 'override' | 'rename' | 'reorder';
}

export interface ResolutionStrategy {
    onConflict: (conflict: MigrationConflict) => Promise<boolean>;
    onError?: (error: Error) => Promise<void>;
    onResolved?: (conflict: MigrationConflict) => Promise<void>;
}

export class MigrationResolver {
    private provider: SQLServerProvider;
    private executor: MigrationExecutor;
    private migrationsPath: string;

    constructor(provider: SQLServerProvider, migrationsPath: string) {
        this.provider = provider;
        this.executor = new MigrationExecutor(provider['connection']);
        this.migrationsPath = migrationsPath;
    }

    // ============ Conflict Detection ============

    async detectConflicts(
        migrations: MigrationFile[],
        options?: ResolveOptions
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];

        // Get applied migrations
        const applied = await this.executor.getAppliedMigrations();
        const appliedMap = new Map(applied.map(m => [m.MigrationId, m]));

        // 1. Check version conflicts
        const versionConflicts = await this.detectVersionConflicts(migrations, appliedMap);
        conflicts.push(...versionConflicts);

        // 2. Check checksum conflicts
        const checksumConflicts = await this.detectChecksumConflicts(migrations, appliedMap);
        conflicts.push(...checksumConflicts);

        // 3. Check dependency conflicts
        const dependencyConflicts = await this.detectDependencyConflicts(migrations, appliedMap);
        conflicts.push(...dependencyConflicts);

        // 4. Check order conflicts
        const orderConflicts = await this.detectOrderConflicts(migrations, appliedMap);
        conflicts.push(...orderConflicts);

        // 5. Check baseline conflicts
        if (options?.checkBaseline) {
            const baselineConflicts = await this.detectBaselineConflicts(migrations);
            conflicts.push(...baselineConflicts);
        }

        return conflicts;
    }

    private async detectVersionConflicts(
        migrations: MigrationFile[],
        appliedMap: Map<string, any>
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];
        const versionMap = new Map<string, MigrationFile[]>();

        // Group by version
        migrations.forEach(m => {
            const version = m.version.split('_')[0];
            if (!versionMap.has(version)) {
                versionMap.set(version, []);
            }
            versionMap.get(version)!.push(m);
        });

        // Check for multiple migrations with same version
        for (const [version, files] of versionMap) {
            if (files.length > 1) {
                conflicts.push({
                    migrationId: files.map(f => f.id).join(', '),
                    type: 'version',
                    description: `Multiple migrations with same version ${version}: ${files.map(f => f.name).join(', ')}`
                });
            }
        }

        // Check for version downgrade
        const maxAppliedVersion = Math.max(...Array.from(appliedMap.keys())
            .map(id => parseInt(id.split('_')[0]) || 0));
        
        const maxPendingVersion = Math.max(...migrations
            .map(m => parseInt(m.version.split('_')[0]) || 0));

        if (maxPendingVersion < maxAppliedVersion) {
            conflicts.push({
                migrationId: 'version_downgrade',
                type: 'version',
                description: `Attempting to migrate to older version ${maxPendingVersion} from ${maxAppliedVersion}`
            });
        }

        return conflicts;
    }

    private async detectChecksumConflicts(
        migrations: MigrationFile[],
        appliedMap: Map<string, any>
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];

        for (const migration of migrations) {
            const applied = appliedMap.get(migration.id);
            
            if (applied) {
                const currentChecksum = this.calculateChecksum(migration.content);
                
                if (currentChecksum !== applied.Checksum) {
                    conflicts.push({
                        migrationId: migration.id,
                        type: 'checksum',
                        description: `Migration ${migration.id} has been modified since it was applied. Expected: ${applied.Checksum}, Got: ${currentChecksum}`
                    });
                }
            }
        }

        return conflicts;
    }

    private async detectDependencyConflicts(
        migrations: MigrationFile[],
        appliedMap: Map<string, any>
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];
        const migrationMap = new Map(migrations.map(m => [m.id, m]));

        for (const migration of migrations) {
            if (migration.dependencies) {
                for (const depId of migration.dependencies) {
                    // Check if dependency exists
                    if (!migrationMap.has(depId) && !appliedMap.has(depId)) {
                        conflicts.push({
                            migrationId: migration.id,
                            type: 'dependency',
                            description: `Migration ${migration.id} depends on missing migration ${depId}`
                        });
                    }

                    // Check for circular dependencies
                    if (this.hasCircularDependency(migration, depId, migrationMap)) {
                        conflicts.push({
                            migrationId: migration.id,
                            type: 'dependency',
                            description: `Circular dependency detected between ${migration.id} and ${depId}`
                        });
                    }
                }
            }
        }

        return conflicts;
    }

    private hasCircularDependency(
        migration: MigrationFile,
        targetId: string,
        migrationMap: Map<string, MigrationFile>,
        visited: Set<string> = new Set()
    ): boolean {
        if (visited.has(migration.id)) return false;
        visited.add(migration.id);

        const target = migrationMap.get(targetId);
        if (!target || !target.dependencies) return false;

        if (target.dependencies.includes(migration.id)) return true;

        for (const dep of target.dependencies) {
            if (this.hasCircularDependency(target, dep, migrationMap, visited)) {
                return true;
            }
        }

        return false;
    }

    private async detectOrderConflicts(
        migrations: MigrationFile[],
        appliedMap: Map<string, any>
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];

        // Sort migrations by timestamp
        const sortedMigrations = [...migrations].sort((a, b) => 
            a.version.localeCompare(b.version)
        );

        // Check if any applied migration is out of order
        let lastAppliedVersion = '0';
        for (const migration of sortedMigrations) {
            if (appliedMap.has(migration.id)) {
                if (migration.version < lastAppliedVersion) {
                    conflicts.push({
                        migrationId: migration.id,
                        type: 'order',
                        description: `Migration ${migration.id} (${migration.version}) is out of order. Expected after ${lastAppliedVersion}`
                    });
                }
                lastAppliedVersion = migration.version;
            }
        }

        return conflicts;
    }

    private async detectBaselineConflicts(
        migrations: MigrationFile[]
    ): Promise<MigrationConflict[]> {
        const conflicts: MigrationConflict[] = [];

        // Check for baseline migration
        const hasBaseline = migrations.some(m => 
            m.name.toLowerCase().includes('baseline') || 
            m.name.toLowerCase().includes('initial')
        );

        if (!hasBaseline) {
            conflicts.push({
                migrationId: 'baseline_missing',
                type: 'order',
                description: 'No baseline/initial migration found. Consider creating an initial schema migration.'
            });
        }

        return conflicts;
    }

    // ============ Conflict Resolution ============

    async resolveConflicts(
        conflicts: MigrationConflict[],
        strategy: ResolutionStrategy
    ): Promise<boolean> {
        let resolved = true;

        for (const conflict of conflicts) {
            try {
                const canResolve = await strategy.onConflict(conflict);
                
                if (canResolve) {
                    await this.applyResolution(conflict);
                    await strategy.onResolved?.(conflict);
                } else {
                    resolved = false;
                }
            } catch (error) {
                await strategy.onError?.(error);
                resolved = false;
            }
        }

        return resolved;
    }

    private async applyResolution(conflict: MigrationConflict): Promise<void> {
        switch (conflict.resolution) {
            case 'skip':
                await this.skipMigration(conflict.migrationId);
                break;
            case 'override':
                await this.overrideMigration(conflict.migrationId);
                break;
            case 'rename':
                await this.renameMigration(conflict.migrationId);
                break;
            case 'reorder':
                await this.reorderMigrations(conflict);
                break;
        }
    }

    private async skipMigration(migrationId: string): Promise<void> {
        // Mark migration as skipped in migrations table
        await this.provider.executeQuery(`
            INSERT INTO [__Migrations] (
                [MigrationId], [Name], [Version], [AppliedAt],
                [Duration], [Checksum], [Status], [Error]
            ) VALUES (
                @migrationId, @name, @version, GETUTCDATE(),
                0, @checksum, 'Skipped', 'Manually skipped'
            )
        `, [migrationId, 'Skipped', '0.0.0', 'SKIPPED']);
    }

    private async overrideMigration(migrationId: string): Promise<void> {
        // Update checksum in migrations table
        const migration = await this.loadMigrationFile(migrationId);
        const checksum = this.calculateChecksum(migration.content);

        await this.provider.executeQuery(`
            UPDATE [__Migrations]
            SET [Checksum] = @checksum,
                [Error] = 'Checksum overridden'
            WHERE [MigrationId] = @migrationId
        `, [checksum, migrationId]);
    }

    private async renameMigration(migrationId: string): Promise<void> {
        const migration = await this.loadMigrationFile(migrationId);
        const newId = `${migration.version}_${migration.name}_${Date.now()}`;
        
        // Rename file
        const oldPath = path.join(this.migrationsPath, `${migrationId}.sql`);
        const newPath = path.join(this.migrationsPath, `${newId}.sql`);
        
        await fs.rename(oldPath, newPath);
    }

    private async reorderMigrations(conflict: MigrationConflict): Promise<void> {
        // Reorder migration files by timestamp
        const files = await fs.readdir(this.migrationsPath);
        const migrations = await Promise.all(
            files
                .filter(f => f.endsWith('.sql'))
                .map(f => this.parseMigrationFile(f))
        );

        migrations.sort((a, b) => a.version.localeCompare(b.version));

        // Rename files to correct order
        for (let i = 0; i < migrations.length; i++) {
            const migration = migrations[i];
            const newVersion = `${Date.now() + i}`.substring(0, 14);
            const newId = `${newVersion}_${migration.name.replace(/\.[^/.]+$/, '')}.sql`;
            
            const oldPath = path.join(this.migrationsPath, migration.filename);
            const newPath = path.join(this.migrationsPath, newId);
            
            await fs.rename(oldPath, newPath);
        }
    }

    // ============ Migration Validation ============

    async validateMigrationOrder(): Promise<boolean> {
        const files = await fs.readdir(this.migrationsPath);
        const migrations = files
            .filter(f => f.endsWith('.sql'))
            .map(f => this.parseMigrationFile(f))
            .sort((a, b) => a.version.localeCompare(b.version));

        let isValid = true;
        let lastVersion = '0';

        for (const migration of migrations) {
            if (migration.version <= lastVersion) {
                console.error(`❌ Migration order error: ${migration.filename} (${migration.version}) should be after ${lastVersion}`);
                isValid = false;
            }
            lastVersion = migration.version;
        }

        return isValid;
    }

    async validateMigrationSyntax(): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const files = await fs.readdir(this.migrationsPath);
        
        for (const file of files) {
            if (!file.endsWith('.sql')) continue;

            const content = await fs.readFile(path.join(this.migrationsPath, file), 'utf8');
            
            // Check for basic SQL syntax
            if (!content.trim()) {
                errors.push(`Migration ${file} is empty`);
            }

            // Check for transaction blocks
            if (!content.includes('BEGIN TRANSACTION') && !content.includes('BEGIN TRAN')) {
                warnings.push(`Migration ${file} does not use transactions`);
            }

            // Check for DOWN migration
            if (!content.includes('-- DOWN')) {
                warnings.push(`Migration ${file} does not include a DOWN section`);
            }

            // Check for GO statements
            if (content.includes('GO')) {
                warnings.push(`Migration ${file} contains GO statements which may not work in all SQL Server tools`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============ Helper Methods ============

    private async loadMigrationFile(migrationId: string): Promise<MigrationFile> {
        const files = await fs.readdir(this.migrationsPath);
        const file = files.find(f => f.startsWith(migrationId) && f.endsWith('.sql'));
        
        if (!file) {
            throw new Error(`Migration file not found: ${migrationId}`);
        }

        const content = await fs.readFile(path.join(this.migrationsPath, file), 'utf8');
        
        return {
            id: migrationId,
            filename: file,
            name: this.extractMigrationName(file),
            version: this.extractVersion(file),
            content,
            dependencies: this.extractDependencies(content)
        };
    }

    private parseMigrationFile(filename: string): MigrationFile {
        const id = filename.replace('.sql', '');
        const match = filename.match(/^(\d{14})_(.+)\.sql$/);
        
        return {
            id,
            filename,
            name: match ? match[2].replace(/_/g, ' ') : filename,
            version: match ? match[1] : '0',
            content: '',
            dependencies: []
        };
    }

    private extractMigrationName(filename: string): string {
        const match = filename.match(/^\d{14}_(.+)\.sql$/);
        return match ? match[1].replace(/_/g, ' ') : filename.replace('.sql', '');
    }

    private extractVersion(filename: string): string {
        const match = filename.match(/^(\d{14})_/);
        return match ? match[1] : '0';
    }

    private extractDependencies(content: string): string[] {
        const dependencies: string[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.startsWith('-- Depends on:')) {
                const dep = line.substring(14).trim();
                if (dep) {
                    dependencies.push(dep);
                }
            }
        }

        return dependencies;
    }

    private calculateChecksum(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    // ============ Reporting ============

    async generateConflictReport(conflicts: MigrationConflict[]): Promise<string> {
        let report = '# Migration Conflict Report\n\n';
        report += `Generated: ${new Date().toISOString()}\n`;
        report += `Conflicts Found: ${conflicts.length}\n\n`;

        const groupedConflicts = this.groupConflictsByType(conflicts);

        for (const [type, typeConflicts] of Object.entries(groupedConflicts)) {
            report += `## ${type.toUpperCase()} Conflicts\n\n`;

            typeConflicts.forEach((conflict, index) => {
                report += `${index + 1}. **${conflict.migrationId}**\n`;
                report += `   - Description: ${conflict.description}\n`;
                report += `   - Suggested Resolution: ${conflict.resolution || 'Manual'}\n\n`;
            });
        }

        report += '\n## Resolution Strategies\n\n';
        report += '1. **Skip** - Skip this migration (mark as applied)\n';
        report += '2. **Override** - Force apply with new checksum\n';
        report += '3. **Rename** - Rename migration to resolve conflict\n';
        report += '4. **Reorder** - Reorder migrations chronologically\n';

        return report;
    }

    private groupConflictsByType(conflicts: MigrationConflict[]): Record<string, MigrationConflict[]> {
        return conflicts.reduce((acc, conflict) => {
            if (!acc[conflict.type]) {
                acc[conflict.type] = [];
            }
            acc[conflict.type].push(conflict);
            return acc;
        }, {} as Record<string, MigrationConflict[]>);
    }

    async suggestResolution(conflict: MigrationConflict): Promise<string> {
        switch (conflict.type) {
            case 'version':
                return 'Rename the migration file with a newer timestamp';
            case 'checksum':
                return 'Override the checksum if changes are intentional, otherwise restore original file';
            case 'dependency':
                return 'Create missing dependency migration or remove the dependency reference';
            case 'order':
                return 'Reorder migration files to maintain chronological order';
            default:
                return 'Manual intervention required';
        }
    }
}

export interface ResolveOptions {
    checkBaseline?: boolean;
    autoResolve?: boolean;
    dryRun?: boolean;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface MigrationFile {
    id: string;
    filename: string;
    name: string;
    version: string;
    content: string;
    dependencies: string[];
}