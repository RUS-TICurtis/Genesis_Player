const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

async function debugGenius() {
    try {
        const title = "Shape of You";
        const artist = "Ed Sheeran";
        const query = `${title} ${artist}`.trim();

        console.log("Searching for:", query);
        const searchRes = await axios.get('https://api.genius.com/search', {
            headers: { Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}` },
            params: { q: query }
        });

        const hit = searchRes.data.response.hits[0];
        if (!hit) { console.log("No hit found"); return; }

        console.log("Fetching URL:", hit.result.url);
        const pageRes = await axios.get(hit.result.url);
        const html = pageRes.data;

        const startRegex = /<div[^>]*data-lyrics-container="true"[^>]*>/g;
        let match;
        let rawHtml = '';
        let count = 0;

        while ((match = startRegex.exec(html)) !== null) {
            count++;
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
                        const content = html.substring(startIndex, nextTag);
                        console.log(`\n--- Container ${count} Length: ${content.length} ---`);
                        console.log(content.substring(0, 100) + "...");
                        rawHtml += content;
                        break;
                    }
                    currentIndex = nextTag + 5;
                } else {
                    currentIndex = nextTag + 1;
                }
            }
        }

        console.log("\nTotal Raw HTML Length:", rawHtml.length);

        // Test cleaning
        let text = rawHtml.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/(div|p)>/gi, '\n');
        text = text.replace(/<[^>]+>/g, '');

        console.log("\n--- Cleaned Text Sample ---");
        console.log(text.substring(0, 500));

    } catch (e) {
        console.error("Error:", e);
    }
}

debugGenius();
