/*
 * Online-Kartenspiel mit Firebase Realtime Database.
 *
 * Es gibt keinen lokalen Spielmodus.
 * Firebase ist die gemeinsame Datenquelle für alle Geräte.
 */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    getDatabase,
    onDisconnect,
    onValue,
    ref,
    remove,
    runTransaction,
    set,
    update
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
const auth = getAuth(app);
const database = getDatabase(app);


const COLORS = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

const TRUMP_COLOR = "Rot";
const MAX_PLAYERS = 10;


let currentUser = null;
let activeRoomCode = null;
let roomMeta = null;
let roomPlayers = {};
let gameState = null;
let gameScores = {};
let ownHand = {};

let stopMetaListener = null;
let stopPlayersListener = null;
let stopStateListener = null;
let stopScoresListener = null;
let stopHandListener = null;
let stopTipRequestsListener = null;
let stopPlayRequestsListener = null;

let processingTips = false;
let processingPlay = false;
let playRequestPending = false;


const firebaseStatus =
    document.getElementById("firebaseStatus");

const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

const onlinePlayerList =
    document.getElementById("onlinePlayerList");

const onlinePlayerNameInput =
    document.getElementById("onlinePlayerName");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const hostPanel =
    document.getElementById("hostPanel");

const cardsPerPlayerInput =
    document.getElementById("cardsPerPlayer");

const startRoundButton =
    document.getElementById("startRoundButton");

const nextTrickButton =
    document.getElementById("nextTrickButton");

const finishGameButton =
    document.getElementById("finishGameButton");

const deleteRoomButton =
    document.getElementById("deleteRoomButton");

const messageArea =
    document.getElementById("messageArea");

const tipsArea =
    document.getElementById("tipsArea");

const tipInput =
    document.getElementById("tipInput");

const submitTipButton =
    document.getElementById("submitTipButton");

const tipStatus =
    document.getElementById("tipStatus");

const trickArea =
    document.getElementById("trickArea");

const gameArea =
    document.getElementById("game");

const scoreboard =
    document.getElementById("scoreboard");


function setFirebaseStatus(message) {
    firebaseStatus.textContent = message;
}


function setMessage(title, message) {
    messageArea.innerHTML = `
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
    `;
}


function escapeHtml(value) {
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


function cleanRoomCode(value) {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}


function getPlayerName() {
    return onlinePlayerNameInput.value.trim();
}


function validatePlayerName() {
    const playerName = getPlayerName();

    if (playerName === "") {
        alert("Bitte gib deinen Namen ein.");
        onlinePlayerNameInput.focus();
        return null;
    }

    if (playerName.length > 30) {
        alert(
            "Der Spielername darf höchstens 30 Zeichen lang sein."
        );
        return null;
    }

    return playerName;
}


function generateRoomCode() {
    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let index = 0; index < 6; index++) {
        const randomIndex = Math.floor(
            Math.random() * characters.length
        );

        code += characters[randomIndex];
    }

    return code;
}


function isHost() {
    return Boolean(
        currentUser &&
        roomMeta &&
        roomMeta.hostId === currentUser.uid
    );
}


function getOrderedLobbyPlayers() {
    return Object.entries(roomPlayers)
        .sort(
            ([, playerA], [, playerB]) =>
                (playerA.joinedAt ?? 0) -
                (playerB.joinedAt ?? 0)
        )
        .map(([playerId, player]) => ({
            id: playerId,
            ...player
        }));
}


function createDeck() {
    const deck = [];

    for (const color of COLORS) {
        for (let value = 1; value <= 20; value++) {
            deck.push({
                id: `${color}_${value}`,
                color,
                value
            });
        }
    }

    return deck;
}


function shuffle(deck) {
    for (let index = deck.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(
            Math.random() * (index + 1)
        );

        [deck[index], deck[randomIndex]] =
            [deck[randomIndex], deck[index]];
    }
}


function sortCards(cards) {
    const colorOrder = new Map(
        COLORS.map((color, index) => [
            color,
            index
        ])
    );

    return [...cards].sort((cardA, cardB) => {
        const colorDifference =
            colorOrder.get(cardA.color) -
            colorOrder.get(cardB.color);

        if (colorDifference !== 0) {
            return colorDifference;
        }

        return cardA.value - cardB.value;
    });
}


function objectToCards(handObject) {
    if (!handObject) {
        return [];
    }

    return sortCards(
        Object.values(handObject)
    );
}


function cardsToObject(cards) {
    const result = {};

    for (const card of cards) {
        result[card.id] = card;
    }

    return result;
}


function canPlayCard(handCards, card, leadColor) {
    if (!leadColor) {
        return true;
    }

    const hasLeadColor = handCards.some(
        handCard => handCard.color === leadColor
    );

    if (!hasLeadColor) {
        return true;
    }

    return card.color === leadColor;
}


