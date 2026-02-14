#!/usr/bin/env node

import { Command } from 'commander';
import { NovaCompiler } from './compiler';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();
const compiler = new NovaCompiler();

program
    .name('novac')
    .description('NOVA Framework Compiler')
    .version('1.0.0');

program
    .command('compile <file>')
    .description('Compile a NOVA object file')
    .option('-o, --output <dir>', 'Output directory', './dist')
    .option('-d, --debug', 'Enable debug output')
    .option('--no-sql', 'Skip SQL generation')
    .option('--no-ts', 'Skip TypeScript generation')
    .option('--optimize', 'Enable optimizations')
    .action(async (file, options) => {
        const spinner = ora('Compiling...').start();

        try {
            const result = await compiler.compileFile(file, {
                debug: options.debug,
                generateSQL: options.sql !== false,
                generateTypescript: options.ts !== false,
                optimize: options.optimize
            });

            spinner.stop();

            // Display diagnostics
            result.diagnostics.forEach(diagnostic => {
                const prefix = diagnostic.severity === 'error' ? chalk.red('✖') :
                              diagnostic.severity === 'warning' ? chalk.yellow('⚠') :
                              chalk.blue('ℹ');
                
                console.log(`${prefix} ${diagnostic.message}`);
                if (diagnostic.position) {
                    console.log(`   at line ${diagnostic.position.line}, column ${diagnostic.position.column}`);
                }
            });

            if (result.success) {
                console.log(chalk.green('\n✓ Compilation successful!'));
                
                // Write output files
                if (result.outputs) {
                    await fs.ensureDir(options.output);
                    
                    for (const output of result.outputs) {
                        const outputPath = path.join(options.output, output.filename);
                        await fs.writeFile(outputPath, output.content);
                        console.log(chalk.dim(`  └─ Generated ${outputPath}`));
                    }
                }

                console.log(chalk.dim(`\n⏱  Completed in ${result.duration}ms`));
            } else {
                console.log(chalk.red('\n✗ Compilation failed'));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n✗ Compilation error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Initialize a new NOVA project')
    .action(async () => {
        const projectName = path.basename(process.cwd());
        
        // Create project structure
        await fs.ensureDir('src/tables');
        await fs.ensureDir('src/pages');
        await fs.ensureDir('src/codeunits');
        await fs.ensureDir('src/reports');
        await fs.ensureDir('src/xmlports');
        await fs.ensureDir('dist');

        // Create project file
        const projectConfig = {
            name: projectName,
            version: '1.0.0',
            files: [
                'src/tables/*.al',
                'src/pages/*.al',
                'src/codeunits/*.al',
                'src/reports/*.al',
                'src/xmlports/*.al'
            ],
            options: {
                generateSQL: true,
                generateTypescript: true,
                target: 'node'
            }
        };

        await fs.writeJSON('nova.json', projectConfig, { spaces: 2 });

        // Create example table
        const exampleTable = `table 50100 Customer
{
    fields
    {
        field(1; "No."; Code[20]) { PrimaryKey = true; }
        field(2; "Name"; Text[100]) { NotBlank = true; }
        field(3; "Balance"; Decimal) { }
        field(4; "Credit Limit"; Decimal) { }
    }

    keys
    {
        key(PK; "No.") { Clustered = true; }
    }

    triggers
    {
        trigger OnInsert()
        {
            if (Rec.Balance > Rec."Credit Limit") then
                Error('Credit limit exceeded');
        }
    }
}`;

        await fs.writeFile('src/tables/Customer.al', exampleTable);

        console.log(chalk.green('✓ NOVA project initialized successfully!'));
        console.log(chalk.dim('\nProject structure:'));
        console.log(chalk.dim('  ├─ src/'));
        console.log(chalk.dim('  │  ├─ tables/'));
        console.log(chalk.dim('  │  ├─ pages/'));
        console.log(chalk.dim('  │  ├─ codeunits/'));
        console.log(chalk.dim('  │  ├─ reports/'));
        console.log(chalk.dim('  │  └─ xmlports/'));
        console.log(chalk.dim('  ├─ dist/'));
        console.log(chalk.dim('  └─ nova.json'));
        console.log(chalk.dim('\nNext steps:'));
        console.log(chalk.dim('  1. Edit your object definitions'));
        console.log(chalk.dim('  2. Run novac compile src/tables/*.al'));
    });

program
    .command('build')
    .description('Build entire project')
    .option('-o, --output <dir>', 'Output directory', './dist')
    .action(async (options) => {
        const spinner = ora('Building project...').start();

        try {
            // Load project configuration
            const projectConfig = await fs.readJSON('nova.json');
            
            // Find all source files
            const files: string[] = [];
            for (const pattern of projectConfig.files) {
                const matches = await fs.glob(pattern);
                files.push(...matches);
            }

            // Compile each file
            const results = [];
            for (const file of files) {
                const result = await compiler.compileFile(file, {
                    ...projectConfig.options,
                    debug: false
                });
                results.push(result);
            }

            spinner.stop();

            // Display summary
            const successCount = results.filter(r => r.success).length;
            const errorCount = results.filter(r => !r.success).length;
            const totalDuration = results.reduce((acc, r) => acc + r.duration, 0);

            console.log(chalk.green(`\n✓ Build completed: ${successCount} succeeded, ${errorCount} failed`));
            console.log(chalk.dim(`⏱  Total time: ${totalDuration}ms`));

            if (errorCount > 0) {
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n✗ Build failed: ${error.message}`));
            process.exit(1);
        }
    });

program.parse(process.argv);