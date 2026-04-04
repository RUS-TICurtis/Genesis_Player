// index.js
import './config.js';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { fetchJamendoTracks } from './jamendo.js';
import { fetchTopTracks, fetchTrackInfo } from './lastfm.js';
import { fetchHearThisTracks, searchHearThis } from './hearthis.js';
import { fetchTrending as fetchAudioDBTrending } from './theaudiodb.js';
import { fetchMusicBrainzTrending } from './musicbrainz.js';
import { fetchGeniusLyrics } from './genius.js';
import { fetchSpotifyTrending, searchSpotify, fetchSpotifyGenre, checkSpotifyIntegration } from './spotify.js';
import { fetchDeezerTrending, searchDeezer, fetchDeezerGenre, checkDeezerIntegration } from './deezer.js';
import { fetchJamendoTracks as searchJamendoForResolve } from './jamendo.js';


const app = express();
const PORT = process.env.PORT || 1552;

// Use CORS middleware to allow requests from your front-end
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));
// Serve 'js' directory
app.use('/js', express.static(path.join(__dirname, '../js')));
// Serve 'node_modules' (if needed by frontend)
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

// New Endpoint: Genre
app.get('/api/genre', async (req, res) => {
  try {
    const { title, artist } = req.query;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    const info = await fetchTrackInfo(artist, title);
    let genre = 'Unknown Genre';

    if (info && info.toptags && info.toptags.tag && info.toptags.tag.length > 0) {
      genre = info.toptags.tag[0].name;
    }

    res.json({ genre });
  } catch (error) {
    console.error('Genre endpoint error:', error);
    res.json({ genre: 'Unknown Genre' });
  }
});

// API endpoint to proxy Jamendo requests
app.get('/api/discover', async (req, res) => {
  try {
    const { search, order } = req.query;
    const data = await fetchJamendoTracks(search, order || 'popularity_week');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data from Jamendo' });
  }
});

// New Endpoint: LastFM Top Tracks
app.get('/api/discover/lastfm', async (req, res) => {
  try {
    const tracks = await fetchTopTracks();
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LastFM data' });
  }
});

// New Endpoint: TheAudioDB Trending
app.get('/api/discover/theaudiodb', async (req, res) => {
  try {
    const trending = await fetchAudioDBTrending();
    res.json(trending || []);
  } catch (error) {
    console.error('AudioDB Route Error:', error.message);
    res.json([]); // Return empty array instead of 500
  }
});

// New Endpoint: HearThis.at Popular Feed
app.get('/api/discover/hearthis', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const count = req.query.count || 20;
    const tracks = await fetchHearThisTracks(page, count);
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch HearThis.at data' });
  }
});

// New Endpoint: MusicBrainz Trending (Releases)
app.get('/api/discover/musicbrainz', async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    // fetchMusicBrainzTrending is imported at top
    const tracks = await fetchMusicBrainzTrending(limit);
    res.json(tracks || []);
  } catch (error) {
    console.error("MusicBrainz Content Error:", error.message);
    res.json([]);
  }
});

// New Endpoint: Lyrics
app.get('/api/lyrics', async (req, res) => {
  try {
    const { title, artist, album, year, lang, skipIds } = req.query;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    // Convert skipIds to array if it's a string
    const skipIdsArray = skipIds ? (Array.isArray(skipIds) ? skipIds : [skipIds]) : [];

    // fetchGeniusLyrics imported at top
    const result = await fetchGeniusLyrics(title, artist, album, year, lang || 'en', skipIdsArray);
    res.json(result || { lyrics: null, id: null });
  } catch (error) {
    console.error('Lyrics endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

// Spotify Endpoints
app.get('/api/spotify/status', async (req, res) => {
  try {
    const status = await checkSpotifyIntegration();
    res.json(status);
  } catch (error) {
    res.json({ ok: false });
  }
});

// Deezer Endpoints
app.get('/api/deezer/status', async (req, res) => {
  try {
    const status = await checkDeezerIntegration();
    res.json(status);
  } catch (error) {
    res.json({ ok: false });
  }
});

app.get('/api/deezer/trending', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 25;
    const tracks = await fetchDeezerTrending(limit);
    res.json(tracks);
  } catch (error) {
    console.error('Deezer trending route error:', error.message);
    res.json([]);
  }
});

app.get('/api/deezer/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });

    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const index = Number.parseInt(req.query.index, 10) || 0;
    const tracks = await searchDeezer(q, limit, index);
    res.json(tracks);
  } catch (error) {
    console.error('Deezer search route error:', error.message);
    res.json([]);
  }
});

app.get('/api/deezer/genre', async (req, res) => {
  try {
    const { genre } = req.query;
    if (!genre) return res.status(400).json({ error: 'Genre is required' });

    const limit = Number.parseInt(req.query.limit, 10) || 10;
    const index = Number.parseInt(req.query.index, 10) || 0;
    const tracks = await fetchDeezerGenre(genre, limit, index);
    res.json(tracks);
  } catch (error) {
    console.error('Deezer genre route error:', error.message);
    res.json([]);
  }
});

app.get('/api/spotify/trending', async (req, res) => {
  try {
    const tracks = await fetchSpotifyTrending();
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Spotify trending' });
  }
});

app.get('/api/spotify/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });
    const tracks = await searchSpotify(q);
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search Spotify' });
  }
});

app.get('/api/spotify/genre', async (req, res) => {
  try {
    const { genre, limit } = req.query;
    if (!genre) return res.status(400).json({ error: 'Genre is required' });
    const tracks = await fetchSpotifyGenre(genre, limit || 5);
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch Spotify genre ${req.query.genre}` });
  }
});

app.get('/api/spotify/resolve', async (req, res) => {
  try {
    const { title, artist } = req.query;
    if (!title || !artist) return res.status(400).json({ error: 'Title and artist are required' });

    console.log(`Resolving stream for: ${title} - ${artist}`);

    // Strategy 1: Jamendo Search
    const jamendoData = await searchJamendoForResolve(`${title} ${artist}`, 'popularity_week');
    if (jamendoData && jamendoData.results && jamendoData.results.length > 0) {
      const track = jamendoData.results[0];
      console.log(`Found Jamendo match: ${track.name}`);
      return res.json({
        url: track.audio,
        source: 'jamendo',
        matchType: 'audio'
      });
    }

    // Strategy 2: HearThis.at Search
    console.log(`Searching HearThis.at for: ${title} ${artist}`);
    const htResults = await searchHearThis(`${title} ${artist}`, 1, 5);
    if (htResults && htResults.length > 0) {
      const track = htResults[0];
      console.log(`Found HearThis match: ${track.title}`);
      return res.json({
        url: track.stream_url,
        source: 'hearthis',
        matchType: 'audio'
      });
    }

    console.warn(`No stream found for: ${title} - ${artist}`);
    res.json({ url: null });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve track' });
  }
});

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
