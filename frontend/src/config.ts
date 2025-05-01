// Use the page's origin as the default for all environments
const DEFAULT_URL = window.location.origin;
console.log("[config.ts] window.location.origin:", DEFAULT_URL);

export const API_URL = process.env.REACT_APP_API_URL || DEFAULT_URL;
export const WS_URL = process.env.REACT_APP_WS_URL || DEFAULT_URL;

console.log("[config.ts] Exported API_URL:", API_URL);
console.log("[config.ts] Exported WS_URL:", WS_URL);
