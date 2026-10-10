/*
 * Gemeinsame Firebase-Verbindung und Hilfsfunktionen.
 */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    browserLocalPersistence,
    getAuth,
    onAuthStateChanged,
    setPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    getDatabase, get, ref, onValue, remove, update, serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyCEFNMFPTKy7ZHutPkes_blz8ai-X6cVBk",
    authDomain: "kartenspiel-629e2.firebaseapp.com",
    databaseURL:
        "https://kartenspiel-629e2-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "kartenspiel-629e2",
    storageBucket: "kartenspiel-629e2.firebasestorage.app",
    messagingSenderId: "862927128087",
    appId: "1:862927128087:web:34076e472e0a89226dfe52"
};


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/*
 * Die anonyme Firebase-Anmeldung dauerhaft im Browser speichern.
 * Dadurch bleibt die UID auch bei Neuladen oder einer
 * kurzzeitigen Suspendierung des Tabs erhalten.
 */
try {
    await setPersistence(
        auth,
        browserLocalPersistence
    );
} catch (error) {
    console.error(
        "Dauerhafte Firebase-Anmeldung konnte nicht aktiviert werden:",
        error
    );
}

export const database = getDatabase(app);

export const COLORS = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

export const TRUMP_COLOR = "Rot";
export const MAX_PLAYERS = 10;


const COLOR_ALIASES = new Map([
    ["rot", "Rot"],
    ["red", "Rot"],
    ["blau", "Blau"],
    ["blue", "Blau"],
    ["grün", "Grün"],
    ["gruen", "Grün"],
    ["green", "Grün"],
    ["gelb", "Gelb"],
    ["yellow", "Gelb"]
]);


export function normalizeColor(value) {
    const normalized =
        String(value ?? "")
            .trim()
            .toLocaleLowerCase("de-DE");

    return COLOR_ALIASES.get(normalized) ??
        String(value ?? "").trim();
}


export function getCardColorClass(color) {
    const normalizedColor =
        normalizeColor(color);

    const classByColor = {
        Rot: "card-rot",
        Blau: "card-blau",
        "Grün": "card-gruen",
        Gelb: "card-gelb"
    };

    return classByColor[normalizedColor] ??
        "card-unknown";
}


export function getCardImagePath(color) {
    const normalizedColor =
        normalizeColor(color);

    const imageByColor = {
        Rot: "./assets/cards/rot.png?v=78",
        Blau: "./assets/cards/blau.png?v=78",
        "Grün": "./assets/cards/gruen.png?v=78",
        Gelb: "./assets/cards/gelb.png?v=78"
    };

    return imageByColor[normalizedColor] ??
        "./assets/cards/blau.png?v=78";
}


export function escapeHtml(value) {
    const characters = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    };

    return String(value).replace(
        /[&<>"']/g,
        character => characters[character]
    );
}


export function isMasterPlayerName(name) {
    return String(name ?? "").trim() ===
        "LukasLion";
}


export function renderPlayerNameHtml(name) {
    const safeName =
        escapeHtml(
            String(name ?? "").trim()
        );

    if (isMasterPlayerName(name)) {
        return `
            <span class="master-player-name">
                ${safeName}
            </span>
        `;
    }

    return safeName;
}


export function cleanRoomCode(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}


export function getSavedRoomCode() {
    const sessionRoomCode =
        cleanRoomCode(
            sessionStorage.getItem(
                "kartenspielRoomCode"
            )
        );

    if (sessionRoomCode.length === 6) {
        return sessionRoomCode;
    }

    return cleanRoomCode(
        localStorage.getItem(
            "kartenspielRoomCode"
        )
    );
}


export function getSavedPlayerName() {
    return (
        sessionStorage.getItem(
            "kartenspielPlayerName"
        ) ??
        localStorage.getItem(
            "kartenspielPlayerName"
        ) ??
        ""
    ).trim();
}


export function saveRoomSession(
    roomCode,
    playerName
) {
    void startRoomPresence(roomCode);
    sessionStorage.setItem(
        "kartenspielRoomCode",
        roomCode
    );

    sessionStorage.setItem(
        "kartenspielPlayerName",
        playerName
    );

    /*
     * Zusätzlicher Wiederaufnahme-Punkt für mobile Browser,
     * die einen Hintergrund-Tab vollständig entladen.
     */
    localStorage.setItem(
        "kartenspielRoomCode",
        roomCode
    );

    localStorage.setItem(
        "kartenspielPlayerName",
        playerName
    );
}


