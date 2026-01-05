import axios from 'axios';

async function fetchGeniusLyrics(title, artist, album, year, language = 'en', skipIds = []) {
  try {
    const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    // 1. Concurrent Search Strategy
    const queries = [
      `${artist} ${title} ${album || ''} ${year || ''}`.trim(),
      `${artist} ${title} ${year || ''}`.trim(),
      `${artist} ${title}`.trim(),
      `${title} ${artist}`.trim()
    ].filter((q, i, self) => self.indexOf(q) === i); // Deduplicate

    const searchPromises = queries.map(q =>
      axios.get('https://api.genius.com/search', {
        headers: { Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}` },
        params: { q }
      }).catch(() => ({ data: { response: { hits: [] } } }))
    );

    const searchResults = await Promise.all(searchPromises);

    // Flatten all hits and deduplicate by song ID
    const allHitsMap = new Map();
    searchResults.forEach(res => {
      res.data.response.hits.forEach(hit => {
        const sid = hit.result.id.toString();
        if (!allHitsMap.has(sid) && !skipIds.includes(sid)) {
          allHitsMap.set(sid, hit);
        }
      });
    });

    const allHits = Array.from(allHitsMap.values());
    if (allHits.length === 0) return null;

    // 2. Weighted Scoring System
    const targetTitle = normalize(title);
    const targetArtist = normalize(artist);
    const targetAlbum = album ? normalize(album) : '';
    const targetYear = year ? year.toString() : '';

    let bestHit = null;
    let highestScore = -1;

    for (const hit of allHits) {
      const result = hit.result;
      const resTitle = normalize(result.title);
      const resArtist = normalize(result.primary_artist.name);

      let score = 0;

      // Artist Match (High Priority)
      if (resArtist === targetArtist) score += 100;
      else if (resArtist.includes(targetArtist) || targetArtist.includes(resArtist)) score += 50;

      // Title Match (High Priority)
      if (resTitle === targetTitle) score += 100;
      else if (resTitle.includes(targetTitle) || targetTitle.includes(resTitle)) score += 50;

      // Album Match (Bonus)
      if (result.album) {
        const resAlbum = normalize(result.album.name);
        if (resAlbum === targetAlbum) score += 30;
      }

      // Year Match (New Requirement)
      if (targetYear && result.release_date_components) {
        if (result.release_date_components.year.toString() === targetYear) {
          score += 30;
        }
      }

      // English Preference (Crucial for user request)
      const fullTitleLC = (result.full_title || '').toLowerCase();

      if (language === 'en') {
        if (fullTitleLC.includes('english') || fullTitleLC.includes('translation')) score += 20;
        if (fullTitleLC.includes('traduction') || fullTitleLC.includes('traduccion') ||
          fullTitleLC.includes('versão') || fullTitleLC.includes('deutsche')) {
          score -= 60;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestHit = hit;
      }
    }

    // Floor increased to 50 as requested
    if (highestScore < 50) return null;

    const hit = bestHit;
    const songId = hit.result.id.toString();
    let songUrl = hit.result.url;

    // 2. Check for translation if user language is not English
    if (language && language !== 'en') {
      // Try to fetch the translation page
      const translationUrl = `${songUrl}/translations/${language}`;
      try {
        const translationCheck = await axios.get(translationUrl);
        // If translation exists, use it
        if (translationCheck.status === 200) {
          songUrl = translationUrl;
        }
      } catch (e) {
        // Translation doesn't exist, use original
        console.log(`No ${language} translation found, using original`);
      }
    }

    // 3. Fetch the song page HTML
    const pageRes = await axios.get(songUrl);
    const html = pageRes.data;

    // 4. Extract lyrics using Balanced Tag Parsing to handle nested divs
    const startRegex = /<div[^>]*data-lyrics-container="true"[^>]*>/g;
    let match;
    let rawHtml = '';

    while ((match = startRegex.exec(html)) !== null) {
      const startIndex = match.index + match[0].length;
      let depth = 1;
      let currentIndex = startIndex;

      while (depth > 0 && currentIndex < html.length) {
        const nextTag = html.indexOf('<', currentIndex);
        if (nextTag === -1) break;

        if (html.startsWith('<div', nextTag)) {
          depth++;
          currentIndex = nextTag + 4;
        } else if (html.startsWith('</div', nextTag)) {
          depth--;
          if (depth === 0) {
            rawHtml += html.substring(startIndex, nextTag);
            break;
          }
          currentIndex = nextTag + 5;
        } else {
          currentIndex = nextTag + 1;
        }
      }
    }

    if (!rawHtml) return null;

    // 5. Clean up HTML to text
    let text = rawHtml.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(div|p)>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');

    // 6. Aggressive cleaning to remove ALL metadata before lyrics
    // Remove everything before the first section marker
    // Section markers are in format [Something] or [Something: Details]
    const sectionMarkerRegex = /\n\[([^\]]+)\]\n/;
    const firstSection = text.search(sectionMarkerRegex);

    if (firstSection !== -1) {
      // Found a section marker - remove everything before it
      text = text.substring(firstSection).trim();
    } else {
      // No section markers found - try to clean up common metadata patterns
      text = text.replace(/^\d+\s*Contributors[\s\S]*?(?=\n[A-Z])/gim, '');
      text = text.replace(/^.*?Translations[\s\S]*?(?=\n[A-Z])/gim, '');
    }

    // Ensure section headers have proper spacing
    text = text.replace(/(\[[^\]]+\])/g, '\n$1\n');

    // Remove excessive empty lines
    text = text.trim().replace(/\n{3,}/g, '\n\n');

    return { lyrics: text, id: songId };
  } catch (error) {
    console.error('Error fetching Genius lyrics:', error.message);
    return null;
  }
}

export { fetchGeniusLyrics };