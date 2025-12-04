/**
 * Manually searches for an embedded JPEG/PNG image in an ArrayBuffer.
 * @param {ArrayBuffer} arrayBuffer The audio file's data.
 * @returns {Blob|null} A Blob of the image if found, otherwise null.
 */
function extractCoverFromArrayBuffer(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const markers = [
        { signature: [0xFF, 0xD8, 0xFF, 0xE0], type: 'image/jpeg' }, // JPEG
        { signature: [0x89, 0x50, 0x4E, 0x47], type: 'image/png' }   // PNG
    ];
    for (let i = 0; i < view.byteLength - 4; i++) {
        for (const marker of markers) {
            if (marker.signature.every((byte, index) => view.getUint8(i + index) === byte)) {
                const potentialEnd = Math.min(i + 500000, view.byteLength);
                const imageSlice = arrayBuffer.slice(i, potentialEnd);
                return new Blob([imageSlice], { type: marker.type });
            }
        }
    }
    return null;
}

/**
 * Extracts metadata from an audio file.
 * @param {File} file The audio file object.
 * @returns {Promise<object|null>} A promise that resolves with the track metadata object, or null if invalid.
 */
export function extractMetadata(file) {
    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma', '.alac', '.ape', '.dsf', '.dsd', '.mpc', '.wv', '.tta', '.dff', '.aiff', '.aif', '.ac3', '.eac3', '.dts'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!file.type.startsWith('audio/') && !audioExtensions.includes(ext)) {
        return Promise.resolve(null);
    }

    const url = URL.createObjectURL(file);
    const id = Date.now() + Math.random().toString();

    return new Promise((resolve) => {
        jsmediatags.read(file, {
            onSuccess: async (tag) => {
                const { tags } = tag;
                let coverBlob = null;
                let coverURL = null;
                try {
                    if (tags.picture) {
                        const { data, format } = tags.picture;
                        coverBlob = new Blob([new Uint8Array(data)], { type: format });
                    } else {
                        // Fallback to manual search if jsmediatags fails
                        const arrayBuffer = await file.arrayBuffer();
                        coverBlob = extractCoverFromArrayBuffer(arrayBuffer);
                    }
                    if (coverBlob) coverURL = URL.createObjectURL(coverBlob);
                } catch (e) {
                    console.warn(`Cover extraction failed for ${file.name}:`, e);
                }

                resolve({
                    id,
                    coverBlob, // Return the blob itself
                    title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                    duration: 0, isURL: false, artist: tags.artist || null, album: tags.album || null,
                    objectURL: url, coverURL: coverURL,
                    lyrics: tags.lyrics || (tags.comment && tags.comment.text) || null
                });
            },
            onError: (error) => {
                console.warn(`jsmediatags error for ${file.name}:`, error.message);
                resolve({ id, title: file.name.replace(/\.[^/.]+$/, ""), duration: 0, isURL: false, objectURL: url });
            }
        });
    });
}