export function clearRoomSession() {
    // Leaving a room keeps the last player name for the next visit.
    sessionStorage.removeItem("kartenspielRoomCode");
    localStorage.removeItem("kartenspielRoomCode");
}


export function getRoomCodeFromUrl() {
    const parameters =
        new URLSearchParams(
            window.location.search
        );

    const queryRoom =
        cleanRoomCode(
            parameters.get("room")
        );

    if (queryRoom.length === 6) {
        return queryRoom;
    }

    return getSavedRoomCode();
}


export function routeForStatus(
    status,
    roomCode
) {
    const roomParameter =
        `?room=${encodeURIComponent(roomCode)}`;

    if (status === "lobby") {
        return `./index.html${roomParameter}`;
    }

    if (
        status === "roundSetup" ||
        status === "gameFinished"
    ) {
        return `./round.html${roomParameter}`;
    }

    if (status === "tips") {
        return `./tip.html${roomParameter}`;
    }

    if (
        status === "playing" ||
        status === "trickResult" ||
        status === "roundResult"
    ) {
        return `./game.html${roomParameter}`;
    }

    return `./index.html${roomParameter}`;
}


export function redirectToStatus(
    status,
    roomCode,
    currentPage
) {
    const target =
        routeForStatus(
            status,
            roomCode
        );

    if (!target.startsWith(currentPage)) {
        window.location.replace(target);
    }
}


export function createDeck() {
    const deck = [];

    for (const color of COLORS) {
        for (
            let value = 1;
            value <= 20;
            value++
        ) {
            deck.push({
                id: `${color}_${value}`,
                color,
                value
            });
        }
    }

    return deck;
}


function secureRandomInteger(
    maximumExclusive
) {
    if (
        !Number.isInteger(maximumExclusive) ||
        maximumExclusive <= 0
    ) {
        throw new Error(
            "Die Zufallsobergrenze muss eine positive ganze Zahl sein."
        );
    }

    /*
     * Ablehnungsverfahren gegen Modulo-Verzerrung:
     * Nur Werte aus einem vollständig teilbaren Bereich
     * werden verwendet.
     */
    const maximumUint32 =
        0x100000000;

    const validLimit =
        maximumUint32 -
        (
            maximumUint32 %
            maximumExclusive
        );

    const randomBuffer =
        new Uint32Array(1);

    let randomValue;

    do {
        crypto.getRandomValues(
            randomBuffer
        );

        randomValue =
            randomBuffer[0];
    } while (
        randomValue >= validLimit
    );

    return randomValue %
        maximumExclusive;
}


export function shuffle(deck) {
    if (!Array.isArray(deck)) {
        throw new Error(
            "Zum Mischen wird ein Kartenstapel benötigt."
        );
    }

    /*
     * Unverzerrtes Fisher-Yates-Mischen mit
     * crypto.getRandomValues statt Math.random.
     */
    for (
        let index = deck.length - 1;
        index > 0;
        index--
    ) {
        const randomIndex =
            secureRandomInteger(
                index + 1
            );

        [
            deck[index],
            deck[randomIndex]
        ] = [
            deck[randomIndex],
            deck[index]
        ];
    }

    return deck;
}


export function cardsToObject(cards) {
    const result = {};

    for (const card of cards) {
        result[card.id] = card;
    }

    return result;
}


export function objectToCards(handObject) {
    const colorOrder = new Map(
        COLORS.map((color, index) => [
            color,
            index
        ])
    );

    return Object.values(
        handObject ?? {}
    ).sort((cardA, cardB) => {
        const colorDifference =
            colorOrder.get(cardA.color) -
            colorOrder.get(cardB.color);

        if (colorDifference !== 0) {
            return colorDifference;
        }

        return cardA.value - cardB.value;
    });
}


export function canPlayCard(
    handCards,
    card,
    leadColor
) {
    const normalizedLeadColor =
        normalizeColor(leadColor);

    if (!normalizedLeadColor) {
        return true;
    }

    const hasLeadColor =
        handCards.some(
            handCard =>
                normalizeColor(
                    handCard.color
                ) === normalizedLeadColor
        );

    if (!hasLeadColor) {
        return true;
    }

    return normalizeColor(card.color) ===
        normalizedLeadColor;
}


