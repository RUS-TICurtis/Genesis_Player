
// Dexie is loaded globally in index.html
const db = new Dexie('genesisDB');
db.version(6).stores({
  tracks: `
    id,
    &[artist+album+title],
    title,
    artist,
    album,
    lyrics,
    audioBlob,
    coverBlob
  `
});

export default db;
