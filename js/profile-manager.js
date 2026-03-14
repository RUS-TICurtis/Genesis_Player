import { playerContext } from './state.js';
import { switchSection } from './ui-manager.js';
import { truncate, getFallbackImage } from './utils.js';

export function initProfileListeners() {
    const profilePic = document.getElementById('profile-pic');
    const closeBtn = document.getElementById('profile-close-btn');

    if (profilePic) {
        profilePic.addEventListener('click', (e) => {
            e.preventDefault();
            renderProfile();
            switchSection('profile-modal');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const last = localStorage.getItem('genesis_active_section');
            if (last && last !== 'profile-modal') {
                switchSection(last);
            } else {
                switchSection('home-section');
            }
        });
    }

    // Profile Edit Modal Trigger
    const headerTrigger = document.getElementById('profile-header-trigger');
    const editModal = document.getElementById('profile-edit-modal');
    const closeEditBtn = document.getElementById('close-profile-edit-btn');
    const saveEditBtn = document.getElementById('save-profile-details-btn');
    const editNameInput = document.getElementById('edit-profile-name-input');
    const editPicTrigger = document.getElementById('edit-profile-pic-trigger');
    const editPicInput = document.getElementById('edit-profile-pic-input');
    const editPicPreview = document.getElementById('edit-profile-pic-preview');

    if (headerTrigger && editModal) {
        headerTrigger.addEventListener('click', () => {
            editNameInput.value = localStorage.getItem('genesis_user_name') || 'Genesis';
            editPicPreview.src = localStorage.getItem('genesis_profile_pic') || 'assets/profile-default.jpg';
            editModal.classList.remove('hidden');
        });
    }

    if (closeEditBtn) {
        closeEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));
    }

    if (editPicTrigger && editPicInput) {
        editPicTrigger.addEventListener('click', () => editPicInput.click());
        editPicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (eResult) => {
                    editPicPreview.src = eResult.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', () => {
            const newName = editNameInput.value.trim();
            if (newName) {
                localStorage.setItem('genesis_user_name', newName);
                localStorage.setItem('genesis_profile_pic', editPicPreview.src);
                renderProfile();
                editModal.classList.add('hidden');
            }
        });
    }

    // Close modal on outside click
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) editModal.classList.add('hidden');
        });
    }
}

export function renderProfile() {
    const savedName = localStorage.getItem('genesis_user_name') || 'Genesis';
    const savedPic = localStorage.getItem('genesis_profile_pic') || 'assets/profile-default.jpg';

    // Update Header
    document.querySelectorAll('.profile-name, .welcome-name').forEach(el => el.textContent = savedName);
    document.querySelectorAll('#profile-pic, .profile-user-img, .welcome-profile-pic').forEach(img => img.src = savedPic);

    // Render Top Artists
    renderTopArtists();
}

function renderTopArtists() {
    const grid = document.getElementById('profile-top-artists-grid');
    if (!grid) return;

    // Use cached artists, sorted by track count for "Top"
    const topArtists = [...playerContext.cachedArtists]
        .sort((a, b) => b.trackIds.length - a.trackIds.length)
        .slice(0, 6);

    if (topArtists.length === 0) {
        grid.innerHTML = '<div class="empty-state">No artists in your library yet.</div>';
        return;
    }

    grid.innerHTML = topArtists.map(artist => {
        const imgUrl = artist.coverURL || getFallbackImage(artist.name);
        return `
            <div class="profile-artist-card" data-artist="${artist.name}">
                <div class="profile-artist-art">
                    <img src="${imgUrl}" alt="${artist.name}">
                </div>
                <div class="profile-artist-name">${truncate(artist.name, 20)}</div>
                <div class="profile-artist-label">Artist</div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.profile-artist-card').forEach(card => {
        card.addEventListener('click', () => {
            const artist = card.dataset.artist;
            import('./artist-manager.js').then(m => m.openArtistByName(artist));
        });
    });
}
