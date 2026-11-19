// DSH's bundle loader resolves the package root index.js by convention.
// The implementation lives in dist/index.js; keep this shim stable.
export * from './dist/index.js';