function determineTrickWinner(trick, leadColor) {
    const trumpCards = trick.filter(
        entry => entry.card.color === TRUMP_COLOR
    );

    const relevantCards =
        trumpCards.length > 0
            ? trumpCards
            : trick.filter(
                entry => entry.card.color === leadColor
            );

    return relevantCards.reduce(
        (highest, current) =>
            current.card.value > highest.card.value
                ? current
                : highest
    ).playerId;
}


function calculateRoundPoints(tip, tricksWon) {
    if (tip === tricksWon) {
        return 10 + tricksWon * 5;
    }

    return -5 * Math.abs(
        tip - tricksWon
    );
}


function getNextPlayerId(playerOrder, currentPlayerId) {
    const currentIndex =
        playerOrder.indexOf(currentPlayerId);

    const nextIndex =
        (currentIndex + 1) % playerOrder.length;

    return playerOrder[nextIndex];
}


async function createRoom() {
    const playerName = validatePlayerName();

    if (!playerName || !currentUser) {
        return;
    }

    createRoomButton.disabled = true;
    joinRoomButton.disabled = true;

    setFirebaseStatus("Spielraum wird erstellt …");

    try {
        for (let attempt = 0; attempt < 10; attempt++) {
            const roomCode = generateRoomCode();

            const metaReference = ref(
                database,
                `games/${roomCode}/meta`
            );

            const result = await runTransaction(
                metaReference,
                currentMeta => {
                    if (currentMeta !== null) {
                        return;
                    }

                    return {
                        hostId: currentUser.uid,
                        status: "lobby",
                        createdAt: Date.now()
                    };
                },
                {
                    applyLocally: false
                }
            );

            if (!result.committed) {
                continue;
            }

            await set(
                ref(
                    database,
                    `games/${roomCode}/lobbyPlayers/${currentUser.uid}`
                ),
                {
                    name: playerName,
                    joinedAt: Date.now()
                }
            );

            await enterRoom(roomCode);
            return;
        }

        throw new Error(
            "Es konnte kein freier Spielcode erzeugt werden."
        );

    } catch (error) {
        console.error(error);

        setFirebaseStatus(
            `Spielraum konnte nicht erstellt werden: ${error.message}`
        );

    } finally {
        createRoomButton.disabled = false;
        joinRoomButton.disabled = false;
    }
}


async function joinRoom() {
    const playerName = validatePlayerName();

    if (!playerName || !currentUser) {
        return;
    }

    const roomCode =
        cleanRoomCode(roomCodeInput.value);

    if (roomCode.length !== 6) {
        alert(
            "Der Spielcode muss genau 6 Zeichen haben."
        );

        return;
    }

    createRoomButton.disabled = true;
    joinRoomButton.disabled = true;

    setFirebaseStatus("Spielraum wird gesucht …");

    try {
        const metaSnapshot = await get(
            ref(
                database,
                `games/${roomCode}/meta`
            )
        );

        if (!metaSnapshot.exists()) {
            alert("Dieser Spielraum existiert nicht.");
            return;
        }

        const meta = metaSnapshot.val();

        const stateSnapshot = await get(
            ref(
                database,
                `games/${roomCode}/state`
            )
        );

        const state = stateSnapshot.val();

        const isReturningPlayer =
            Array.isArray(state?.playerOrder) &&
            state.playerOrder.includes(currentUser.uid);

        if (
            meta.status !== "lobby" &&
            !isReturningPlayer
        ) {
            alert(
                "Dieses Spiel wurde bereits gestartet."
            );

            return;
        }

        const playersSnapshot = await get(
            ref(
                database,
                `games/${roomCode}/lobbyPlayers`
            )
        );

        const players =
            playersSnapshot.val() ?? {};

        const existingPlayerValues =
            Object.entries(players)
                .filter(
                    ([playerId]) =>
                        playerId !== currentUser.uid
                )
                .map(([, player]) => player);

        if (
            existingPlayerValues.length >= MAX_PLAYERS
        ) {
            alert(
                "In diesem Spielraum sind bereits 10 Spieler."
            );

            return;
        }

        const duplicateName =
            existingPlayerValues.some(
                player =>
                    String(player.name)
                        .toLowerCase() ===
                    playerName.toLowerCase()
            );

        if (duplicateName) {
            alert(
                "Dieser Spielername wird bereits verwendet."
            );

            return;
        }

        await set(
            ref(
                database,
                `games/${roomCode}/lobbyPlayers/${currentUser.uid}`
            ),
            {
                name: playerName,
                joinedAt:
                    players[currentUser.uid]?.joinedAt ??
                    Date.now()
            }
        );

        await enterRoom(roomCode);

    } catch (error) {
        console.error(error);

        setFirebaseStatus(
            `Beitritt fehlgeschlagen: ${error.message}`
        );

    } finally {
        createRoomButton.disabled = false;
        joinRoomButton.disabled = false;
    }
}


