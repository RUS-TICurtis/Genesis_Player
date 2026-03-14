import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env');

console.log('Attempting to load .env from:', envPath);
if (fs.existsSync(envPath)) {
    console.log('.env file found.');
} else {
    console.error('.env file NOT found at:', envPath);
}

dotenv.config({ path: envPath });
