const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
initializeApp();
// Runs without any player having the website open.
exports.deleteExpiredRooms = onSchedule({ schedule: "every 1 minutes", region: "europe-west1", maxInstances: 1 }, async () => {
    const database = getDatabase();
    const now = Date.now();
    const rooms = (await database.ref("publicRooms").get()).val() ?? {};
    for (const [code, room] of Object.entries(rooms)) {
        const created = Number(room.createdAt);
        if (!Number.isFinite(created) || created <= 0 || now < created + 86400000) continue;
        // Recheck the room age inside the transaction to avoid deleting a reused code.
        const deleted = await database.ref(`games/${code}`).transaction(game => {
            if (!game) return null;
            const createdAt = Number(game.meta?.createdAt);
            if (createdAt > 0 && now >= createdAt + 86400000) return null;
            return;
        });
        if (deleted.committed) await database.ref(`publicRooms/${code}`).transaction(current => {
            if (current && Number(current.createdAt) > 0 && now >= Number(current.createdAt) + 86400000) return null;
            return;
        });
    }
});
