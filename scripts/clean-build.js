const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

async function cleanBuild() {
    console.log('🧹 Cleaning previous builds...');
    
    // Delete all dist folders
    const packages = [
        'packages/core',
        'packages/metadata', 
        'packages/orm',
        'packages/compiler',
        'packages/security',
        'packages/reporting',
        'packages/integration',
        'packages/ui',
        'apps/runtime',
        'apps/studio'
    ];

    packages.forEach(pkg => {
        const distPath = path.join(process.cwd(), pkg, 'dist');
        if (fs.existsSync(distPath)) {
            fs.removeSync(distPath);
            console.log(`   ✅ Removed ${pkg}/dist`);
        }
    });

    // Delete tsconfig.tsbuildinfo files
    packages.forEach(pkg => {
        const tsBuildInfoPath = path.join(process.cwd(), pkg, 'tsconfig.tsbuildinfo');
        if (fs.existsSync(tsBuildInfoPath)) {
            fs.removeSync(tsBuildInfoPath);
            console.log(`   ✅ Removed ${pkg}/tsconfig.tsbuildinfo`);
        }
        
        const distBuildInfoPath = path.join(process.cwd(), pkg, 'dist', '.tsbuildinfo');
        if (fs.existsSync(distBuildInfoPath)) {
            fs.removeSync(distBuildInfoPath);
            console.log(`   ✅ Removed ${pkg}/dist/.tsbuildinfo`);
        }
    });

    // Clean node_modules/.cache
    const cachePath = path.join(process.cwd(), 'node_modules', '.cache');
    if (fs.existsSync(cachePath)) {
        fs.removeSync(cachePath);
        console.log('   ✅ Removed node_modules/.cache');
    }

    console.log('\n✅ Clean completed successfully!');
}

cleanBuild().catch(console.error);