function getTrickCardStrength(
    card,
    leadColor
) {
    const cardColor =
        normalizeColor(card?.color);

    const normalizedLeadColor =
        normalizeColor(leadColor);

    const cardValue =
        Number(card?.value);

    if (
        !COLORS.includes(cardColor) ||
        !Number.isFinite(cardValue)
    ) {
        return Number.NEGATIVE_INFINITY;
    }

    /*
     * Rot ist immer Trumpf und schlägt jede andere Farbe.
     * Unter mehreren roten Karten gewinnt die höchste Zahl.
     */
    if (cardColor === TRUMP_COLOR) {
        return 2000 + cardValue;
    }

    /*
     * Gibt es keinen roten Trumpf, können nur Karten der
     * ausgespielten Farbe den Stich gewinnen.
     */
    if (cardColor === normalizedLeadColor) {
        return 1000 + cardValue;
    }

    /*
     * Karten einer nicht ausgespielten Nicht-Trumpf-Farbe
     * können den Stich nicht gewinnen.
     */
    return cardValue;
}


export function determineTrickWinner(
    trick,
    leadColor
) {
    if (
        !Array.isArray(trick) ||
        trick.length === 0
    ) {
        throw new Error(
            "Ein leerer Stich kann nicht ausgewertet werden."
        );
    }

    const effectiveLeadColor =
        normalizeColor(
            leadColor ??
            trick[0]?.card?.color
        );

    const winner =
        trick.reduce(
            (highestEntry, currentEntry) => {
                const highestStrength =
                    getTrickCardStrength(
                        highestEntry.card,
                        effectiveLeadColor
                    );

                const currentStrength =
                    getTrickCardStrength(
                        currentEntry.card,
                        effectiveLeadColor
                    );

                return currentStrength >
                    highestStrength
                    ? currentEntry
                    : highestEntry;
            }
        );

    return winner.playerId;
}


export function calculateRoundPoints(
    tip,
    tricksWon
) {
    if (tip === tricksWon) {
        return 10 + tricksWon * 5;
    }

    return -5 * Math.abs(
        tip - tricksWon
    );
}


export function getNextPlayerId(
    playerOrder,
    currentPlayerId
) {
    const currentIndex =
        playerOrder.indexOf(
            currentPlayerId
        );

    return playerOrder[
        (currentIndex + 1) %
        playerOrder.length
    ];
}


export function rotateOrder(
    playerOrder,
    startingPlayerId
) {
    const startIndex =
        playerOrder.indexOf(
            startingPlayerId
        );

    if (startIndex < 0) {
        return [...playerOrder];
    }

    return [
        ...playerOrder.slice(startIndex),
        ...playerOrder.slice(0, startIndex)
    ];
}


export function orderedPlayers(
    playersObject
) {
    return Object.entries(
        playersObject ?? {}
    )
        .sort(
            ([, playerA], [, playerB]) =>
                (playerA.joinedAt ?? 0) -
                (playerB.joinedAt ?? 0)
        )
        .map(([id, player]) => ({
            id,
            ...player
        }));
}

// One-card rounds: only opponents are rendered face up.
export function renderBlindHand(area, state, user, scores, ownHand, play) {
    const blindRound = state?.cardsPerPlayer === 1 && Boolean(user);
    area.classList.toggle("blind-mode", blindRound);
    const section = area.closest("section");
    const oldOwn = section.querySelector(".blind-own-slot");
    if (oldOwn) oldOwn.remove();
    if (!blindRound) return false;
    const title = area.closest("section").querySelector("h2");
    title.textContent = "DEINE KARTE";
    area.innerHTML = "";
    for (const id of state.playerOrder ?? []) {
        if (id === user.uid) continue;
        const wrap = document.createElement("div");
        wrap.className = "blind-player";
        const name = document.createElement("div");
        name.textContent = scores[id]?.name ?? "Mitspieler";
        wrap.append(name);
        const card = state.singleCards?.[id];
        if (card) {
            const face = document.createElement("div");
            face.className = `card display-card ${getCardColorClass(card.color)}`;
            face.innerHTML = `<img class="card-color-image" src="${getCardImagePath(card.color)}" alt=""><strong>${card.value}</strong>`;
            face.setAttribute("aria-label", `${card.color} ${card.value}`);
            wrap.append(face);
        }
        area.append(wrap);
    }
    const cards = objectToCards(ownHand);
    if (cards.length) {
        const back = document.createElement(play ? "button" : "div");
        back.className = "card blind-card";
        back.textContent = play ? "Eigene Karte spielen" : "Deine Karte ist verdeckt";
        if (play) {
            back.type = "button";
            back.disabled = state.status !== "playing" || state.currentPlayerId !== user.uid;
            back.onclick = () => play(cards[0].id);
        }
        const ownSlot = document.createElement("div");
        ownSlot.className = "blind-own-slot";
        const ownLabel = document.createElement("span");
        ownLabel.textContent = "DEINE KARTE · VERDECKT";
        ownSlot.append(ownLabel, back);
        section.append(ownSlot);
    }
    return true;
}


