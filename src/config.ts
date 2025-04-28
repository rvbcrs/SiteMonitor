// Use the page's origin when no env var is set
const DEFAULT_URL = window.location.origin;
export const API_URL = process.env.REACT_APP_API_URL || DEFAULT_URL;
export const WS_URL = process.env.REACT_APP_WS_URL || DEFAULT_URL;
