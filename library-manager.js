import { extractMetadata } from './metadata-extractor.js';

const LIBRARY_META_KEY = 'genesis_offline_playlist';

let config = {
    getDB: () => null,
    saveFileToDB: () => Promise.reject(),
    deleteFileFromDB: () => Promise.resolve(),
    showMessage: () => {},
    getLibrary: () => [],
    setLibrary: () => {},
    onLibraryUpdate: () => {}
};

/**
 * Initializes the library manager with necessary dependencies.
 * @param {object} dependencies - The dependencies from the main script.
 */
export function init(dependencies) {
    config = { ...config, ...dependencies };
}

/**
 * Saves the library's metadata to localStorage.
 */
export function saveLibraryMetadata() {
    const library = config.getLibrary();
    const meta = library.map(t => ({
        id: t.id, name: t.name, duration: t.duration, isURL: t.isURL,
        url: t.isURL ? t.objectURL : null,
        artist: t.artist || null, album: t.album || null,
        coverURL: t.coverURL || null, lyrics: t.lyrics || null,
    }));
    localStorage.setItem(LIBRARY_META_KEY, JSON.stringify(meta));
}

/**
 * Processes a list of files, extracts metadata, and adds them to the library.
 * @param {FileList} fileList - The list of files to process.
 */
export async function handleFiles(fileList) {
    if (!fileList.length) return;
    if (!config.getDB()) return;

    config.showMessage(`Processing ${fileList.length} files...`);

    const processingPromises = Array.from(fileList).map(async (file) => {
        const trackData = await extractMetadata(file);
        if (trackData) {
            await config.saveFileToDB(trackData.id, file);
        }
        return trackData;
    });

    const newTracks = (await Promise.all(processingPromises)).filter(Boolean);

    if (newTracks.length > 0) {
        const currentLibrary = config.getLibrary();
        config.setLibrary([...currentLibrary, ...newTracks]);
        saveLibraryMetadata();
        config.showMessage(`Added ${newTracks.length} track(s).`);
        config.onLibraryUpdate();
    } else {
        config.showMessage("No valid audio files found.");
    }
}

/**
 * Removes a track from the library and its associated data.
 * @param {string} trackId - The ID of the track to remove.
 * @returns {object|null} The track that was removed, or null.
 */
export async function removeTrack(trackId) {
    const library = config.getLibrary();
    const index = library.findIndex(t => t.id === trackId);
    if (index === -1) return null;

    const [removedTrack] = library.splice(index, 1);
    config.setLibrary(library);

    // DB & URL Cleanup
    if (!removedTrack.isURL) await config.deleteFileFromDB(removedTrack.id);
    if (removedTrack.objectURL && !removedTrack.isURL) URL.revokeObjectURL(removedTrack.objectURL);
    if (removedTrack.coverURL) URL.revokeObjectURL(removedTrack.coverURL);

    saveLibraryMetadata();
    config.onLibraryUpdate();

    return removedTrack;
}

/**
 * Retrieves the full track object from the library by its ID.
 * @param {string} trackId The ID of the track to find.
 * @returns {object|null} The track data or null if not found.
 */
export function getTrackDetailsFromId(trackId) {
    const library = config.getLibrary();
    return library.find(t => t.id === trackId) || null;
}