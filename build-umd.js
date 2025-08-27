#!/usr/bin/env node
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'CTrackerSDK',
  outfile: 'dist/ctracker-sdk.umd.js',
  sourcemap: true,
  target: ['es2020'],
  platform: 'browser',
  external: [
    // peer / environment provided
    'ethers',
    // Node built-ins or server-only libs
    'path','os','crypto','fs','dotenv'
  ],
  banner: { js: '/* C-Tracker SDK UMD Build */' }
}).then(()=>{
  console.log('UMD build complete: dist/ctracker-sdk.umd.js');
}).catch(e=>{ console.error(e); process.exit(1); });
