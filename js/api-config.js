const DEFAULT_HOSTED_API_ORIGIN = 'https://genesis-player.vercel.app';
const API_OVERRIDE_STORAGE_KEY = 'genesis_api_base_url';

/**
 * List of API paths that strictly require a backend.
 * Features like local library scanning and playback do NOT need these.
 */
const ONLINE_FEATURES = [
    '/api/discover',
    '/api/deezer',
    '/api/spotify',
    '/api/lyrics'
];

function normalizeOrigin(origin = '') {
    const trimmed = String(origin || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
}

function isLocalhostHostname(hostname = '') {
    const value = String(hostname || '').toLowerCase();
    return value === 'localhost'
        || value === '127.0.0.1'
        || value === '0.0.0.0'
        || value === '[::1]';
}

function isHostedWebOrigin(url = '') {
    return normalizeOrigin(url) === DEFAULT_HOSTED_API_ORIGIN;
}

export function getStoredApiOverride() {
    try {
        const runtimeOverride = typeof window !== 'undefined' ? window.GENESIS_API_BASE_URL : '';
        if (runtimeOverride) return normalizeOrigin(runtimeOverride);

        return normalizeOrigin(localStorage.getItem(API_OVERRIDE_STORAGE_KEY) || '');
    } catch (error) {
        return '';
    }
}

export function getApiBaseUrl() {
    const override = getStoredApiOverride();
    if (override) return override;

    if (typeof window === 'undefined') {
        return DEFAULT_HOSTED_API_ORIGIN;
    }

    const { location } = window;
    const protocol = location?.protocol || '';
    const hostname = location?.hostname || '';
    const origin = normalizeOrigin(location?.origin || '');

    if (protocol === 'capacitor:' || protocol === 'file:' || origin === 'null' || !origin) {
        return DEFAULT_HOSTED_API_ORIGIN;
    }

    if (protocol === 'http:' && isLocalhostHostname(hostname)) {
        return '';
    }

    if (protocol === 'https:' && isHostedWebOrigin(origin)) {
        return '';
    }

    return origin || DEFAULT_HOSTED_API_ORIGIN;
}

export function createApiUrl(path = '') {
    const value = String(path || '');
    if (/^https?:\/\//i.test(value)) return value;

    const normalizedPath = value.startsWith('/') ? value : `/${value}`;
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}${normalizedPath}`;
}

export function setApiBaseUrlOverride(nextValue = '') {
    const normalized = normalizeOrigin(nextValue);
    try {
        if (normalized) {
            localStorage.setItem(API_OVERRIDE_STORAGE_KEY, normalized);
        } else {
            localStorage.removeItem(API_OVERRIDE_STORAGE_KEY);
        }
    } catch (error) {
        console.warn('Unable to persist API base URL override:', error);
    }

    if (typeof window !== 'undefined') {
        window.GENESIS_API_BASE_URL = normalized;
    }

    return normalized;
}

export function getDefaultHostedApiOrigin() {
    return DEFAULT_HOSTED_API_ORIGIN;
}

/**
 * Check if a specific path requires an active internet connection/backend.
 * Use this to prevent the app from hanging on startup by skipping online fetches.
 */
export function isOnlineFeature(path = '') {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return ONLINE_FEATURES.some(feature => normalized.startsWith(feature));
}

/**
 * Returns true if the current environment is a mobile app (Capacitor).
 */
export function isMobileApp() {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
}