// Leaving transfers host ownership before removing the old host.
export async function leaveGameRoom(code, uid) {
    await remove(ref(database, `games/${code}/presence/${uid}`));
    const [metaSnap, playersSnap] = await Promise.all([
        get(ref(database, `games/${code}/meta`)),
        get(ref(database, `games/${code}/lobbyPlayers`))
    ]);
    const meta = metaSnap.val();
    const players = playersSnap.val() ?? {};
    if (!meta) return;
    if (meta.hostId !== uid) {
        await remove(ref(database, `games/${code}/lobbyPlayers/${uid}`));
        return;
    }
    const next = Object.keys(players).find(id => id !== uid);
    if (!next) {
        await update(ref(database), { [`games/${code}`]: null, [`publicRooms/${code}`]: null });
        return;
    }
    const changes = {
        [`games/${code}/meta/hostId`]: next,
        [`games/${code}/meta/hostName`]: players[next].name,
        [`games/${code}/lobbyPlayers/${uid}`]: null
    };
    const listing = (await get(ref(database, `publicRooms/${code}`))).val();
    if (listing) {
        changes[`publicRooms/${code}/hostId`] = next;
        changes[`publicRooms/${code}/hostName`] = players[next].name;
        changes[`publicRooms/${code}/playerCount`] = Object.keys(players).length - 1;
    }
    await update(ref(database), changes);
}

// Finish an absent player's remaining turns automatically for this round.
// The next deal uses lobbyPlayers, so only remaining players receive cards.
export function departureRequest(state, players, scores, hand) {
    if (!state) return null;
    if (state.status === "tips" && state.currentTipPlayerId && !players[state.currentTipPlayerId]) {
        const id = state.currentTipPlayerId;
        const order = state.tipOrder ?? state.playerOrder ?? [];
        const sum = order.filter(other => other !== id).reduce((n, other) => n + (scores[other]?.tipSubmitted ? Number(scores[other].tip) : 0), 0);
        const last = order[order.length - 1] === id;
        return { kind: "tipRequests", id, value: { tip: last && sum === state.cardsPerPlayer ? 1 : 0 } };
    }
    if (state.status === "playing" && state.currentPlayerId && !players[state.currentPlayerId]) {
        const cards = objectToCards(hand);
        const card = cards.find(card => canPlayCard(cards, card, state.leadColor));
        if (card) return { kind: "playRequests", id: state.currentPlayerId, value: { cardId: card.id } };
    }
    return null;
}

if (/(?:tip|game|round)\.html$/.test(location.pathname)) {
    const exit = document.createElement("button");
    exit.className = "leave-game-button";
    exit.type = "button";
    exit.textContent = "Spiel verlassen";
    document.body.append(exit);
    exit.onclick = async () => {
        exit.disabled = true;
        try {
            const code = getRoomCodeFromUrl();
            if (code && auth.currentUser) await leaveGameRoom(code, auth.currentUser.uid);
            clearRoomSession();
            location.replace("./index.html");
        } catch (error) {
            exit.disabled = false;
            alert("Verlassen fehlgeschlagen: " + error.message);
        }
    };
    const code = getRoomCodeFromUrl();
    onAuthStateChanged(auth, user => {
        if (!code || !user) return;
        let running = false, repeat = false;
        async function advanceDepartedPlayer() {
            if (running) { repeat = true; return; }
            running = true;
            try {
                do {
                    repeat = false;
                    const meta = (await get(ref(database, `games/${code}/meta`))).val();
                    if (meta?.hostId !== user.uid) break;
                    const [stateSnap, playersSnap, scoresSnap] = await Promise.all([
                        get(ref(database, `games/${code}/state`)),
                        get(ref(database, `games/${code}/lobbyPlayers`)),
                        get(ref(database, `games/${code}/scores`))
                    ]);
                    const state = stateSnap.val(), players = playersSnap.val() ?? {};
                    if (!state) break;
                    const absent = (state.playerOrder ?? []).filter(id => !players[id]);
                    if (absent.length) {
                        const labels = {};
                        for (const id of absent) {
                            const name = scoresSnap.val()?.[id]?.name ?? "Spieler";
                            if (!name.endsWith(" (verlassen)")) labels[`games/${code}/scores/${id}/name`] = name + " (verlassen)";
                        }
                        if (Object.keys(labels).length) await update(ref(database), labels);
                    }
                    const id = state.currentPlayerId;
                    const hand = state.status === "playing" && id && !players[id]
                        ? (await get(ref(database, `games/${code}/hands/${id}`))).val() : {};
                    const request = departureRequest(state, players, scoresSnap.val() ?? {}, hand);
                    if (request) await update(ref(database), { [`games/${code}/${request.kind}/${request.id}`]: request.value });
                } while (repeat);
            } catch (error) { console.error("Ausgestiegenen Spieler überspringen:", error); }
            finally { running = false; }
        }
        for (const key of ["meta", "state", "lobbyPlayers"]) onValue(ref(database, `games/${code}/${key}`), advanceDepartedPlayer);
    });
}

