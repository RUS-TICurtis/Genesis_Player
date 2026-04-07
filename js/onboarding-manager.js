import { debounce, getFallbackImage, truncate } from './utils.js';
import { createApiUrl } from './api-config.js';
import { switchSection } from './ui-manager.js';

const TASTE_PROFILE_STORAGE_KEY = 'genesis_taste_profile_v1';
const MIN_SELECTED_ARTISTS = 10;
const MIN_STARTER_ARTISTS = 20;
const STARTER_GENRES = ['Afrobeats', 'Rap', 'Pop', 'R&B', 'Gospel', 'Dance', 'Indie', 'Rock'];
const STARTER_ARTISTS = [
    { name: 'Asake', genres: ['Afrobeats', 'Pop'] },
    { name: 'Tems', genres: ['Afrobeats', 'R&B'] },
    { name: 'Burna Boy', genres: ['Afrobeats', 'Pop'] },
    { name: 'Ayra Starr', genres: ['Afrobeats', 'Pop'] },
    { name: 'Black Sherif', genres: ['Afrobeats', 'Rap'] },
    { name: 'Kendrick Lamar', genres: ['Rap'] },
    { name: 'J. Cole', genres: ['Rap'] },
    { name: 'Little Simz', genres: ['Rap'] },
    { name: 'Drake', genres: ['Rap', 'R&B'] },
    { name: 'SZA', genres: ['R&B', 'Pop'] },
    { name: 'Summer Walker', genres: ['R&B'] },
    { name: 'Brent Faiyaz', genres: ['R&B'] },
    { name: 'The Weeknd', genres: ['Pop', 'R&B'] },
    { name: 'Tyla', genres: ['Pop', 'Afrobeats'] },
    { name: 'Dua Lipa', genres: ['Pop', 'Dance'] },
    { name: 'Billie Eilish', genres: ['Pop', 'Indie'] },
    { name: 'Maverick City Music', genres: ['Gospel'] },
    { name: 'Kirk Franklin', genres: ['Gospel'] },
    { name: 'DOE', genres: ['Gospel', 'R&B'] },
    { name: 'Fred again..', genres: ['Dance', 'Indie'] },
    { name: 'Calvin Harris', genres: ['Dance', 'Pop'] },
    { name: 'Rema', genres: ['Afrobeats', 'Pop'] },
    { name: 'Paramore', genres: ['Rock', 'Indie'] },
    { name: 'Foo Fighters', genres: ['Rock'] }
];

const onboardingState = {
    selectedArtists: [],
    selectedGenres: [],
    relatedArtists: [],
    inlineRelatedArtists: [],
    expandedArtistKey: '',
    searchResults: [],
    searchQuery: '',
    returnSectionId: 'discover-section',
    initialized: false
};

const loadedRelatedArtistIds = new Set();
const artistLookupCache = new Map();
const pendingArtistLookups = new Map();
let onboardingCompleteHandler = null;

function normalizeText(value = '') {
    return String(value).trim().toLowerCase();
}

