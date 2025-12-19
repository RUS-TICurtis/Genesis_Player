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

        return `
        <div class="track-list-row queue-item ${activeClass}" draggable="true" data-index="${index}">
            <input type="checkbox" class="track-select-checkbox" disabled>
            <button class="control-btn small row-play-btn" title="Play"><i class="fas fa-${isPlaying ? 'pause' : 'play'}"></i></button>
            <span class="track-title" style="${isPlaying ? 'color:var(--primary-color); font-weight:600;' : ''}">${track.title}</span>
            <span class="track-artist">${track.artist || 'Unknown'}</span>
            <span class="track-album">${track.album || 'Unknown album'}</span>
            <span class="track-year">${track.year || ''}</span>
            <span class="track-genre">${track.genre || 'Unknown genre'}</span>
            <span class="track-duration">${duration}</span>
        </div>
        `;
    }).join('');

    // Add Event Listeners
    queueList.querySelectorAll('.queue-item').forEach(item => {
        const index = parseInt(item.dataset.index);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.row-play-btn') || e.target.type === 'checkbox') return;
            if (actions.onPlay) actions.onPlay(index);
        });

        const playBtn = item.querySelector('.row-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (actions.onPlay) actions.onPlay(index);
            });
        }
    });

    const activeItem = queueList.querySelector('.queue-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
