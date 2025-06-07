// packages/frontend/src/custom.d.ts

// This tells TypeScript that the global 'Window' interface has an optional
// 'ethereum' property. We type it as 'any' for simplicity, as the full
// EIP-1193 provider type can be complex. This is sufficient to resolve
// the build error in a type-safe way.
interface Window {
  ethereum?: any;
}