async function enterRoom(roomCode) {
    stopRoomListeners();

    activeRoomCode = roomCode;

    sessionStorage.setItem(
        "kartenspielRoomCode",
        roomCode
    );

    sessionStorage.setItem(
        "kartenspielPlayerName",
        getPlayerName()
    );

    roomCodeInput.value = roomCode;

    activeRoomCodeElement.innerHTML = `
        Aktueller Spielcode:
        <strong>${escapeHtml(roomCode)}</strong>
    `;

    setFirebaseStatus(
        "Mit dem Spielraum verbunden."
    );

    const ownLobbyPlayerReference = ref(
        database,
        `games/${roomCode}/lobbyPlayers/${currentUser.uid}`
    );

    await onDisconnect(
        ownLobbyPlayerReference
    ).remove();

    attachRoomListeners();
}


function attachRoomListeners() {
    if (!activeRoomCode || !currentUser) {
        return;
    }

    stopMetaListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/meta`
        ),
        snapshot => {
            if (!snapshot.exists()) {
                handleDeletedRoom();
                return;
            }

            roomMeta = snapshot.val();

            renderAll();
            attachHostRequestListeners();
        }
    );

    stopPlayersListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/lobbyPlayers`
        ),
        snapshot => {
            roomPlayers =
                snapshot.val() ?? {};

            renderAll();
        }
    );

    stopStateListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/state`
        ),
        snapshot => {
            gameState =
                snapshot.val();

            playRequestPending = false;

            renderAll();
            attachHostRequestListeners();
        }
    );

    stopScoresListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/scores`
        ),
        snapshot => {
            gameScores =
                snapshot.val() ?? {};

            renderAll();
        }
    );

    stopHandListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/hands/${currentUser.uid}`
        ),
        snapshot => {
            ownHand =
                snapshot.val() ?? {};

            playRequestPending = false;

            renderHand();
        },
        error => {
            console.error(error);

            gameArea.innerHTML = `
                <h2>Deine Hand</h2>
                <p>
                    Handkarten konnten nicht geladen werden:
                    ${escapeHtml(error.message)}
                </p>
            `;
        }
    );
}


function attachHostRequestListeners() {
    if (!activeRoomCode || !isHost()) {
        stopHostRequestListeners();
        return;
    }

    if (!stopTipRequestsListener) {
        stopTipRequestsListener = onValue(
            ref(
                database,
                `games/${activeRoomCode}/tipRequests`
            ),
            () => {
                processTipRequests();
            }
        );
    }

    if (!stopPlayRequestsListener) {
        stopPlayRequestsListener = onValue(
            ref(
                database,
                `games/${activeRoomCode}/playRequests`
            ),
            () => {
                processPlayRequests();
            }
        );
    }
}


function stopHostRequestListeners() {
    if (stopTipRequestsListener) {
        stopTipRequestsListener();
        stopTipRequestsListener = null;
    }

    if (stopPlayRequestsListener) {
        stopPlayRequestsListener();
        stopPlayRequestsListener = null;
    }
}


function stopRoomListeners() {
    const listeners = [
        "stopMetaListener",
        "stopPlayersListener",
        "stopStateListener",
        "stopScoresListener",
        "stopHandListener"
    ];

    for (const listenerName of listeners) {
        const listener = eval(listenerName);

        if (listener) {
            listener();

            if (listenerName === "stopMetaListener") {
                stopMetaListener = null;
            } else if (
                listenerName === "stopPlayersListener"
            ) {
                stopPlayersListener = null;
            } else if (
                listenerName === "stopStateListener"
            ) {
                stopStateListener = null;
            } else if (
                listenerName === "stopScoresListener"
            ) {
                stopScoresListener = null;
            } else if (
                listenerName === "stopHandListener"
            ) {
                stopHandListener = null;
            }
        }
    }

    stopHostRequestListeners();
}


function handleDeletedRoom() {
    stopRoomListeners();

    activeRoomCode = null;
    roomMeta = null;
    roomPlayers = {};
    gameState = null;
    gameScores = {};
    ownHand = {};

    sessionStorage.removeItem(
        "kartenspielRoomCode"
    );

    activeRoomCodeElement.textContent = "";

    setFirebaseStatus(
        "Der Spielraum wurde gelöscht."
    );

    renderAll();
}


async function startRound() {
    if (!isHost() || !activeRoomCode) {
        return;
    }

    if (
        gameState &&
        ![
            "roundResult",
            "gameFinished"
        ].includes(gameState.status)
    ) {
        alert(
            "Die aktuelle Runde ist noch nicht beendet."
        );

        return;
    }

    const orderedPlayers =
        getOrderedLobbyPlayers();

    if (orderedPlayers.length < 2) {
        alert(
            "Mindestens 2 Spieler erforderlich."
        );

        return;
    }

    const cardsPerPlayer =
        Number(cardsPerPlayerInput.value);

    const maxCardsPerPlayer =
        Math.floor(
            80 / orderedPlayers.length
        );

    if (
        !Number.isInteger(cardsPerPlayer) ||
        cardsPerPlayer < 1 ||
        cardsPerPlayer > maxCardsPerPlayer
    ) {
        alert(
            `Bei ${orderedPlayers.length} Spielern sind ` +
            `1 bis ${maxCardsPerPlayer} Karten erlaubt.`
        );

        return;
    }

    const deck = createDeck();
    shuffle(deck);

    const previousRoundNumber =
        gameState?.roundNumber ?? 0;

    const roundNumber =
        previousRoundNumber + 1;

    const playerOrder =
        orderedPlayers.map(
            player => player.id
        );

    const startingPlayerIndex =
        (roundNumber - 1) %
        playerOrder.length;

    const startingPlayerId =
        playerOrder[startingPlayerIndex];

    const updates = {};

    for (const player of orderedPlayers) {
        const cards = [];

        for (
            let index = 0;
            index < cardsPerPlayer;
            index++
        ) {
            cards.push(deck.pop());
        }

        updates[
            `games/${activeRoomCode}/hands/${player.id}`
        ] = cardsToObject(cards);

        const previousScore =
            gameScores[player.id]?.score ?? 0;

        updates[
            `games/${activeRoomCode}/scores/${player.id}`
        ] = {
            name: player.name,
            tip: 0,
            tipSubmitted: false,
            tricksWon: 0,
            roundPoints: 0,
            score: previousScore,
            cardCount: cardsPerPlayer
        };
    }

    updates[
        `games/${activeRoomCode}/state`
    ] = {
        status: "tips",
        roundNumber,
        cardsPerPlayer,
        playerOrder,
        startingPlayerId,
        currentPlayerId: startingPlayerId,
        leadColor: null,
        currentTrick: [],
        lastWinnerId: null,
        roundWillEnd: false
    };

    updates[
        `games/${activeRoomCode}/meta/status`
    ] = "running";

    updates[
        `games/${activeRoomCode}/tipRequests`
    ] = null;

    updates[
        `games/${activeRoomCode}/playRequests`
    ] = null;

    await update(
        ref(database),
        updates
    );
}


async function submitTip() {
    if (
        !activeRoomCode ||
        !gameState ||
        gameState.status !== "tips"
    ) {
        return;
    }

    const tip = Number(tipInput.value);

    if (
        !Number.isInteger(tip) ||
        tip < 0 ||
        tip > gameState.cardsPerPlayer
    ) {
        alert(
            `Erlaubt sind ganze Zahlen von 0 bis ` +
            `${gameState.cardsPerPlayer}.`
        );

        return;
    }

    submitTipButton.disabled = true;

    try {
        await set(
            ref(
                database,
                `games/${activeRoomCode}/tipRequests/${currentUser.uid}`
            ),
            {
                tip,
                createdAt: Date.now()
            }
        );

        tipStatus.textContent =
            "Tipp wurde gesendet.";

    } catch (error) {
        console.error(error);

        alert(
            `Tipp konnte nicht gesendet werden: ${error.message}`
        );

        submitTipButton.disabled = false;
    }
}


async function processTipRequests() {
    if (
        processingTips ||
        !isHost() ||
        !activeRoomCode
    ) {
        return;
    }

    processingTips = true;

    try {
        const [
            stateSnapshot,
            scoresSnapshot,
            requestsSnapshot
        ] = await Promise.all([
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/state`
                )
            ),
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/scores`
                )
            ),
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/tipRequests`
                )
            )
        ]);

        const state = stateSnapshot.val();
        const scores =
            scoresSnapshot.val() ?? {};
        const requests =
            requestsSnapshot.val() ?? {};

        if (
            !state ||
            state.status !== "tips"
        ) {
            return;
        }

        const updates = {};
        let changed = false;

        for (
            const playerId of state.playerOrder
        ) {
            const request =
                requests[playerId];

            const score =
                scores[playerId];

            if (
                !request ||
                !score ||
                score.tipSubmitted
            ) {
                continue;
            }

            const tip = Number(request.tip);

            if (
                !Number.isInteger(tip) ||
                tip < 0 ||
                tip > state.cardsPerPlayer
            ) {
                updates[
                    `games/${activeRoomCode}/tipRequests/${playerId}`
                ] = null;

                changed = true;
                continue;
            }

            scores[playerId] = {
                ...score,
                tip,
                tipSubmitted: true
            };

            updates[
                `games/${activeRoomCode}/scores/${playerId}/tip`
            ] = tip;

            updates[
                `games/${activeRoomCode}/scores/${playerId}/tipSubmitted`
            ] = true;

            updates[
                `games/${activeRoomCode}/tipRequests/${playerId}`
            ] = null;

            changed = true;
        }

        const allTipsSubmitted =
            state.playerOrder.every(
                playerId =>
                    scores[playerId]?.tipSubmitted
            );

        if (allTipsSubmitted) {
            updates[
                `games/${activeRoomCode}/state/status`
            ] = "playing";

            changed = true;
        }

        if (changed) {
            await update(
                ref(database),
                updates
            );
        }

    } catch (error) {
        console.error(
            "Fehler beim Verarbeiten der Tipps:",
            error
        );

    } finally {
        processingTips = false;
    }
}


