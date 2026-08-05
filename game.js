/*
 * Eigentliche Spielseite.
 *
 * Der Raumcode wird aus game.html?room=ABC123 gelesen.
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
    onValue,
    ref,
    remove,
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


const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

const playerDisplay =
    document.getElementById("playerDisplay");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const hostPanel =
    document.getElementById("hostPanel");

const nextRoundSettings =
    document.getElementById("nextRoundSettings");

const cardsPerPlayerInput =
    document.getElementById("cardsPerPlayer");

const nextTrickButton =
    document.getElementById("nextTrickButton");

const nextRoundButton =
    document.getElementById("nextRoundButton");

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

const backButton =
    document.getElementById("backButton");


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


function setFirebaseStatus(message) {
    firebaseStatus.textContent = message;
}


function setMessage(title, message) {
    messageArea.innerHTML = `
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
    `;
}


function cleanRoomCode(value) {
    return String(value)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}


function getRoomCode() {
    const parameters =
        new URLSearchParams(
            window.location.search
        );

    const queryCode =
        cleanRoomCode(
            parameters.get("room") ?? ""
        );

    if (queryCode.length === 6) {
        return queryCode;
    }

    return cleanRoomCode(
        sessionStorage.getItem(
            "kartenspielRoomCode"
        ) ?? ""
    );
}


function isHost() {
    return Boolean(
        currentUser &&
        roomMeta &&
        roomMeta.hostId === currentUser.uid
    );
}


function getOrderedPlayers() {
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


function cardsToObject(cards) {
    const result = {};

    for (const card of cards) {
        result[card.id] = card;
    }

    return result;
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
    return sortCards(
        Object.values(
            handObject ?? {}
        )
    );
}


function canPlayCard(
    handCards,
    card,
    leadColor
) {
    if (!leadColor) {
        return true;
    }

    const hasLeadColor =
        handCards.some(
            handCard =>
                handCard.color === leadColor
        );

    if (!hasLeadColor) {
        return true;
    }

    return card.color === leadColor;
}


function determineTrickWinner(
    trick,
    leadColor
) {
    const trumpCards =
        trick.filter(
            entry =>
                entry.card.color ===
                TRUMP_COLOR
        );

    const relevantCards =
        trumpCards.length > 0
            ? trumpCards
            : trick.filter(
                entry =>
                    entry.card.color ===
                    leadColor
            );

    return relevantCards.reduce(
        (highest, current) =>
            current.card.value >
            highest.card.value
                ? current
                : highest
    ).playerId;
}


function calculateRoundPoints(
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


function getNextPlayerId(
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


async function loadGame() {
    activeRoomCode =
        getRoomCode();

    if (activeRoomCode.length !== 6) {
        setFirebaseStatus(
            "Kein gültiger Spielcode gefunden."
        );

        setMessage(
            "Kein Spielraum",
            "Öffne das Spiel über die Eintrittsseite."
        );

        return;
    }

    const [
        metaSnapshot,
        playerSnapshot,
        stateSnapshot
    ] = await Promise.all([
        get(
            ref(
                database,
                `games/${activeRoomCode}/meta`
            )
        ),
        get(
            ref(
                database,
                `games/${activeRoomCode}/lobbyPlayers/${currentUser.uid}`
            )
        ),
        get(
            ref(
                database,
                `games/${activeRoomCode}/state`
            )
        )
    ]);

    if (!metaSnapshot.exists()) {
        setFirebaseStatus(
            "Der Spielraum existiert nicht."
        );

        return;
    }

    if (!playerSnapshot.exists()) {
        setFirebaseStatus(
            "Du gehörst nicht zu diesem Spielraum."
        );

        setMessage(
            "Kein Zutritt",
            "Tritt dem Raum zuerst über die Eintrittsseite bei."
        );

        return;
    }

    const meta =
        metaSnapshot.val();

    if (meta.status === "lobby") {
        window.location.replace(
            "./index.html"
        );

        return;
    }

    const state =
        stateSnapshot.val();

    if (
        !state ||
        !Array.isArray(state.playerOrder) ||
        !state.playerOrder.includes(
            currentUser.uid
        )
    ) {
        setFirebaseStatus(
            "Du bist kein Teilnehmer dieser Runde."
        );

        return;
    }

    sessionStorage.setItem(
        "kartenspielRoomCode",
        activeRoomCode
    );

    activeRoomCodeElement.innerHTML = `
        Spielcode:
        <strong>${escapeHtml(activeRoomCode)}</strong>
    `;

    playerDisplay.textContent =
        `Du spielst als ${playerSnapshot.val().name}.`;

    setFirebaseStatus(
        "Mit dem Spiel verbunden."
    );

    attachListeners();
}


function attachListeners() {
    stopMetaListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/meta`
        ),
        snapshot => {
            if (!snapshot.exists()) {
                setFirebaseStatus(
                    "Der Spielraum wurde gelöscht."
                );

                stopAllListeners();
                return;
            }

            roomMeta =
                snapshot.val();

            if (
                roomMeta.status === "lobby"
            ) {
                window.location.replace(
                    "./index.html"
                );

                return;
            }

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

            if (
                gameState?.cardsPerPlayer
            ) {
                cardsPerPlayerInput.value =
                    String(
                        gameState.cardsPerPlayer
                    );
            }

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
    if (!isHost()) {
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


function stopAllListeners() {
    const listeners = [
        stopMetaListener,
        stopPlayersListener,
        stopStateListener,
        stopScoresListener,
        stopHandListener
    ];

    for (const stopListener of listeners) {
        if (stopListener) {
            stopListener();
        }
    }

    stopMetaListener = null;
    stopPlayersListener = null;
    stopStateListener = null;
    stopScoresListener = null;
    stopHandListener = null;

    stopHostRequestListeners();
}


async function submitTip() {
    if (
        !gameState ||
        gameState.status !== "tips"
    ) {
        return;
    }

    const tip =
        Number(tipInput.value);

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
        !isHost()
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

        const state =
            stateSnapshot.val();

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
            const playerId of
            state.playerOrder
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

            const tip =
                Number(request.tip);

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
                    scores[playerId]
                        ?.tipSubmitted
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
            "Tipps konnten nicht verarbeitet werden:",
            error
        );

    } finally {
        processingTips = false;
    }
}


async function requestPlayCard(cardId) {
    if (
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
        !isHost()
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

        const state =
            stateSnapshot.val();

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
            Array.isArray(
                state.currentTrick
            )
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
                        (
                            scores[playerId]
                                ?.cardCount ??
                            1
                        ) - 1
                    )
            }
        };

        const updates = {
            [`games/${activeRoomCode}/hands/${playerId}`]:
                Object.keys(hand).length > 0
                    ? hand
                    : null,

            [`games/${activeRoomCode}/scores/${playerId}/cardCount`]:
                updatedScores[playerId]
                    .cardCount,

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
                (
                    updatedScores[winnerId]
                        ?.tricksWon ??
                    0
                ) + 1;

            updatedScores[winnerId] = {
                ...updatedScores[winnerId],
                tricksWon: winnerTricks
            };

            const roundWillEnd =
                state.playerOrder.every(
                    id =>
                        (
                            updatedScores[id]
                                ?.cardCount ??
                            0
                        ) === 0
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
            "Karte konnte nicht verarbeitet werden:",
            error
        );

    } finally {
        processingPlay = false;
    }
}


async function continueAfterTrick() {
    if (
        !isHost() ||
        gameState?.status !==
            "trickResult"
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
        const playerId of
        gameState.playerOrder
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


async function startNextRound() {
    if (
        !isHost() ||
        gameState?.status !==
            "roundResult"
    ) {
        return;
    }

    const players =
        getOrderedPlayers();

    const cardsPerPlayer =
        Number(
            cardsPerPlayerInput.value
        );

    const maxCards =
        Math.floor(
            80 / players.length
        );

    if (
        !Number.isInteger(cardsPerPlayer) ||
        cardsPerPlayer < 1 ||
        cardsPerPlayer > maxCards
    ) {
        alert(
            `Erlaubt sind 1 bis ${maxCards} Karten.`
        );

        return;
    }

    const deck = createDeck();
    shuffle(deck);

    const playerOrder =
        players.map(player => player.id);

    const roundNumber =
        (gameState.roundNumber ?? 0) + 1;

    const startingPlayerId =
        playerOrder[
            (roundNumber - 1) %
            playerOrder.length
        ];

    const updates = {};

    for (const player of players) {
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

        updates[
            `games/${activeRoomCode}/scores/${player.id}`
        ] = {
            name: player.name,
            tip: 0,
            tipSubmitted: false,
            tricksWon: 0,
            roundPoints: 0,
            score:
                gameScores[player.id]
                    ?.score ??
                0,
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
        currentPlayerId:
            startingPlayerId,
        currentTrick: [],
        lastWinnerId: null,
        roundWillEnd: false
    };

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


async function finishGame() {
    if (!isHost()) {
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
    if (!isHost()) {
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
    renderHostControls();
    renderMessage();
    renderTips();
    renderTrick();
    renderHand();
    renderScoreboard();
}


function renderHostControls() {
    const host =
        isHost();

    hostPanel.hidden =
        !host;

    if (!host) {
        return;
    }

    const status =
        gameState?.status;

    nextTrickButton.hidden =
        status !== "trickResult";

    nextRoundButton.hidden =
        status !== "roundResult";

    finishGameButton.hidden =
        status !== "roundResult";

    nextRoundSettings.hidden =
        status !== "roundResult";

    const playerCount =
        gameState?.playerOrder?.length ??
        getOrderedPlayers().length;

    if (playerCount > 0) {
        cardsPerPlayerInput.max =
            String(
                Math.floor(
                    80 / playerCount
                )
            );
    }
}


function renderMessage() {
    if (!gameState) {
        setMessage(
            "Status",
            "Spielzustand wird geladen …"
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
                        player =>
                            player.score ??
                            0
                    )
                );

            const winners =
                scores
                    .filter(
                        player =>
                            (
                                player.score ??
                                0
                            ) === highestScore
                    )
                    .map(
                        player =>
                            player.name
                    )
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
                "Spielzustand wird geladen …"
            );
    }
}


function renderTips() {
    const ownScore =
        gameScores[
            currentUser?.uid
        ];

    const showTips =
        gameState?.status === "tips";

    tipsArea.hidden =
        !showTips;

    if (!showTips) {
        return;
    }

    tipInput.max =
        String(
            gameState.cardsPerPlayer
        );

    const submitted =
        Boolean(
            ownScore?.tipSubmitted
        );

    tipInput.disabled =
        submitted;

    submitTipButton.disabled =
        submitted;

    if (submitted) {
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
            gameScores[
                entry.playerId
            ]?.name ?? "Unbekannt";

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

    trickArea.innerHTML =
        html;
}


function renderHand() {
    let html =
        "<h2>Deine Hand</h2>";

    const cards =
        objectToCards(ownHand);

    if (cards.length === 0) {
        html += `
            <p>
                Du hast keine Karten mehr.
            </p>
        `;

        gameArea.innerHTML =
            html;

        return;
    }

    const ownTurn =
        gameState?.status ===
            "playing" &&
        gameState.currentPlayerId ===
            currentUser.uid;

    for (const card of cards) {
        const legal =
            canPlayCard(
                cards,
                card,
                gameState?.leadColor
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

    gameArea.innerHTML =
        html;

    gameArea
        .querySelectorAll(
            "[data-card-id]"
        )
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
    const entries =
        Object.entries(gameScores);

    if (entries.length === 0) {
        scoreboard.innerHTML = `
            <h2>Punktestand</h2>
            <p>
                Punktestand wird geladen …
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
        entries.map(
            ([playerId]) =>
                playerId
        );

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

    scoreboard.innerHTML =
        html;
}


submitTipButton.addEventListener(
    "click",
    submitTip
);

nextTrickButton.addEventListener(
    "click",
    continueAfterTrick
);

nextRoundButton.addEventListener(
    "click",
    startNextRound
);

finishGameButton.addEventListener(
    "click",
    finishGame
);

deleteRoomButton.addEventListener(
    "click",
    deleteRoom
);

backButton.addEventListener(
    "click",
    () => {
        window.location.href =
            "./index.html";
    }
);


onAuthStateChanged(
    auth,
    async user => {
        if (user) {
            currentUser = user;

            try {
                await loadGame();
            } catch (error) {
                console.error(error);

                setFirebaseStatus(
                    `Spiel konnte nicht geladen werden: ${error.message}`
                );
            }

            return;
        }

        try {
            setFirebaseStatus(
                "Anonyme Anmeldung läuft …"
            );

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setFirebaseStatus(
                `Anonyme Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);