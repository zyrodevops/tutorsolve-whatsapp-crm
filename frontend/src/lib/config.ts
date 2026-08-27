// Empty string → all fetch calls use relative paths (/api/...) which are
// transparently proxied to the backend by Next.js rewrites (see next.config.ts).
// Set NEXT_PUBLIC_API_URL to a full URL only for local dev without the Docker
// proxy (e.g. NEXT_PUBLIC_API_URL=http://localhost:5000).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