async function requestPlayCard(cardId) {
    if (
        !activeRoomCode ||
        !gameState ||
        gameState.status !== "playing" ||
        gameState.currentPlayerId !==
            currentUser.uid ||
        playRequestPending
    ) {
        return;
    }

    const cards =
        objectToCards(ownHand);

    const selectedCard =
        ownHand[cardId];

    if (!selectedCard) {
        return;
    }

    if (
        !canPlayCard(
            cards,
            selectedCard,
            gameState.leadColor
        )
    ) {
        alert(
            `Du musst ${gameState.leadColor} bedienen.`
        );

        return;
    }

    playRequestPending = true;
    renderHand();

    try {
        await set(
            ref(
                database,
                `games/${activeRoomCode}/playRequests/${currentUser.uid}`
            ),
            {
                cardId,
                createdAt: Date.now()
            }
        );

    } catch (error) {
        console.error(error);

        playRequestPending = false;
        renderHand();

        alert(
            `Karte konnte nicht gespielt werden: ${error.message}`
        );
    }
}


async function processPlayRequests() {
    if (
        processingPlay ||
        !isHost() ||
        !activeRoomCode
    ) {
        return;
    }

    processingPlay = true;

    try {
        const [
            stateSnapshot,
            scoresSnapshot,
            requestsSnapshot
        ] = await Promise.all([
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/state`
                )
            ),
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/scores`
                )
            ),
            get(
                ref(
                    database,
                    `games/${activeRoomCode}/playRequests`
                )
            )
        ]);

        const state = stateSnapshot.val();
        const scores =
            scoresSnapshot.val() ?? {};
        const requests =
            requestsSnapshot.val() ?? {};

        if (
            !state ||
            state.status !== "playing"
        ) {
            return;
        }

        const playerId =
            state.currentPlayerId;

        const request =
            requests[playerId];

        if (!request) {
            return;
        }

        const handSnapshot = await get(
            ref(
                database,
                `games/${activeRoomCode}/hands/${playerId}`
            )
        );

        const hand =
            handSnapshot.val() ?? {};

        const selectedCard =
            hand[request.cardId];

        if (!selectedCard) {
            await remove(
                ref(
                    database,
                    `games/${activeRoomCode}/playRequests/${playerId}`
                )
            );

            return;
        }

        const handCards =
            objectToCards(hand);

        if (
            !canPlayCard(
                handCards,
                selectedCard,
                state.leadColor
            )
        ) {
            await remove(
                ref(
                    database,
                    `games/${activeRoomCode}/playRequests/${playerId}`
                )
            );

            return;
        }

        const newLeadColor =
            state.leadColor ??
            selectedCard.color;

        const currentTrick =
            Array.isArray(state.currentTrick)
                ? [...state.currentTrick]
                : [];

        currentTrick.push({
            playerId,
            card: selectedCard
        });

        delete hand[request.cardId];

        const updatedScores = {
            ...scores,

            [playerId]: {
                ...scores[playerId],
                cardCount:
                    Math.max(
                        0,
                        (scores[playerId]?.cardCount ?? 1) - 1
                    )
            }
        };

        const updates = {
            [`games/${activeRoomCode}/hands/${playerId}`]:
                Object.keys(hand).length > 0
                    ? hand
                    : null,

            [`games/${activeRoomCode}/scores/${playerId}/cardCount`]:
                updatedScores[playerId].cardCount,

            [`games/${activeRoomCode}/state/leadColor`]:
                newLeadColor,

            [`games/${activeRoomCode}/state/currentTrick`]:
                currentTrick,

            [`games/${activeRoomCode}/playRequests/${playerId}`]:
                null
        };

        if (
            currentTrick.length ===
            state.playerOrder.length
        ) {
            const winnerId =
                determineTrickWinner(
                    currentTrick,
                    newLeadColor
                );

            const winnerTricks =
                (updatedScores[winnerId]?.tricksWon ?? 0) +
                1;

            updatedScores[winnerId] = {
                ...updatedScores[winnerId],
                tricksWon: winnerTricks
            };

            const roundWillEnd =
                state.playerOrder.every(
                    id =>
                        (updatedScores[id]?.cardCount ?? 0) ===
                        0
                );

            updates[
                `games/${activeRoomCode}/scores/${winnerId}/tricksWon`
            ] = winnerTricks;

            updates[
                `games/${activeRoomCode}/state/status`
            ] = "trickResult";

            updates[
                `games/${activeRoomCode}/state/currentPlayerId`
            ] = winnerId;

            updates[
                `games/${activeRoomCode}/state/lastWinnerId`
            ] = winnerId;

            updates[
                `games/${activeRoomCode}/state/roundWillEnd`
            ] = roundWillEnd;

        } else {
            updates[
                `games/${activeRoomCode}/state/currentPlayerId`
            ] = getNextPlayerId(
                state.playerOrder,
                playerId
            );
        }

        await update(
            ref(database),
            updates
        );

    } catch (error) {
        console.error(
            "Fehler beim Verarbeiten einer Karte:",
            error
        );

    } finally {
        processingPlay = false;
    }
}


