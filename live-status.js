require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');

let lastTrack = null;
let lastAlbumCoverUrl = null;

function logStatus(message) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(message);
}

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

        const { name, artists, album } = res.data.item;
        const artistNames = artists.map(a => a.name).join(', ');
        const trackName = `${name} – ${artistNames}`;
        const albumCoverUrl = album.images[0]?.url ?? null;
        
        return { trackName, albumCoverUrl };
    } catch (e) {
        console.error('\n[Spotify] Ошибка:', e.response?.status ?? e.message);
        return null;
    }
}

async function getEmojiIdByName(emojiName) {
    try {
        const res = await axios.get(
            `${process.env.MATTERMOST_SERVER_URL}/api/v4/emoji/name/${emojiName}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.MATTERMOST_TOKEN}`,
                },
            }
        );
        return res.data.id;
    } catch (e) {
        if (e.response?.status === 404) return null;
        throw e;
    }
}

async function deleteEmoji(emojiId) {
    await axios.delete(
        `${process.env.MATTERMOST_SERVER_URL}/api/v4/emoji/${emojiId}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.MATTERMOST_TOKEN}`,
            },
        }
    );
}

async function updateCustomEmoji(albumCoverUrl) {
    const emojiName = process.env.MATTERMOST_EMOJI_NAME;
    if (!emojiName || !albumCoverUrl) return;

    try {
        // Скачиваем изображение обложки
        const imageRes = await axios.get(albumCoverUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageRes.data);

        // Удаляем существующий эмодзи если есть
        const existingEmojiId = await getEmojiIdByName(emojiName);
        if (existingEmojiId) {
            await deleteEmoji(existingEmojiId);
            logStatus(`[Emoji] Удалён → создаю новый...`);
        }

        // Создаём новый эмодзи
        const form = new FormData();
        form.append('emoji', JSON.stringify({
            name: emojiName,
            creator_id: process.env.MATTERMOST_USER_ID,
        }));
        form.append('image', imageBuffer, {
            filename: 'cover.jpg',
            contentType: 'image/jpeg',
        });

        await axios.post(
            `${process.env.MATTERMOST_SERVER_URL}/api/v4/emoji`,
            form,
            {
                headers: {
                    Authorization: `Bearer ${process.env.MATTERMOST_TOKEN}`,
                    ...form.getHeaders(),
                },
            }
        );
        logStatus(`[Emoji] :${emojiName}: обновлён`);
    } catch (e) {
        console.error('\n[Mattermost] Ошибка эмодзи:', e.response?.status ?? e.message);
    }
}

async function setMattermostStatus(statusText) {
    const emojiName = process.env.MATTERMOST_EMOJI_NAME ?? 'spotik';
    try {
        await axios.put(
            `${process.env.MATTERMOST_SERVER_URL}/api/v4/users/${process.env.MATTERMOST_USER_ID}/status/custom`,
            {
                emoji: emojiName,
                text: statusText,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.MATTERMOST_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        logStatus(`[▶] ${statusText}`);
    } catch (e) {
        console.error('\n[Mattermost] Ошибка статуса:', e.response?.status ?? e.message);
    }
}

async function updateLoop() {
    try {
        const token = await getSpotifyAccessToken();
        const trackData = await getCurrentSpotifyTrack(token);

        const trackName = trackData?.trackName ?? null;
        const albumCoverUrl = trackData?.albumCoverUrl ?? null;

        if (trackName !== lastTrack) {
            lastTrack = trackName;
            
            // Обновляем эмодзи только если обложка изменилась
            if (albumCoverUrl && albumCoverUrl !== lastAlbumCoverUrl) {
                lastAlbumCoverUrl = albumCoverUrl;
                await updateCustomEmoji(albumCoverUrl);
            }
            
            const status = trackName ?? '⏹ Не играет';
            await setMattermostStatus(status);
        } else {
            logStatus(`[▶] ${lastTrack ?? '⏹ Не играет'}`);
        }
    } catch (e) {
        console.error('\n[Error] Общая ошибка:', e.message);
    }
}

console.log('[System] Запуск лайв-трекинга Spotify → Mattermost\n');
setInterval(updateLoop, 5_000);
updateLoop();
