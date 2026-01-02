import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const releaseDir = path.join(projectRoot, 'release');
const companionDir = path.join(releaseDir, 'companion');

console.log('--- Starting Build ---');
try {
    // 1. Run Webpack directly
    console.log('Running Webpack...');
    execSync('npx webpack -c ./node_modules/@companion-module/tools/webpack.config.cjs --output-path ./dist', { stdio: 'inherit' });

    // 2. Prepare Release Folder
    console.log('Preparing release folder...');
    if (fs.existsSync(releaseDir)) {
        fs.rmSync(releaseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(companionDir, { recursive: true });

    // 3. Read package.json for versioning
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log(`Version: ${pkg.version}`);

    // 4. Update and Copy manifest.json
    const manifest = JSON.parse(fs.readFileSync('companion/manifest.json', 'utf8'));
    manifest.version = pkg.version;
    manifest.runtime.entrypoint = 'main.js'; // Ensure it points to local main.js

    fs.writeFileSync(path.join(companionDir, 'manifest.json'), JSON.stringify(manifest, null, 4));
    console.log('Manifest updated and copied.');

    // 5. Copy main.js and package.json
    fs.copyFileSync('dist/main.js', path.join(companionDir, 'main.js'));

    // Create a lean package.json for the release
    const releasePkg = {
        name: pkg.name,
        version: pkg.version,
        main: "companion/main.js",
        type: "commonjs",
        dependencies: pkg.dependencies
    };
    fs.writeFileSync(path.join(releaseDir, 'package.json'), JSON.stringify(releasePkg, null, 4));

    if (fs.existsSync('HELP.md')) {
        fs.copyFileSync('HELP.md', path.join(releaseDir, 'HELP.md'));
    }

    // 6. Create TGZ
    console.log('Creating release.tgz...');
    execSync('tar -czf release.tgz -C release .', { stdio: 'inherit' });

    console.log('\n--- SUCCESS ---');
    console.log('Release package created: release.tgz');
} catch (error) {
    console.error('\n--- FAILED ---');
    console.error(error.message);
    process.exit(1);
}