async function continueAfterTrick() {
    if (
        !isHost() ||
        !gameState ||
        gameState.status !== "trickResult"
    ) {
        return;
    }

    if (gameState.roundWillEnd) {
        await finishRound();
        return;
    }

    await update(
        ref(
            database,
            `games/${activeRoomCode}/state`
        ),
        {
            status: "playing",
            currentPlayerId:
                gameState.lastWinnerId,
            leadColor: null,
            currentTrick: [],
            roundWillEnd: false
        }
    );
}


async function finishRound() {
    const scoresSnapshot = await get(
        ref(
            database,
            `games/${activeRoomCode}/scores`
        )
    );

    const scores =
        scoresSnapshot.val() ?? {};

    const updates = {};

    for (
        const playerId of gameState.playerOrder
    ) {
        const playerScore =
            scores[playerId];

        const roundPoints =
            calculateRoundPoints(
                playerScore.tip,
                playerScore.tricksWon
            );

        updates[
            `games/${activeRoomCode}/scores/${playerId}/roundPoints`
        ] = roundPoints;

        updates[
            `games/${activeRoomCode}/scores/${playerId}/score`
        ] =
            (playerScore.score ?? 0) +
            roundPoints;
    }

    updates[
        `games/${activeRoomCode}/state/status`
    ] = "roundResult";

    updates[
        `games/${activeRoomCode}/state/leadColor`
    ] = null;

    updates[
        `games/${activeRoomCode}/state/currentTrick`
    ] = [];

    updates[
        `games/${activeRoomCode}/state/roundWillEnd`
    ] = false;

    await update(
        ref(database),
        updates
    );
}


