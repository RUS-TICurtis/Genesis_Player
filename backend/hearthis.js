import axios from 'axios';

async function fetchHearThisTracks(page = 1, count = 20) {
    try {
        // HearThis.at Feed API
        // Documentation is sparse, but standard public feed is typically at /feed/
        // We'll try the 'popular' feed.
        const url = `https://api-v2.hearthis.at/feed/?type=popular&page=${page}&count=${count}`;

        const response = await axios.get(url);

        // The API typically returns an array of track objects directly
        return response.data || [];
    } catch (error) {
        console.error('HearThis.at API error:', error.message);
        // Return empty array on failure so as not to crash the server response
        return [];
    }
}

export { fetchHearThisTracks };
