import { playerContext } from './state.js';
import { formatTime } from './utils.js';

let actions = {
    onPlay: null,
    onRemove: null
};

export function setQueueActions(onPlay, onRemove) {
    actions.onPlay = onPlay;
    actions.onRemove = onRemove;
}

export function renderQueueTable() {
    const queueList = document.getElementById('queue-list');
    if (!queueList) return;

    // Update the header count
    const headerTitle = document.getElementById('queue-header-title');
    if (headerTitle) headerTitle.textContent = `Play Queue (${playerContext.trackQueue.length})`;

    if (playerContext.trackQueue.length === 0) {
        queueList.innerHTML = '<div class="empty-state">Queue is empty</div>';
        return;
    }

    queueList.innerHTML = playerContext.trackQueue.map((track, index) => {
        const isPlaying = index === playerContext.currentTrackIndex;
        const duration = formatTime(track.duration);
        const activeClass = isPlaying ? 'active' : '';

        let imgTag = `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
        if (track.coverURL) {
            imgTag = `<img src="${track.coverURL}" alt="Art">`;
        }

        return `
        <div class="queue-item ${activeClass}" draggable="true" data-index="${index}">
            <div class="queue-item-art">${imgTag}</div>
            <div class="queue-item-details">
                <span class="col-title" style="font-weight:600; ${isPlaying ? 'color:var(--primary-color);' : ''}">${track.title}</span>
                <span class="col-artist" style="font-size:12px; color:var(--text-color);">${track.artist || 'Unknown'}</span>
            </div>
            <div class="col-duration">${duration}</div>
            <div class="col-actions">
                <button class="control-btn small remove-queue-btn" title="Remove from Queue"><i class="fas fa-times"></i></button>
            </div>
        </div>
        `;
    }).join('');

    // Add Event Listeners
    queueList.querySelectorAll('.queue-item').forEach(item => {
        const index = parseInt(item.dataset.index);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.remove-queue-btn')) return;
            if (actions.onPlay) actions.onPlay(index);
        });

        item.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (actions.onRemove) actions.onRemove(index);
        });
    });

    const activeItem = queueList.querySelector('.queue-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