async function finishGame() {
    if (
        !isHost() ||
        !activeRoomCode
    ) {
        return;
    }

    await update(
        ref(database),
        {
            [`games/${activeRoomCode}/meta/status`]:
                "finished",

            [`games/${activeRoomCode}/state/status`]:
                "gameFinished"
        }
    );
}


async function deleteRoom() {
    if (
        !isHost() ||
        !activeRoomCode
    ) {
        return;
    }

    const confirmed = window.confirm(
        "Soll der gesamte Spielraum gelöscht werden?"
    );

    if (!confirmed) {
        return;
    }

    await remove(
        ref(
            database,
            `games/${activeRoomCode}`
        )
    );
}


function renderAll() {
    renderLobby();
    renderHostControls();
    renderMessage();
    renderTips();
    renderTrick();
    renderHand();
    renderScoreboard();
}


function renderLobby() {
    onlinePlayerList.innerHTML = "";

    const orderedPlayers =
        getOrderedLobbyPlayers();

    for (const player of orderedPlayers) {
        const listItem =
            document.createElement("li");

        let label = player.name;

        if (
            roomMeta &&
            player.id === roomMeta.hostId
        ) {
            label += " (Spielleiter)";
        }

        if (
            currentUser &&
            player.id === currentUser.uid
        ) {
            label += " (Du)";
        }

        listItem.textContent = label;
        onlinePlayerList.appendChild(listItem);
    }
}


function renderHostControls() {
    const host = isHost();

    hostPanel.hidden = !host;

    if (!host) {
        return;
    }

    const status =
        gameState?.status ?? "lobby";

    startRoundButton.hidden =
        ![
            "lobby",
            "roundResult",
            "gameFinished"
        ].includes(status);

    startRoundButton.textContent =
        status === "lobby"
            ? "Runde starten"
            : "Nächste Runde starten";

    nextTrickButton.hidden =
        status !== "trickResult";

    finishGameButton.hidden =
        status !== "roundResult";

    cardsPerPlayerInput.disabled =
        ![
            "lobby",
            "roundResult",
            "gameFinished"
        ].includes(status);
}


