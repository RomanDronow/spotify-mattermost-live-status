require('dotenv').config();
const axios = require('axios');

let lastTrack = null;

async function getSpotifyAccessToken() {
    const res = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }), {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    return res.data.access_token;
}

async function getCurrentSpotifyTrack(accessToken) {
    try {
        const res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 204 || !res.data || !res.data.is_playing) return null;

        const { name, artists } = res.data.item;
        const artistNames = artists.map(a => a.name).join(', ');
        return `${name} – ${artistNames}`;
    } catch (e) {
        console.error('[Spotify] Ошибка:', e.response?.status || e.message);
        return null;
    }
}

async function setMattermostStatus(statusText) {
    try {
        await axios.put(
            `${process.env.MATTERMOST_SERVER_URL}/api/v4/users/${process.env.MATTERMOST_USER_ID}/status/custom`,
            {
                emoji: 'spotik',
                text: statusText,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.MATTERMOST_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('[Mattermost] Статус обновлён:', statusText);
    } catch (e) {
        console.error('[Mattermost] Ошибка обновления статуса:', e.response?.status || e.message);
    }
}

async function updateLoop() {
    try {
        const token = await getSpotifyAccessToken();
        const track = await getCurrentSpotifyTrack(token);

        if (track !== lastTrack) {
            lastTrack = track;
            const status = track || '⏹ Не играет';
            await setMattermostStatus(status);
        } else {
            console.log('[Info] Трек не изменился');
        }
    } catch (e) {
        console.error('[Error] Общая ошибка:', e.message);
    }
}

console.log('[System] Запуск лайв-трекинга Spotify → Mattermost');
setInterval(updateLoop, 5_000);
updateLoop();
