const cp = require('child_process');
const fs = require('fs');
const key = fs.readFileSync(process.env.USERPROFILE + '/.tauri/103finder-updater.key', 'utf8').trim();

console.log('Starting sign...');
try {
    cp.execSync('npx tauri signer sign "src-tauri/target/release/bundle/nsis/103 Finder_0.1.2_x64-setup.exe"', { 
        stdio: 'inherit', 
        env: { 
            ...process.env, 
            TAURI_SIGNING_PRIVATE_KEY: key,
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' 
        } 
    });
    console.log('Done!');
} catch (err) {
    console.error('Sign failed:', err.message);
    process.exit(1);
}