function slugify(value = '') {
    return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function createArtistKey(artist) {
    return artist?.deezerId ? `deezer-${artist.deezerId}` : `name-${slugify(artist?.name || '')}`;
}

function createArtistNameKey(name = '') {
    return `name-${slugify(name)}`;
}

function uniqueArtists(artists = []) {
    const seen = new Set();
    const deduped = [];

    artists.forEach((artist) => {
        const normalized = normalizeArtist(artist);
        const key = createArtistKey(normalized);
        if (!normalized.name || seen.has(key)) return;
        seen.add(key);
        deduped.push(normalized);
    });

    return deduped;
}

function normalizeArtist(artist = {}) {
    const name = artist.name || artist.artist || 'Unknown Artist';
    const deezerId = artist.deezerId || artist.id || null;
    const genres = Array.isArray(artist.genres) ? artist.genres.filter(Boolean) : [];

    return {
        id: deezerId ? String(deezerId) : `manual-${slugify(name) || 'artist'}`,
        deezerId: deezerId ? String(deezerId) : null,
        name,
        picture: artist.picture || getFallbackImage(name, name),
        genres,
        source: artist.source || 'local'
    };
}

async function resolveArtistFromDeezer(name, limit = 5) {
    const cacheKey = createArtistNameKey(name);
    if (artistLookupCache.has(cacheKey)) {
        return artistLookupCache.get(cacheKey);
    }

    if (pendingArtistLookups.has(cacheKey)) {
        return pendingArtistLookups.get(cacheKey);
    }

    const lookupPromise = (async () => {
        try {
            const matches = await fetchArtistSearchResults(name, limit);
            const exact = matches.find((match) => normalizeText(match.name) === normalizeText(name)) || matches[0] || normalizeArtist({ name });
            const normalized = normalizeArtist(exact);
            artistLookupCache.set(cacheKey, normalized);
            if (normalized.deezerId) {
                artistLookupCache.set(createArtistKey(normalized), normalized);
            }
            return normalized;
        } catch (error) {
            console.error('Failed to resolve starter artist from Deezer:', error);
            const fallbackArtist = normalizeArtist({ name });
            artistLookupCache.set(cacheKey, fallbackArtist);
            return fallbackArtist;
        } finally {
            pendingArtistLookups.delete(cacheKey);
        }
    })();

    pendingArtistLookups.set(cacheKey, lookupPromise);
    return lookupPromise;
}

function getCachedOrFallbackStarterArtist(artist) {
    return artistLookupCache.get(createArtistNameKey(artist.name)) || normalizeArtist(artist);
}

function safeReadProfile() {
    try {
        return JSON.parse(localStorage.getItem(TASTE_PROFILE_STORAGE_KEY) || 'null');
    } catch (error) {
        console.error('Failed to parse taste profile from storage:', error);
        return null;
    }
}

export function getTasteProfile() {
    const profile = safeReadProfile();
    if (!profile || !profile.completed) return null;

    return {
        ...profile,
        selectedGenres: Array.isArray(profile.selectedGenres) ? profile.selectedGenres : [],
        selectedArtists: uniqueArtists(profile.selectedArtists || []),
        relatedArtists: uniqueArtists(profile.relatedArtists || [])
    };
}

export function hasTasteProfile() {
    return Boolean(getTasteProfile());
}

export function getTasteProfileSeeds(limit = 6) {
    const profile = getTasteProfile();
    if (!profile) return [];

    const artistNames = uniqueArtists([
        ...(profile.selectedArtists || []),
        ...(profile.relatedArtists || [])
    ]).map((artist) => artist.name);

    return artistNames.slice(0, limit);
}

function getElements() {
    return {
        section: document.getElementById('taste-onboarding-section'),
        openBtn: document.getElementById('open-onboarding-btn'),
        closeBtn: document.getElementById('taste-onboarding-later-btn'),
        resetBtn: document.getElementById('taste-reset-btn'),
        searchInput: document.getElementById('taste-search-input'),
        searchDropdown: document.getElementById('taste-search-dropdown'),
        searchStatus: document.getElementById('taste-search-status'),
        chips: document.getElementById('taste-genre-chips'),
        selectedCount: document.getElementById('taste-selected-count'),
        progressLabel: document.getElementById('taste-progress-label'),
        selectedList: document.getElementById('taste-selected-list'),
        starterGrid: document.getElementById('taste-starter-grid'),
        feedback: document.getElementById('taste-feedback'),
        saveBtn: document.getElementById('taste-save-btn')
    };
}

function updateOpenButtonLabel() {
    const { openBtn } = getElements();
    if (!openBtn) return;
    openBtn.textContent = hasTasteProfile() ? 'Refine taste' : 'Set up taste';
}

function loadStateFromProfile() {
    const profile = getTasteProfile();

    onboardingState.selectedArtists = uniqueArtists(profile?.selectedArtists || []);
    onboardingState.selectedGenres = Array.isArray(profile?.selectedGenres) ? [...profile.selectedGenres] : [];
    onboardingState.relatedArtists = uniqueArtists(profile?.relatedArtists || []);
    onboardingState.inlineRelatedArtists = [];
    onboardingState.expandedArtistKey = '';
    onboardingState.searchResults = [];
    onboardingState.searchQuery = '';

    loadedRelatedArtistIds.clear();
    onboardingState.selectedArtists.forEach((artist) => {
        if (artist.deezerId) loadedRelatedArtistIds.add(String(artist.deezerId));
        artistLookupCache.set(createArtistNameKey(artist.name), artist);
        artistLookupCache.set(createArtistKey(artist), artist);
    });
    onboardingState.relatedArtists.forEach((artist) => {
        artistLookupCache.set(createArtistNameKey(artist.name), artist);
        artistLookupCache.set(createArtistKey(artist), artist);
    });
}

function getFilteredStarterArtists() {
    const activeGenres = onboardingState.selectedGenres;
    if (!activeGenres.length) {
        return STARTER_ARTISTS.map(getCachedOrFallbackStarterArtist);
    }

    return STARTER_ARTISTS
        .filter((artist) => artist.genres?.some((genre) => activeGenres.includes(genre)))
        .map(getCachedOrFallbackStarterArtist);
}

async function fetchArtistSearchResults(query, limit = 20) {
    const response = await fetch(createApiUrl(`/api/deezer/artists/search?q=${encodeURIComponent(query)}&limit=${limit}`));
    if (!response.ok) {
        throw new Error(`Artist search failed with status ${response.status}`);
    }

    const data = await response.json();
    return uniqueArtists(data);
}

async function fetchRelatedArtists(artistId, limit = 12) {
    const response = await fetch(createApiUrl(`/api/deezer/artists/${encodeURIComponent(artistId)}/related?limit=${limit}`));
    if (!response.ok) {
        throw new Error(`Related artist request failed with status ${response.status}`);
    }

    const data = await response.json();
    return uniqueArtists(data);
}

async function hydrateArtist(artist) {
    if (artist.deezerId) {
        artistLookupCache.set(createArtistNameKey(artist.name), artist);
        artistLookupCache.set(createArtistKey(artist), artist);
        return artist;
    }

    try {
        const resolvedArtist = await resolveArtistFromDeezer(artist.name, 5);
        return resolvedArtist ? normalizeArtist({ ...artist, ...resolvedArtist }) : artist;
    } catch (error) {
        console.error('Failed to hydrate artist details:', error);
        return artist;
    }
}

function isArtistSelected(artist) {
    const key = createArtistKey(artist);
    return onboardingState.selectedArtists.some((selected) => createArtistKey(selected) === key);
}

function toggleGenre(genre) {
    if (onboardingState.selectedGenres.includes(genre)) {
        onboardingState.selectedGenres = onboardingState.selectedGenres.filter((item) => item !== genre);
    } else {
        onboardingState.selectedGenres = [...onboardingState.selectedGenres, genre];
    }

    renderOnboardingState();
}

function removeArtistSelection(artist) {
    const key = createArtistKey(artist);
    onboardingState.selectedArtists = onboardingState.selectedArtists.filter((item) => createArtistKey(item) !== key);
    if (onboardingState.expandedArtistKey === key) {
        onboardingState.expandedArtistKey = '';
        onboardingState.inlineRelatedArtists = [];
    }
    renderOnboardingState();
}

async function addArtistSelection(artist) {
    const hydratedArtist = await hydrateArtist(artist);
    onboardingState.selectedArtists = uniqueArtists([...onboardingState.selectedArtists, hydratedArtist]);
    renderOnboardingState();
    maybeLoadRelatedArtists(hydratedArtist);
}

async function toggleArtistSelection(artist) {
    if (isArtistSelected(artist)) {
        removeArtistSelection(artist);
        return;
    }

    await addArtistSelection(artist);
}

async function maybeLoadRelatedArtists(artist) {
    if (!artist?.deezerId) return;

    onboardingState.expandedArtistKey = createArtistKey(artist);

    try {
        const related = await fetchRelatedArtists(artist.deezerId, 5);
        const selectedKeys = new Set(onboardingState.selectedArtists.map(createArtistKey));
        const existingRelatedKeys = new Set(onboardingState.relatedArtists.map(createArtistKey));
        const freshRelated = related.filter((candidate) => {
            const key = createArtistKey(candidate);
            return !selectedKeys.has(key) && !existingRelatedKeys.has(key);
        });

        onboardingState.inlineRelatedArtists = freshRelated.slice(0, 5);

        if (freshRelated.length > 0) {
            freshRelated.forEach((relatedArtist) => {
                artistLookupCache.set(createArtistNameKey(relatedArtist.name), relatedArtist);
                artistLookupCache.set(createArtistKey(relatedArtist), relatedArtist);
            });
            onboardingState.relatedArtists = uniqueArtists([...freshRelated, ...onboardingState.relatedArtists]).slice(0, 24);
        }
        renderOnboardingState();
    } catch (error) {
        console.error('Failed to load related artists:', error);
        onboardingState.inlineRelatedArtists = [];
        renderOnboardingState();
    } finally {
        loadedRelatedArtistIds.add(String(artist.deezerId));
    }
}

function renderGenreChips() {
    const { chips } = getElements();
    if (!chips) return;

    chips.innerHTML = STARTER_GENRES.map((genre) => {
        const selected = onboardingState.selectedGenres.includes(genre) ? 'selected' : '';
        return `<button class="taste-chip ${selected}" data-genre="${genre}" type="button">${genre}</button>`;
    }).join('');
}

function renderSelectedArtists() {
    const { selectedList } = getElements();
    if (!selectedList) return;

    if (!onboardingState.selectedArtists.length) {
        selectedList.innerHTML = '';
        return;
    }

    selectedList.innerHTML = onboardingState.selectedArtists.map((artist) => `
        <button class="taste-selected-pill" type="button" data-remove-artist="${createArtistKey(artist)}">
            <span>${truncate(artist.name, 24)}</span>
            <i class="fas fa-times"></i>
        </button>
    `).join('');
}

function renderSearchDropdown() {
    const { searchDropdown } = getElements();
    if (!searchDropdown) return;

    const query = onboardingState.searchQuery.trim();
    const results = onboardingState.searchResults.slice(0, 8);

    if (!query) {
        searchDropdown.classList.add('hidden');
        searchDropdown.innerHTML = '';
        return;
    }

    if (!results.length) {
        searchDropdown.innerHTML = `<div class="taste-search-empty">No artists found for "${query}".</div>`;
        searchDropdown.classList.remove('hidden');
        return;
    }

    searchDropdown.innerHTML = results.map((artist) => `
        <button class="taste-search-result" type="button" data-artist-key="${createArtistKey(artist)}">
            <img src="${artist.picture || getFallbackImage(artist.name, artist.name)}" alt="${artist.name}" loading="lazy">
            <span>
                <span class="taste-search-result-title">${truncate(artist.name, 30)}</span>
                <span class="taste-search-result-meta">Add this artist to your picks</span>
            </span>
        </button>
    `).join('');

    searchDropdown.classList.remove('hidden');
}

function createArtistCardMarkup(artist, eyebrow = '', options = {}) {
    const selected = isArtistSelected(artist) ? 'selected' : '';
    const related = options.related ? 'taste-artist-card-related' : '';
    const genres = (artist.genres || []).slice(0, 2).join(' • ');
    const meta = genres || eyebrow || 'Tap to tune your feed';

    return `
        <button class="taste-artist-card ${selected} ${related}" type="button" data-artist-key="${createArtistKey(artist)}">
            <div class="taste-artist-avatar">
                <img src="${artist.picture || getFallbackImage(artist.name, artist.name)}" alt="${artist.name}" loading="lazy">
                <span class="taste-artist-check"><i class="fas fa-check"></i></span>
            </div>
            <span class="taste-artist-name">${truncate(artist.name, 26)}</span>
            <span class="taste-artist-meta">${truncate(meta, 32)}</span>
        </button>
    `;
}

function getStarterArtistsForDisplay() {
    const filteredArtists = getFilteredStarterArtists();
    const primaryArtists = onboardingState.searchQuery
        ? onboardingState.searchResults
        : filteredArtists;

    const fallbackArtists = uniqueArtists([
        ...filteredArtists,
        ...STARTER_ARTISTS.map(normalizeArtist)
    ]);

    const combinedArtists = uniqueArtists([
        ...primaryArtists,
        ...fallbackArtists
    ]);

    return combinedArtists.slice(0, Math.max(MIN_STARTER_ARTISTS, primaryArtists.length || MIN_STARTER_ARTISTS));
}

function buildVisibleStarterArtists() {
    const baseArtists = getStarterArtistsForDisplay();
    if (!onboardingState.expandedArtistKey || onboardingState.inlineRelatedArtists.length === 0) {
        return baseArtists;
    }

    const anchorIndex = baseArtists.findIndex((artist) => createArtistKey(artist) === onboardingState.expandedArtistKey);
    if (anchorIndex === -1) {
        return baseArtists;
    }

    const baseKeys = new Set(baseArtists.map(createArtistKey));
    const inlineArtists = onboardingState.inlineRelatedArtists
        .filter((artist) => !baseKeys.has(createArtistKey(artist)))
        .slice(0, 5)
        .map((artist) => ({
            ...artist,
            inlineRelated: true
        }));

    if (!inlineArtists.length) return baseArtists;

    return [
        ...baseArtists.slice(0, anchorIndex + 1),
        ...inlineArtists,
        ...baseArtists.slice(anchorIndex + 1)
    ];
}

async function ensureStarterArtistsHydrated() {
    const starterCandidates = uniqueArtists([
        ...getFilteredStarterArtists(),
        ...STARTER_ARTISTS.map(normalizeArtist)
    ]).slice(0, MIN_STARTER_ARTISTS);

    const missingArtists = starterCandidates.filter((artist) => {
        const cachedArtist = artistLookupCache.get(createArtistNameKey(artist.name));
        return !cachedArtist?.deezerId;
    });

    if (!missingArtists.length) return;

    const hydratedArtists = await Promise.all(missingArtists.map((artist) => resolveArtistFromDeezer(artist.name, 5)));
    const hasNewDeezerData = hydratedArtists.some((artist) => artist?.deezerId);
    if (hasNewDeezerData) {
        renderStarterArtists();
    }
}

function renderStarterArtists() {
    const { starterGrid, searchStatus } = getElements();
    if (!starterGrid) return;

    const artists = buildVisibleStarterArtists();

    if (searchStatus) {
        searchStatus.textContent = onboardingState.searchQuery
            ? `Search results are shown below the field. Starter picks stay visible in the grid.`
            : `Starter artists to kick off your recommendations. Showing ${Math.max(artists.length, MIN_STARTER_ARTISTS)} artists.`;
    }

    if (!artists.length) {
        starterGrid.innerHTML = '<div class="taste-grid-placeholder">No artists matched that filter yet.</div>';
        return;
    }

    starterGrid.innerHTML = artists.map((artist) => createArtistCardMarkup(
        artist,
        artist.inlineRelated ? 'Similar to your pick' : '',
        { related: Boolean(artist.inlineRelated) }
    )).join('');

    if (!onboardingState.searchQuery) {
        ensureStarterArtistsHydrated();
    }
}

function renderRelatedArtists() {
    // Similar artists now appear inline inside the main grid.
}

function renderProgress() {
    const { selectedCount, progressLabel, feedback, saveBtn } = getElements();
    const count = onboardingState.selectedArtists.length;
    const remaining = Math.max(MIN_SELECTED_ARTISTS - count, 0);

    if (selectedCount) selectedCount.textContent = String(count);
    if (progressLabel) {
        progressLabel.textContent = remaining > 0
            ? `Pick ${remaining} more artist${remaining === 1 ? '' : 's'} to unlock curation`
            : 'Your discover feed is ready to be personalized';
    }

    if (feedback) {
        feedback.textContent = remaining > 0
            ? `Choose at least ${MIN_SELECTED_ARTISTS} artists. Similar artists will keep adapting as you go.`
            : `Saved picks will be cached locally for now and can be changed any time from Discover.`;
    }

    if (saveBtn) {
        saveBtn.disabled = remaining > 0;
        saveBtn.textContent = remaining > 0
            ? `Choose at least ${MIN_SELECTED_ARTISTS} artists`
            : 'Save my taste profile';
    }
}

function renderOnboardingState() {
    renderGenreChips();
    renderSelectedArtists();
    renderSearchDropdown();
    renderStarterArtists();
    renderRelatedArtists();
    renderProgress();
}

function findArtistFromVisibleCollections(key) {
    const visibleArtists = uniqueArtists([
        ...onboardingState.selectedArtists,
        ...onboardingState.searchResults,
        ...getStarterArtistsForDisplay(),
        ...onboardingState.inlineRelatedArtists,
        ...onboardingState.relatedArtists
    ]);

    return visibleArtists.find((artist) => createArtistKey(artist) === key) || null;
}

function persistTasteProfile() {
    const profile = {
        version: 1,
        completed: true,
        selectedGenres: [...onboardingState.selectedGenres],
        selectedArtists: onboardingState.selectedArtists.map((artist) => normalizeArtist(artist)),
        relatedArtists: onboardingState.relatedArtists.slice(0, 24).map((artist) => normalizeArtist(artist)),
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem(TASTE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    updateOpenButtonLabel();

    document.dispatchEvent(new CustomEvent('genesis:taste-profile-updated', {
        detail: profile
    }));

    if (typeof onboardingCompleteHandler === 'function') {
        onboardingCompleteHandler(profile);
    }
}

function getCurrentVisibleSectionId() {
    return document.querySelector('.main-section:not(.hidden)')?.id || null;
}

function closeOnboarding(options = {}) {
    const targetSectionId = options.returnTo || onboardingState.returnSectionId || 'discover-section';
    switchSection(targetSectionId);
}

export function openOnboarding(options = {}) {
    const { section, searchInput } = getElements();
    if (!section) return;

    const visibleSectionId = getCurrentVisibleSectionId();
    const returnSectionId = options.returnTo
        || (visibleSectionId && visibleSectionId !== 'taste-onboarding-section' ? visibleSectionId : null)
        || onboardingState.returnSectionId
        || 'discover-section';

    onboardingState.returnSectionId = returnSectionId;

    loadStateFromProfile();
    if (searchInput) searchInput.value = '';
    renderOnboardingState();
    switchSection('taste-onboarding-section');

    if (options.forceFocus !== false) {
        setTimeout(() => searchInput?.focus(), 50);
    }
}

function clearOnboardingState() {
    onboardingState.selectedArtists = [];
    onboardingState.selectedGenres = [];
    onboardingState.relatedArtists = [];
    onboardingState.inlineRelatedArtists = [];
    onboardingState.expandedArtistKey = '';
    onboardingState.searchResults = [];
    onboardingState.searchQuery = '';
    localStorage.removeItem(TASTE_PROFILE_STORAGE_KEY);
    loadedRelatedArtistIds.clear();
    updateOpenButtonLabel();
    renderOnboardingState();
}

const runSearch = debounce(async (query) => {
    const { searchStatus, searchDropdown } = getElements();
    const trimmed = query.trim();
    onboardingState.searchQuery = trimmed;

    if (trimmed.length < 2) {
        onboardingState.searchResults = [];
        renderSearchDropdown();
        renderStarterArtists();
        return;
    }

    if (searchStatus) searchStatus.textContent = `Searching for "${trimmed}"...`;
    if (searchDropdown) {
        searchDropdown.innerHTML = '<div class="taste-search-empty">Searching artists...</div>';
        searchDropdown.classList.remove('hidden');
    }

    try {
        onboardingState.searchResults = await fetchArtistSearchResults(trimmed, 20);
    } catch (error) {
        console.error('Artist search failed:', error);
        onboardingState.searchResults = [];
        if (searchStatus) searchStatus.textContent = `We could not search right now. Try another name.`;
    }

    renderSearchDropdown();
    renderStarterArtists();
}, 250);

export function initOnboarding({ onComplete } = {}) {
    if (onboardingState.initialized) {
        onboardingCompleteHandler = onComplete || onboardingCompleteHandler;
        updateOpenButtonLabel();
        return;
    }

    onboardingState.initialized = true;
    onboardingCompleteHandler = onComplete || null;

    const {
        section,
        openBtn,
        closeBtn,
        resetBtn,
        searchInput,
        searchDropdown,
        chips,
        selectedList,
        starterGrid,
        saveBtn
    } = getElements();

    openBtn?.addEventListener('click', () => openOnboarding());
    closeBtn?.addEventListener('click', closeOnboarding);
    resetBtn?.addEventListener('click', clearOnboardingState);

    searchInput?.addEventListener('input', (event) => {
        runSearch(event.target.value);
    });

    chips?.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-genre]');
        if (!chip) return;
        toggleGenre(chip.dataset.genre);
    });

    selectedList?.addEventListener('click', (event) => {
        const pill = event.target.closest('[data-remove-artist]');
        if (!pill) return;

        const artist = findArtistFromVisibleCollections(pill.dataset.removeArtist);
        if (artist) removeArtistSelection(artist);
    });

    const handleArtistCardClick = async (event) => {
        const card = event.target.closest('[data-artist-key]');
        if (!card) return;

        const artist = findArtistFromVisibleCollections(card.dataset.artistKey);
        if (!artist) return;

        await toggleArtistSelection(artist);
    };

    starterGrid?.addEventListener('click', handleArtistCardClick);

    searchDropdown?.addEventListener('click', async (event) => {
        const result = event.target.closest('[data-artist-key]');
        if (!result) return;

        const artist = findArtistFromVisibleCollections(result.dataset.artistKey);
        if (!artist) return;

        await toggleArtistSelection(artist);
        onboardingState.searchQuery = '';
        onboardingState.searchResults = [];
        if (searchInput) searchInput.value = '';
        renderOnboardingState();
    });

    document.addEventListener('click', (event) => {
        const withinSearch = event.target.closest('.taste-search-wrap') || event.target.closest('#taste-search-dropdown');
        if (!withinSearch && searchDropdown) {
            searchDropdown.classList.add('hidden');
        }
    });

    saveBtn?.addEventListener('click', () => {
        if (onboardingState.selectedArtists.length < MIN_SELECTED_ARTISTS) return;
        persistTasteProfile();
        closeOnboarding({ returnTo: 'discover-section' });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && section && !section.classList.contains('hidden')) {
            closeOnboarding();
        }
    });

    window.resetGenesisOnboarding = () => {
        clearOnboardingState();
        openOnboarding({ forceFocus: false });
    };

    updateOpenButtonLabel();
    loadStateFromProfile();
    renderOnboardingState();

    if (!hasTasteProfile()) {
        setTimeout(() => openOnboarding(), 500);
    }
}
