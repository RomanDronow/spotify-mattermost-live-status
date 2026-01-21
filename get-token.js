require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = 8888;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

const SCOPES = [
    'user-read-currently-playing',
    'user-read-playback-state',
].join(' ');

app.get('/', (req, res) => {
    const authUrl = `https://accounts.spotify.com/authorize?` +
        new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
        }).toString();

    res.send(`<a href="${authUrl}">Authorize with Spotify</a>`);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('No code provided');

    try {
        const tokenRes = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
            }),
            {
                headers: {
                    Authorization:
                        'Basic ' +
                        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { access_token, refresh_token } = tokenRes.data;

        res.send(`
      <h2>🎉 Готово!</h2>
      <p><strong>Refresh token:</strong></p>
      <pre>${refresh_token}</pre>
      <p>Скопируй его в .env файл</p>
    `);

        console.log('\n=== REFRESH TOKEN ===\n');
        console.log(refresh_token);
        console.log('\n=====================\n');
        process.exit(0);
    } catch (e) {
        res.send('Ошибка получения токена: ' + e.message);
        console.error(e.response?.data || e.message);
    }
});

app.listen(PORT, () => {
    console.log(`\n[Spotify Auth] Сервер запущен на http://localhost:${PORT}`);
    console.log(`[Spotify Auth] Открываю браузер...\n`);
    console.log(`http://localhost:${PORT}`);
});
