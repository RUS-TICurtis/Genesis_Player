// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import the cors middleware
require('dotenv').config();

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Discover endpoint
app.get('/discover', async (req, res) => {
  try {
    const { q } = req.query; // search query (song, artist, etc.)
    const response = await axios.get('https://api.jamendo.com/v3.0/tracks', {
      params: {
        client_id: process.env.JAMENDO_CLIENT_ID,
        format: 'json',
        limit: 10,
        search: q || 'popular'
      }
    });

    res.json(response.data.results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Download endpoint
app.get('/download/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    const response = await axios.get('https://api.jamendo.com/v3.0/tracks', {
      params: {
        client_id: process.env.JAMENDO_CLIENT_ID,
        format: 'json',
        id: trackId
      }
    });

    const track = response.data.results[0];
    if (track && track.audio) {
      res.redirect(track.audio); // redirect to MP3 download URL
    } else {
      res.status(404).json({ error: 'Track not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to download track' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
