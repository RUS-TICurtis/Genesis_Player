import axios from 'axios';

async function fetchHearThisTracks(page = 1, count = 20) {
    try {
        const url = `https://api-v2.hearthis.at/feed/?type=popular&page=${page}&count=${count}`;
        const response = await axios.get(url);
        return response.data || [];
    } catch (error) {
        console.error('HearThis fetch error:', error.message);
        return [];
    }
}

async function searchHearThis(query, page = 1, count = 20) {
    try {
        const url = `https://api-v2.hearthis.at/search?t=${encodeURIComponent(query)}&page=${page}&count=${count}`;
        const response = await axios.get(url);
        return response.data || [];
    } catch (error) {
        console.error('HearThis search error:', error.message);
        return [];
    }
}

export { fetchHearThisTracks, searchHearThis };
