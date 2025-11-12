#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Replace @shared imports with relative paths
 */
function replaceSharedImports(filePath, relativeDepth) {
  let content = fs.readFileSync(filePath, 'utf8');
  const relativePath = '../'.repeat(relativeDepth) + 'shared-dist';
  
  // Replace all @shared/ imports with relative paths
  content = content.replace(/@shared\//g, `${relativePath}/`);
  
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Recursively copy directory and fix imports
 */
function copyDirAndFixImports(src, dest, baseDepth = 0) {
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
      copyDirAndFixImports(srcPath, destPath, baseDepth + 1);
    } else {
      fs.copyFileSync(srcPath, destPath);
      
      // Fix imports in .js files
      if (entry.name.endsWith('.js')) {
        replaceSharedImports(destPath, baseDepth);
      }
    }
  }
}

// Copy server/dist to netlify/.build/server-dist (outside functions directory)
const serverSrc = path.join(__dirname, '..', 'server', 'dist');
const serverDest = path.join(__dirname, '..', 'netlify', '.build', 'server-dist');

// Copy shared/dist to netlify/.build/shared-dist (outside functions directory)
const sharedSrc = path.join(__dirname, '..', 'shared', 'dist');
const sharedDest = path.join(__dirname, '..', 'netlify', '.build', 'shared-dist');

console.log('📦 Preparing Netlify functions...');

try {
  if (fs.existsSync(sharedSrc)) {
    console.log('  ✓ Copying shared/dist → netlify/.build/shared-dist');
    // Copy shared without fixing imports (it's the base)
    const copyDir = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
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
    };
    copyDir(sharedSrc, sharedDest);
  } else {
    console.warn('  ⚠ shared/dist not found, skipping');
  }

  if (fs.existsSync(serverSrc)) {
    console.log('  ✓ Copying server/dist → netlify/.build/server-dist');
    copyDirAndFixImports(serverSrc, serverDest, 2);
    console.log('  ✓ Fixed @shared imports in server-dist');
  } else {
    console.warn('  ⚠ server/dist not found, skipping');
  }

  console.log('✅ Functions prepared successfully');
} catch (error) {
  console.error('❌ Error preparing functions:', error);
  process.exit(1);
}

