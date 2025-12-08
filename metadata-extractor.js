/**
 * Extracts metadata (title, artist, album, art) from an audio file.
 * Uses the 'music-metadata-browser' library included in your HTML.
 */
export async function extractMetadata(file) {
    let metadata = {
        id: file.name + '-' + file.lastModified, // Create a more stable but non-guaranteed ID
        title: file.name.replace(/\.[^/.]+$/, ""), // Default to filename without extension
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        lyrics: null,
        duration: 0,
        coverBlob: null
    };

    try {
        // Strategy A: music-metadata-browser
        if (window.musicMetadata) {
            const result = await window.musicMetadata.parseBlob(file, { duration: true, skipCovers: false });
            const { common, format } = result;

            if (common.title && common.title.trim()) metadata.title = common.title.trim();
            if (common.artist && common.artist.trim()) metadata.artist = common.artist.trim();
            if (common.album && common.album.trim()) metadata.album = common.album.trim();
            if (format.duration) metadata.duration = format.duration;

            if (common.lyrics && common.lyrics.length > 0) {
                metadata.lyrics = common.lyrics[0].toString();
            }

            if (common.picture && common.picture.length > 0) {
                const picture = common.picture[0];
                metadata.coverBlob = new Blob([picture.data], { type: picture.format });
            }
            return metadata;
        }
    } catch (error) {
        console.warn(`music-metadata-browser failed for ${file.name}, trying fallback...`, error);
    }

    // Strategy B: jsmediatags (Fallback)
    if (window.jsmediatags) {
        try {
            const tags = await new Promise((resolve, reject) => {
                window.jsmediatags.read(file, {
                    onSuccess: (tag) => resolve(tag),
                    onError: (error) => reject(error)
                });
            });

            if (tags && tags.tags) {
                const t = tags.tags;
                if (t.title) metadata.title = t.title;
                if (t.artist) metadata.artist = t.artist;
                if (t.album) metadata.album = t.album;
                if (t.lyrics) metadata.lyrics = t.lyrics.lyrics || t.lyrics; // jsmediatags lyrics structure varies

                // Duration is not typically provided by jsmediatags directly from tags, 
                // we might need to get it from an audio element if not already present.
                // But for now, we leave it as 0 if not found, usually the player updates it on load.

                if (t.picture) {
                    const { data, format } = t.picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    // This is a bit manual for binary to blob, but jsmediatags returns array
                    const byteArray = new Uint8Array(data);
                    metadata.coverBlob = new Blob([byteArray], { type: format });
                }
            }
        } catch (err) {
            console.warn(`jsmediatags also failed/not found for ${file.name}.`, err);
        }
    } else {
        console.warn("No metadata libraries found (musicMetadata or jsmediatags).");
    }

    return metadata;
}