function renderMessage() {
    if (!activeRoomCode) {
        setMessage(
            "Status",
            "Noch mit keinem Spielraum verbunden."
        );

        return;
    }

    if (!gameState) {
        setMessage(
            "Lobby",
            "Der Spielleiter kann die erste Runde starten."
        );

        return;
    }

    const currentPlayerName =
        gameScores[
            gameState.currentPlayerId
        ]?.name ?? "Unbekannt";

    const winnerName =
        gameScores[
            gameState.lastWinnerId
        ]?.name ?? "Unbekannt";

    switch (gameState.status) {
        case "tips":
            setMessage(
                `Runde ${gameState.roundNumber}`,
                "Alle Spieler müssen ihren Tipp abgeben."
            );
            break;

        case "playing":
            setMessage(
                `Runde ${gameState.roundNumber}`,
                `${currentPlayerName} ist am Zug.`
            );
            break;

        case "trickResult":
            setMessage(
                "Stich beendet",
                `${winnerName} hat den Stich gewonnen.`
            );
            break;

        case "roundResult":
            setMessage(
                `Runde ${gameState.roundNumber} beendet`,
                "Die Rundenpunkte wurden berechnet."
            );
            break;

        case "gameFinished": {
            const scores =
                Object.values(gameScores);

            if (scores.length === 0) {
                setMessage(
                    "Spiel beendet",
                    "Das Spiel wurde beendet."
                );

                break;
            }

            const highestScore =
                Math.max(
                    ...scores.map(
                        player => player.score ?? 0
                    )
                );

            const winners =
                scores
                    .filter(
                        player =>
                            (player.score ?? 0) ===
                            highestScore
                    )
                    .map(player => player.name)
                    .join(", ");

            setMessage(
                "Spiel beendet",
                `Gewinner: ${winners} mit ${highestScore} Punkten.`
            );

            break;
        }

        default:
            setMessage(
                "Status",
                "Der Spielzustand wird geladen."
            );
    }
}


function renderTips() {
    const ownScore =
        gameScores[currentUser?.uid];

    const showTips =
        gameState?.status === "tips";

    tipsArea.hidden = !showTips;

    if (!showTips) {
        return;
    }

    tipInput.max =
        String(gameState.cardsPerPlayer);

    const alreadySubmitted =
        Boolean(ownScore?.tipSubmitted);

    tipInput.disabled =
        alreadySubmitted;

    submitTipButton.disabled =
        alreadySubmitted;

    if (alreadySubmitted) {
        tipInput.value =
            String(ownScore.tip);

        tipStatus.textContent =
            "Dein Tipp wurde gespeichert.";
    } else {
        tipStatus.textContent =
            "Dein Tipp fehlt noch.";
    }
}


function renderTrick() {
    let html =
        "<h2>Aktueller Stich</h2>";

    const trick =
        Array.isArray(
            gameState?.currentTrick
        )
            ? gameState.currentTrick
            : [];

    if (gameState?.leadColor) {
        html += `
            <p>
                Stichfarbe:
                <b>${escapeHtml(gameState.leadColor)}</b>
            </p>
        `;
    }

    if (trick.length === 0) {
        html += `
            <p>
                Noch keine Karte in diesem Stich.
            </p>
        `;
    }

    for (const entry of trick) {
        const playerName =
            gameScores[entry.playerId]?.name ??
            "Unbekannt";

        html += `
            <p>
                ${escapeHtml(playerName)}:
                <b>
                    ${escapeHtml(entry.card.color)}
                    ${entry.card.value}
                </b>
            </p>
        `;
    }

    trickArea.innerHTML = html;
}


function renderHand() {
    let html =
        "<h2>Deine Hand</h2>";

    const cards =
        objectToCards(ownHand);

    if (!gameState) {
        html += `
            <p>
                Noch keine Runde gestartet.
            </p>
        `;

        gameArea.innerHTML = html;
        return;
    }

    if (cards.length === 0) {
        html += `
            <p>
                Du hast keine Karten mehr.
            </p>
        `;

        gameArea.innerHTML = html;
        return;
    }

    const ownTurn =
        gameState.status === "playing" &&
        gameState.currentPlayerId ===
            currentUser.uid;

    for (const card of cards) {
        const legal =
            canPlayCard(
                cards,
                card,
                gameState.leadColor
            );

        const disabled =
            !ownTurn ||
            !legal ||
            playRequestPending;

        let title = "";

        if (!ownTurn) {
            title =
                "Du bist nicht am Zug.";
        } else if (!legal) {
            title =
                `Du musst ${gameState.leadColor} bedienen.`;
        }

        html += `
            <button
                type="button"
                class="card card-${card.color.toLowerCase()}"
                data-card-id="${escapeHtml(card.id)}"
                ${disabled ? "disabled" : ""}
                title="${escapeHtml(title)}">
                ${escapeHtml(card.color)}
                ${card.value}
            </button>
        `;
    }

    gameArea.innerHTML = html;

    gameArea
        .querySelectorAll("[data-card-id]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    requestPlayCard(
                        button.dataset.cardId
                    );
                }
            );
        });
}


