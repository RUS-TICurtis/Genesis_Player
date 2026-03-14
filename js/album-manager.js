import { playerContext } from './state.js';
import { renderDetailTrackList } from './library-manager.js';
import { showMessage, switchSection } from './ui-manager.js';

let startPlaybackFn = null;

export function setAlbumDependencies(startPlayback) {
    startPlaybackFn = startPlayback;
}

export function renderAlbumsGrid() {
    const albumsContent = document.querySelector('#albums-section .albums-content');
    if (!albumsContent) return;

    const albumList = playerContext.cachedAlbums;

    if (albumList.length === 0) {
        albumsContent.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No albums found in your library.</p></div>`;
        return;
    }

    albumsContent.innerHTML = albumList.map((album, index) => `
    <div class="album-card" data-index="${index}">
        <div class="album-art-circular">
            ${album.coverURL ? `<img src="${album.coverURL}" alt="${album.name}">` : `<div class="placeholder-icon"><i class="fas fa-compact-disc"></i></div>`}
        </div>
        <div class="album-name">${album.name}</div>
        <div class="album-artist">${album.artist}</div>
    </div>
`).join('');

    albumsContent.querySelectorAll('.album-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = card.dataset.index;
            const album = albumList[index];
            openAlbumView(album);
        });
    });
}

export function openAlbumView(album) {
    const albumDetailView = document.getElementById('album-detail-view');
    albumDetailView.innerHTML = `
    <div class="playlist-detail-header">
        <button id="album-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button>
        <div class="detail-view-art">
             ${album.coverURL ? `<img src="${album.coverURL}" alt="${album.name}">` : `<div class="placeholder-icon"><i class="fas fa-compact-disc"></i></div>`}
        </div>
        <div class="playlist-info">
            <h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${album.name}</h2>
            <p style="color: var(--text-color); margin: 0;">${album.artist}</p>
            <p style="color: var(--text-color); margin: 0; font-size: 14px;">${album.trackIds.length} track${album.trackIds.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="playlist-actions" style="margin-left: auto; display: flex; gap: 10px;">
            <button id="album-shuffle-btn" class="btn-secondary"><i class="fas fa-random"></i> Shuffle</button>
            <button id="album-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button>
        </div>
    </div>
    <div class="track-list-header">
        <input type="checkbox" class="select-all-checkbox" title="Select all tracks">
        <span style="grid-column: 2;">#</span><span>Title</span><span>Album</span><span>Duration</span><span></span>
    </div>
    <div id="album-track-list"></div>
`;

    document.getElementById('album-detail-back-btn').addEventListener('click', () => {
        albumDetailView.classList.add('hidden');
        albumsSection.classList.remove('hidden');
    });

    document.getElementById('album-play-all-btn').addEventListener('click', () => {
        if (startPlaybackFn) startPlaybackFn(album.trackIds, 0, false);
        // showMessage(`Playing album: ${album.name}`);
    });

    document.getElementById('album-shuffle-btn').addEventListener('click', () => {
        if (startPlaybackFn) startPlaybackFn(album.trackIds, 0, true);
        // showMessage(`Shuffling album: ${album.name}`);
    });

    renderDetailTrackList(album.trackIds, document.getElementById('album-track-list'), { showAlbum: false });

    switchSection('album-detail-view', album.name);
}

export function openAlbumByName(albumName) {
    if (!albumName) return;
    // Note: Multiple artists might have albums with same name,
    // but without more info we take the first match or update this to accept artist too.
    const album = playerContext.cachedAlbums.find(a => a.name === albumName);
    if (!album) return;

    openAlbumView(album);
}

export function openAlbum(albumName, artistName) {
    if (!albumName) return;
    const album = playerContext.cachedAlbums.find(a => a.name === albumName && a.artist === (artistName || 'Unknown Artist'));
    if (!album) return;

    openAlbumView(album);
}
