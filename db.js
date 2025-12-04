/**
 * db.js
 * Defines the IndexedDB schema using Dexie.js.
 * This provides a structured, modern way to interact with the browser's local database.
 */

export const db = new Dexie('genesisDB');

db.version(5).stores({
  tracks: `
    &id,
    title,
    artist,
    album,
    audioUrl,
    albumArtUrl,
    bio,
    *tags,
    lyricsUrl,
    mbid,
    downloaded,
    audioBlob,
    coverBlob
  `,
  artists: `
    &name,
    genre,
    bio,
    imageUrl,
    *similarArtists
  `
}).upgrade(tx => {
  // Migration logic for future versions can go here.
  // Dexie automatically handles adding new properties to existing objects.
});