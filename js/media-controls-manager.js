// Media Controls & Session Management for Genesis Player
// This file demonstrates how to use the installed plugins for media controls

import { CapacitorMusicControls } from 'capacitor-music-controls-plugin';
import { Media } from '@capacitor-community/media';

// Media Session & Notification Controls
export class MediaControlsManager {
    constructor() {
        this.isPlaying = false;
        this.currentTrack = null;
        this.initializeMediaControls();
        this.setupAudioFocusHandling();
    }

    // Initialize media controls for background playback
    async initializeMediaControls() {
        try {
            // Create media controls notification
            await CapacitorMusicControls.create({
                track: 'Genesis Player',
                artist: 'Music Player',
                album: 'Library',
                cover: 'assets/logo-00.png',
                isPlaying: false,
                dismissable: false,
                hasPrev: true,
                hasNext: true,
                hasClose: false,
                // iOS options
                playIcon: 'media_play',
                pauseIcon: 'media_pause',
                prevIcon: 'media_prev',
                nextIcon: 'media_next',
                closeIcon: 'media_close',
                notificationIcon: 'notification'
            });

            // Listen for media control events
            CapacitorMusicControls.addListener('controlsNotification', (info) => {
                console.log('Media control action:', info);

                switch (info) {
                    case 'media_play':
                    case 'media_play_pause':
                        this.handlePlayPause();
                        break;
                    case 'media_pause':
                        this.handlePlayPause();
                        break;
                    case 'media_next':
                        this.handleNext();
                        break;
                    case 'media_prev':
                        this.handlePrevious();
                        break;
                    case 'media_close':
                        this.handleStop();
                        break;
                }
            });

        } catch (error) {
            console.error('Failed to initialize media controls:', error);
        }
    }

    // Update media controls with current track info
    async updateMediaControls(track) {
        this.currentTrack = track;

        try {
            await CapacitorMusicControls.updateIsPlaying({
                isPlaying: this.isPlaying,
                track: track.title || 'Unknown Track',
                artist: track.artist || 'Unknown Artist',
                album: track.album || 'Unknown Album',
                cover: track.cover || 'assets/logo-00.png'
            });
        } catch (error) {
            console.error('Failed to update media controls:', error);
        }
    }

    // Handle play/pause from notification
    handlePlayPause() {
        if (this.isPlaying) {
            // Pause the audio
            this.pause();
        } else {
            // Play the audio
            this.play();
        }
    }

    // Handle next track
    handleNext() {
        // Implement next track logic
        console.log('Next track requested');
        // Call your playback manager's next() method
    }

    // Handle previous track
    handlePrevious() {
        // Implement previous track logic
        console.log('Previous track requested');
        // Call your playback manager's previous() method
    }

    // Handle stop
    handleStop() {
        this.pause();
        // Optionally destroy media controls
        CapacitorMusicControls.destroy();
    }

    // Audio Focus Handling
    setupAudioFocusHandling() {
        // The capacitor-music-controls plugin should handle audio focus automatically
        // But you can add additional logic here if needed

        CapacitorMusicControls.addListener('audioFocusLost', () => {
            console.log('Audio focus lost - pausing playback');
            this.pause();
        });

        CapacitorMusicControls.addListener('audioFocusGained', () => {
            console.log('Audio focus gained - resuming playback');
            // Optionally resume playback
        });
    }

    // Playback control methods (connect to your existing playback manager)
    play() {
        this.isPlaying = true;
        this.updateMediaControls(this.currentTrack);
    }

    pause() {
        this.isPlaying = false;
        this.updateMediaControls(this.currentTrack);
    }
}

// Media Store Access for Auto Library Population
export class MediaLibraryManager {
    constructor() {
        this.audioFiles = [];
    }

    // Request permissions and scan media library
    async scanMediaLibrary() {
        try {
            // Request permissions
            const permissions = await Media.requestPermissions();
            console.log('Media permissions:', permissions);

            if (permissions.granted) {
                // Get all audio files from device
                const result = await Media.getAudioFiles();
                this.audioFiles = result.audioFiles || [];

                console.log(`Found ${this.audioFiles.length} audio files`);

                // Process and add to your library
                return this.processAudioFiles(this.audioFiles);
            } else {
                console.warn('Media permissions not granted');
                return [];
            }
        } catch (error) {
            console.error('Failed to scan media library:', error);
            return [];
        }
    }

    // Process raw audio files into track objects
    processAudioFiles(audioFiles) {
        return audioFiles.map(file => ({
            id: file.uri || file.path,
            title: file.title || this.extractTitleFromPath(file.path),
            artist: file.artist || 'Unknown Artist',
            album: file.album || 'Unknown Album',
            duration: file.duration || 0,
            path: file.path,
            uri: file.uri,
            cover: null // You can extract album art separately
        }));
    }

    // Extract title from file path if metadata is missing
    extractTitleFromPath(path) {
        if (!path) return 'Unknown Track';
        const fileName = path.split('/').pop().split('\\').pop();
        return fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    }

    // Get audio files by album/artist/etc.
    getTracksByArtist(artist) {
        return this.audioFiles.filter(file =>
            file.artist && file.artist.toLowerCase().includes(artist.toLowerCase())
        );
    }

    getTracksByAlbum(album) {
        return this.audioFiles.filter(file =>
            file.album && file.album.toLowerCase().includes(album.toLowerCase())
        );
    }
}

// Usage example:
/*
// Initialize media controls
const mediaControls = new MediaControlsManager();

// Initialize media library scanner
const mediaLibrary = new MediaLibraryManager();

// Scan library on app start
document.addEventListener('DOMContentLoaded', async () => {
    const tracks = await mediaLibrary.scanMediaLibrary();
    console.log('Library tracks:', tracks);

    // Update your UI with the tracks
    // updateLibraryUI(tracks);
});

// When playing a track, update media controls
function playTrack(track) {
    mediaControls.updateMediaControls(track);
    mediaControls.play();

    // Your existing playback logic here
}
*/