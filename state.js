import db from './db.js';

export const playerContext = {
    libraryTracks: [],
    discoverTracks: [], // For tracks from APIs like Jamendo
    trackQueue: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffled: false,
    selectedTrackIds: new Set(),
    repeatState: 0, // 0: no-repeat, 1: repeat-all, 2: repeat-one
    dbInstance: db, // Use the Dexie instance
};