function renderScoreboard() {
    const scores =
        Object.entries(gameScores);

    if (scores.length === 0) {
        scoreboard.innerHTML = `
            <h2>Punktestand</h2>
            <p>
                Noch keine Spielergebnisse vorhanden.
            </p>
        `;

        return;
    }

    let html = `
        <h2>Punktestand</h2>

        <table>
            <tr>
                <th>Spieler</th>
                <th>Tipp</th>
                <th>Stiche</th>
                <th>Rundenpunkte</th>
                <th>Gesamt</th>
            </tr>
    `;

    const orderedIds =
        gameState?.playerOrder ??
        scores.map(([playerId]) => playerId);

    for (const playerId of orderedIds) {
        const player =
            gameScores[playerId];

        if (!player) {
            continue;
        }

        html += `
            <tr>
                <td>${escapeHtml(player.name)}</td>
                <td>
                    ${player.tipSubmitted ? player.tip : "–"}
                </td>
                <td>${player.tricksWon ?? 0}</td>
                <td>${player.roundPoints ?? 0}</td>
                <td>${player.score ?? 0}</td>
            </tr>
        `;
    }

    html += "</table>";

    scoreboard.innerHTML = html;
}


async function restoreSavedRoom() {
    const savedRoomCode =
        sessionStorage.getItem(
            "kartenspielRoomCode"
        );

    const savedPlayerName =
        sessionStorage.getItem(
            "kartenspielPlayerName"
        );

    if (
        !savedRoomCode ||
        !savedPlayerName
    ) {
        return;
    }

    onlinePlayerNameInput.value =
        savedPlayerName;

    roomCodeInput.value =
        savedRoomCode;

    try {
        const metaSnapshot = await get(
            ref(
                database,
                `games/${savedRoomCode}/meta`
            )
        );

        if (!metaSnapshot.exists()) {
            sessionStorage.removeItem(
                "kartenspielRoomCode"
            );

            return;
        }

        const stateSnapshot = await get(
            ref(
                database,
                `games/${savedRoomCode}/state`
            )
        );

        const state =
            stateSnapshot.val();

        const mayRestore =
            metaSnapshot.val().status === "lobby" ||
            (
                Array.isArray(state?.playerOrder) &&
                state.playerOrder.includes(
                    currentUser.uid
                )
            );

        if (!mayRestore) {
            return;
        }

        await set(
            ref(
                database,
                `games/${savedRoomCode}/lobbyPlayers/${currentUser.uid}`
            ),
            {
                name: savedPlayerName,
                joinedAt: Date.now()
            }
        );

        await enterRoom(savedRoomCode);

    } catch (error) {
        console.error(
            "Spielraum konnte nicht wiederhergestellt werden:",
            error
        );
    }
}


createRoomButton.addEventListener(
    "click",
    createRoom
);

joinRoomButton.addEventListener(
    "click",
    joinRoom
);

startRoundButton.addEventListener(
    "click",
    startRound
);

nextTrickButton.addEventListener(
    "click",
    continueAfterTrick
);

finishGameButton.addEventListener(
    "click",
    finishGame
);

deleteRoomButton.addEventListener(
    "click",
    deleteRoom
);

submitTipButton.addEventListener(
    "click",
    submitTip
);

roomCodeInput.addEventListener(
    "input",
    event => {
        event.target.value =
            cleanRoomCode(event.target.value);
    }
);

roomCodeInput.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            joinRoom();
        }
    }
);

onlinePlayerNameInput.addEventListener(
    "keydown",
    event => {
        if (event.key !== "Enter") {
            return;
        }

        if (
            roomCodeInput.value.trim() === ""
        ) {
            createRoom();
        } else {
            joinRoom();
        }
    }
);


onAuthStateChanged(
    auth,
    async user => {
        if (user) {
            currentUser = user;

            setFirebaseStatus(
                "Firebase verbunden. Du kannst ein Spiel erstellen oder beitreten."
            );

            createRoomButton.disabled = false;
            joinRoomButton.disabled = false;

            await restoreSavedRoom();
            return;
        }

        try {
            setFirebaseStatus(
                "Anonyme Anmeldung läuft …"
            );

            createRoomButton.disabled = true;
            joinRoomButton.disabled = true;

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setFirebaseStatus(
                `Anonyme Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);