#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy server/dist to netlify/functions/server-dist
const serverSrc = path.join(__dirname, '..', 'server', 'dist');
const serverDest = path.join(__dirname, '..', 'netlify', 'functions', 'server-dist');

// Copy shared/dist to netlify/functions/shared-dist
const sharedSrc = path.join(__dirname, '..', 'shared', 'dist');
const sharedDest = path.join(__dirname, '..', 'netlify', 'functions', 'shared-dist');

console.log('📦 Preparing Netlify functions...');

try {
  if (fs.existsSync(serverSrc)) {
    console.log('  ✓ Copying server/dist → netlify/functions/server-dist');
    copyDir(serverSrc, serverDest);
  } else {
    console.warn('  ⚠ server/dist not found, skipping');
  }

  if (fs.existsSync(sharedSrc)) {
    console.log('  ✓ Copying shared/dist → netlify/functions/shared-dist');
    copyDir(sharedSrc, sharedDest);
  } else {
    console.warn('  ⚠ shared/dist not found, skipping');
  }

  console.log('✅ Functions prepared successfully');
} catch (error) {
  console.error('❌ Error preparing functions:', error);
  process.exit(1);
}