// Keep the room discoverable throughout play; the current host refreshes it.
if (/(?:tip|game|round)\.html$/.test(location.pathname)) {
    const code = getRoomCodeFromUrl();
    onAuthStateChanged(auth, user => {
        if (!user || !code) return;
        let publishing = false;
        async function publishActiveRoom() {
            if (publishing) return;
            publishing = true;
            try {
                const meta = (await get(ref(database, `games/${code}/meta`))).val();
                if (!meta || meta.hostId !== user.uid) return;
                const players = (await get(ref(database, `games/${code}/lobbyPlayers`))).val() ?? {};
                await update(ref(database), { [`games/${code}/meta/lastSeenAt`]: serverTimestamp(), [`publicRooms/${code}`]: {
                    hostId: user.uid, hostName: players[user.uid]?.name ?? meta.hostName ?? "Spielleiter",
                    roomName: meta.roomName ?? "Spielraum", createdAt: meta.createdAt ?? Date.now(),
                    lastSeenAt: serverTimestamp(), playerCount: Object.keys(players).length, status: meta.status
                } });
            } catch (error) { console.error("Raumliste aktualisieren:", error); }
            finally { publishing = false; }
        }
        onValue(ref(database, `games/${code}/meta`), publishActiveRoom);
        onValue(ref(database, `games/${code}/lobbyPlayers`), publishActiveRoom);
        setInterval(publishActiveRoom, 20000);
    });
}

// Absolute lifetime: 24 hours after creation, independent of activity.
export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export function roomHasExpired(room, serverNow) {
    const created = Number(room?.createdAt);
    return Number.isFinite(created) && created > 0 && serverNow >= created + ROOM_LIFETIME_MS;
}
onAuthStateChanged(auth, user => {
    if (!user) return;
    let offset = null, rooms = {}, cleaning = false;
    async function cleanupExpiredRooms() {
        if (offset === null || cleaning) return;
        cleaning = true;
        try {
            const changes = {};
            for (const [code, room] of Object.entries(rooms)) {
                if (roomHasExpired(room, Date.now() + offset)) {
                    changes[`games/${code}`] = null;
                    changes[`publicRooms/${code}`] = null;
                }
            }
            if (Object.keys(changes).length) await update(ref(database), changes);
        } catch (error) { console.error("Abgelaufene Räume löschen:", error); }
        finally { cleaning = false; }
    }
    onValue(ref(database, ".info/serverTimeOffset"), snapshot => {
        offset = Number(snapshot.val() ?? 0);
        void cleanupExpiredRooms();
    });
    onValue(ref(database, "publicRooms"), snapshot => {
        rooms = snapshot.val() ?? {};
        void cleanupExpiredRooms();
    });
    setInterval(cleanupExpiredRooms, 60000);
});

// Presence survives short page transitions via a two-minute grace period.
let presenceRoom = null;
async function startRoomPresence(code) {
    const uid = auth.currentUser?.uid;
    if (!uid || !code || code.length !== 6 || presenceRoom === code) return;
    presenceRoom = code;
    const member = (await get(ref(database, `games/${code}/lobbyPlayers/${uid}`))).exists();
    if (!member) { presenceRoom = null; return; }
    const connection = ref(database, ".info/connected");
    const ownPresence = ref(database, `games/${code}/presence/${uid}`);
    onValue(connection, async snapshot => {
        if (!snapshot.val()) return;
        try {
            await onDisconnect(ownPresence).remove();
            await update(ownPresence, { lastSeenAt: serverTimestamp() });
        } catch (error) { console.error("Anwesenheit:", error); }
    });
}
onAuthStateChanged(auth, user => { if (user) void startRoomPresence(getRoomCodeFromUrl()); });
