// Determine default backend URL: in development use localhost:3001, otherwise use current origin
const DEFAULT_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : window.location.origin;

export const API_URL = process.env.REACT_APP_API_URL || DEFAULT_URL;
export const WS_URL = process.env.REACT_APP_WS_URL || DEFAULT_URL;
