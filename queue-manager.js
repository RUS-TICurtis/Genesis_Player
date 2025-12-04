let config = {
    playerContext: null,
    queueList: null,
    queueHeaderTitle: null,
    queueClearBtn: null,
    queueSavePlaylistBtn: null,
    showMessage: () => {},
    showConfirmation: () => Promise.resolve(false),
    formatTime: () => "0:00",
    loadTrack: () => {},
    renderTrackContextMenu: () => {},
    PlaylistManager: null,
};

let draggedIndex = null;

export function init(dependencies) {
    config = { ...config, ...dependencies };

    if (config.queueClearBtn) {
        config.queueClearBtn.addEventListener('click', async () => {
            const confirmed = await config.showConfirmation('Clear Queue', 'Are you sure you want to clear the entire play queue?');
            if (confirmed) {
                config.playerContext.trackQueue = [];
                renderQueueTable();
            }
        });
    }

    if (config.queueSavePlaylistBtn) {
        config.queueSavePlaylistBtn.addEventListener('click', saveQueueAsPlaylist);
    }
}

export function renderQueueTable() {
    config.queueList.innerHTML = '';
    config.queueHeaderTitle.textContent = `Play Queue (${config.playerContext.trackQueue.length})`;
    const headerHTML = `
        <div class="track-list-header queue-header">
            <span></span> <!-- Art -->
            <span>Title</span>
            <span>Artist</span>
            <span>Album</span>
            <span><i class="fas fa-clock"></i></span> <!-- Duration -->
            <span></span> <!-- Actions -->
        </div>`;
    config.queueList.insertAdjacentHTML('beforeend', headerHTML);
    if (config.playerContext.trackQueue.length === 0) {
        config.queueList.innerHTML += `<div class="empty-state" style="color: var(--text-light); padding: 20px; text-align: center;">Queue is empty.</div>`;
        return;
    }

    config.playerContext.trackQueue.forEach((track, index) => {
        const isActive = index === config.playerContext.currentTrackIndex;
        const div = document.createElement('div');
        div.className = `queue-item ${isActive ? 'active' : ''}`;
        div.draggable = true;
        div.dataset.index = index;

        div.innerHTML = ` 
            <div class="queue-item-art">
                ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.name}" draggable="false">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
            </div>
            <span class="track-title" style="color: ${isActive ? 'var(--primary-color)' : 'var(--dark-color)'};">${track.name}</span>
            <span class="track-artist">${track.artist || 'Unknown Artist'}</span>
            <span class="track-album">${track.album || 'N/A'}</span>
            <span class="track-duration">${config.formatTime(track.duration)}</span>
            <span class="track-actions"><button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button></span>
        `;

        div.addEventListener('dragstart', (e) => {
            draggedIndex = parseInt(e.currentTarget.dataset.index, 10);
            e.currentTarget.classList.add('dragging');
        });

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            const rect = target.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            target.classList.remove('drop-target-top', 'drop-target-bottom');
            if (e.clientY < midpoint) {
                target.classList.add('drop-target-top');
            } else {
                target.classList.add('drop-target-bottom');
            }
        });

        div.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drop-target-top', 'drop-target-bottom');
        });

        div.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            const droppedOnIndex = parseInt(target.dataset.index, 10);
            const dropAbove = target.classList.contains('drop-target-top');
            target.classList.remove('drop-target-top', 'drop-target-bottom');

            let newIndex = droppedOnIndex;
            if (draggedIndex < droppedOnIndex && dropAbove) newIndex--;
            else if (draggedIndex > droppedOnIndex && !dropAbove) newIndex++;

            const currentlyPlayingId = config.playerContext.trackQueue[config.playerContext.currentTrackIndex]?.id;
            const draggedItem = config.playerContext.trackQueue.splice(draggedIndex, 1)[0];
            config.playerContext.trackQueue.splice(newIndex, 0, draggedItem);

            config.playerContext.currentTrackIndex = config.playerContext.trackQueue.findIndex(track => track.id === currentlyPlayingId);
            renderQueueTable();
        });

        div.addEventListener('dragend', (e) => {
            e.currentTarget.classList.remove('dragging');
            document.querySelectorAll('.queue-item').forEach(item => item.classList.remove('drop-target-top', 'drop-target-bottom'));
        });

        div.addEventListener('click', (e) => {
            if (e.target.closest('.track-action-btn')) return;
            if (track.objectURL) config.loadTrack(index);
            else config.showMessage(`File for "${track.name}" is missing.`);
        });

        div.querySelector('.track-action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            config.renderTrackContextMenu(track.id, e.currentTarget, { isFromQueue: true });
        });

        config.queueList.appendChild(div);
    });
}

function saveQueueAsPlaylist() {
    if (config.playerContext.trackQueue.length === 0) {
        config.showMessage("The queue is empty. Add some tracks first!");
        return;
    }

    const playlistName = prompt("Enter a name for the new playlist:");
    if (!playlistName || playlistName.trim() === "") return;

    const newPlaylistId = config.PlaylistManager.createPlaylist(playlistName, false);
    if (newPlaylistId) {
        config.playerContext.trackQueue.forEach(track => {
            config.PlaylistManager.addTrackToPlaylist(newPlaylistId, track.id);
        });
        config.showMessage(`Playlist "${playlistName}" created with ${config.playerContext.trackQueue.length} tracks.`);
        config.PlaylistManager.refresh();
    }
}