import { playerContext } from './state.js';
import { formatTime } from './utils.js';

// DOM Elements Helpers
export const elements = {
    msgText: () => document.getElementById('modal-text'),
    msgModal: () => document.getElementById('message-modal'),
    confirmModal: () => document.getElementById('confirm-modal'),
    confirmModalTitle: () => document.getElementById('confirm-modal-title'),
    confirmModalText: () => document.getElementById('confirm-modal-text'),
    confirmOkBtn: () => document.getElementById('confirm-ok-btn'),
    confirmCancelBtn: () => document.getElementById('confirm-cancel-btn'),
    mainSections: () => document.querySelectorAll('.main-section'),
    albumDetailView: () => document.getElementById('album-detail-view'),
    artistDetailView: () => document.getElementById('artist-detail-view'),
    menuItems: () => document.querySelectorAll('.menu-item'),
    bottomNavItems: () => document.querySelectorAll('.bottom-nav .nav-item'),
    selectionCount: () => document.getElementById('selection-count'),
    selectionBar: () => document.getElementById('selection-action-bar'),
    themeToggle: () => document.getElementById('theme-toggle-checkbox'),
    libraryGrid: () => document.getElementById('library-grid'),
    libraryGridViewBtn: () => document.getElementById('library-grid-view-btn'),
    libraryListViewBtn: () => document.getElementById('library-list-view-btn'),
    extendedInfoPanel: () => document.getElementById('extended-info-panel'),
    mainContent: () => document.querySelector('.main-content'),
    searchDropdown: () => document.getElementById('search-dropdown'),
    searchInput: () => document.getElementById('search-input'),
};

export function showMessage(msg) {
    elements.msgText().innerHTML = msg;
    elements.msgModal().classList.remove('hidden');
}

export function showConfirmation(title, text) {
    return new Promise(resolve => {
        elements.confirmModalTitle().textContent = title;
        elements.confirmModalText().innerHTML = text;
        const modal = elements.confirmModal();
        const okBtn = elements.confirmOkBtn();
        const cancelBtn = elements.confirmCancelBtn();

        modal.classList.remove('hidden');

        okBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

export function switchSection(targetId) {
    elements.mainSections().forEach(section => section.classList.add('hidden'));
    elements.albumDetailView()?.classList.add('hidden');
    elements.artistDetailView()?.classList.add('hidden');

    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');

    const items = [...elements.menuItems(), ...elements.bottomNavItems()];
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.target === targetId);
    });
}

export function applyTheme(theme) {
    const themeToggle = elements.themeToggle();
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        if (themeToggle) themeToggle.checked = false;
    }
}

export function updateSelectionBar() {
    const count = playerContext.selectedTrackIds.size;
    const bar = elements.selectionBar();
    const countEl = elements.selectionCount();
    if (count > 0 && bar && countEl) {
        countEl.textContent = count;
        bar.classList.remove('hidden');
    } else if (bar) {
        bar.classList.add('hidden');
    }
}

export function switchLibraryView(view) {
    const grid = elements.libraryGrid();
    const gridBtn = elements.libraryGridViewBtn();
    const listBtn = elements.libraryListViewBtn();

    if (view === 'grid') {
        grid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        grid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    }
    localStorage.setItem('genesis_library_view', view);
}

// Search Dropdown Logic
export function renderSearchDropdown(highlightedSearchIndex = -1) {
    const searchDropdown = elements.searchDropdown();
    const searchInput = elements.searchInput();
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        searchDropdown.classList.add('hidden');
        searchDropdown.innerHTML = '';
        return;
    }

    const results = playerContext.libraryTracks
        .filter(track =>
            (track.title && track.title.toLowerCase().includes(query)) ||
            (track.artist && track.artist.toLowerCase().includes(query)))
        .slice(0, 10);

    if (results.length === 0) {
        searchDropdown.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
        searchDropdown.classList.remove('hidden');
        return;
    }

    searchDropdown.innerHTML = results.map(track => {
        const duration = track.duration ? formatTime(track.duration) : '';
        const icon = track.isURL ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-music"></i>';
        return `
            <div class="result-item" data-track-id="${track.id}" role="option">
                ${icon}
                <div class="label">${track.title} <span class="search-artist-label">- ${track.artist || 'Unknown'}</span></div>
                <div class="meta">${duration}</div>
            </div>
        `;
    }).join('');

    searchDropdown.classList.remove('hidden');
}

export function updateSearchHighlight(items, highlightedSearchIndex) {
    items.forEach((item, index) => {
        if (index === highlightedSearchIndex) {
            item.classList.add('highlighted');
            item.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        } else {
            item.classList.remove('highlighted');
        }
    });
}
