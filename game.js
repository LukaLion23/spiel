import {
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    onValue,
    ref,
    remove,
    set,
    update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import {
    auth,
    calculateRoundPoints,
    canPlayCard,
    clearRoomSession,
    database,
    determineTrickWinner,
    escapeHtml,
    getNextPlayerId,
    getRoomCodeFromUrl,
    objectToCards,
    redirectToStatus,
    saveRoomSession
} from "./firebase-common.js?v=51";


let currentUser = null;
let roomCode = null;
let roomMeta = null;
let gameState = null;
let gameScores = {};
let ownHand = {};

let stopPlayRequestsListener = null;
let processingPlay = false;
let playRequestPending = false;

let scheduledTrickNumber = null;
let resultRoundNumber = null;
let resultInterval = null;
let resultTransitionTimer = null;


const pageError =
    document.getElementById("pageError");

const roundNumberElement =
    document.getElementById("roundNumber");

const currentPlayerElement =
    document.getElementById("currentPlayer");

const trickPanel =
    document.getElementById("trickPanel");

const playerOverview =
    document.getElementById("playerOverview");

const trickArea =
    document.getElementById("trickArea");

const trickWinner =
    document.getElementById("trickWinner");

const handHint =
    document.getElementById("handHint");

const handArea =
    document.getElementById("handArea");

const resultOverlay =
    document.getElementById("resultOverlay");

const resultTip =
    document.getElementById("resultTip");

const resultTricks =
    document.getElementById("resultTricks");

const resultPoints =
    document.getElementById("resultPoints");

const resultTotal =
    document.getElementById("resultTotal");

const resultCountdown =
    document.getElementById("resultCountdown");


function showError(message) {
    pageError.hidden = false;
    pageError.textContent = message;
}


function isHost() {
    return Boolean(
        currentUser &&
        roomMeta &&
        roomMeta.hostId === currentUser.uid
    );
}


async function initializePage() {
    roomCode =
        getRoomCodeFromUrl();

    if (roomCode.length !== 6) {
        showError(
            "Kein Spielraum gefunden."
        );
        return;
    }

    const [
        metaSnapshot,
        playerSnapshot
    ] = await Promise.all([
        get(
            ref(
                database,
                `games/${roomCode}/meta`
            )
        ),
        get(
            ref(
                database,
                `games/${roomCode}/lobbyPlayers/${currentUser.uid}`
            )
        )
    ]);

    if (
        !metaSnapshot.exists() ||
        !playerSnapshot.exists()
    ) {
        showError(
            "Du gehörst nicht zu diesem Spiel."
        );
        return;
    }

    saveRoomSession(
        roomCode,
        playerSnapshot.val().name
    );

    attachListeners();
}


function attachListeners() {
    onValue(
        ref(
            database,
            `games/${roomCode}/meta`
        ),
        snapshot => {
            if (!snapshot.exists()) {
                clearRoomSession();

                window.location.replace(
                    "./index.html"
                );
                return;
            }

            roomMeta =
                snapshot.val();

            if (
                ![
                    "playing",
                    "trickResult",
                    "roundResult"
                ].includes(roomMeta.status)
            ) {
                redirectToStatus(
                    roomMeta.status,
                    roomCode,
                    "./game.html"
                );
                return;
            }

            attachHostListener();
            renderPage();
        },
        error => {
            showError(error.message);
        }
    );

    onValue(
        ref(
            database,
            `games/${roomCode}/state`
        ),
        snapshot => {
            gameState =
                snapshot.val();

            playRequestPending = false;

            renderPage();
            scheduleHostActions();
        }
    );

    onValue(
        ref(
            database,
            `games/${roomCode}/scores`
        ),
        snapshot => {
            gameScores =
                snapshot.val() ?? {};

            renderPage();
        }
    );

    onValue(
        ref(
            database,
            `games/${roomCode}/hands/${currentUser.uid}`
        ),
        snapshot => {
            ownHand =
                snapshot.val() ?? {};

            playRequestPending = false;

            renderHand();
        }
    );
}


function attachHostListener() {
    if (!isHost()) {
        if (stopPlayRequestsListener) {
            stopPlayRequestsListener();
            stopPlayRequestsListener = null;
        }
        return;
    }

    if (stopPlayRequestsListener) {
        return;
    }

    stopPlayRequestsListener = onValue(
        ref(
            database,
            `games/${roomCode}/playRequests`
        ),
        () => {
            processPlayRequests();
        }
    );
}


function renderPage() {
    if (!gameState) {
        return;
    }

    roundNumberElement.textContent =
        String(gameState.roundNumber ?? "–");

    currentPlayerElement.textContent =
        gameScores[
            gameState.currentPlayerId
        ]?.name ?? "–";

    renderPlayerOverview();
    renderTrick();
    renderHand();

    if (
        gameState.status ===
        "roundResult"
    ) {
        showResultOverlay();
    }
}


function renderPlayerOverview() {
    const order =
        gameState?.playerOrder ??
        Object.keys(gameScores);

    let html = `
        <div class="player-overview-grid">
    `;

    for (const playerId of order) {
        const player =
            gameScores[playerId];

        if (!player) {
            continue;
        }

        const current =
            playerId ===
            gameState.currentPlayerId &&
            gameState.status === "playing";

        html += `
            <article class="player-stat ${current ? "is-current" : ""}">
                <h3>${escapeHtml(player.name)}</h3>

                <div>
                    <span>Tipp</span>
                    <strong>${player.tip ?? 0}</strong>
                </div>

                <div>
                    <span>Stiche</span>
                    <strong>${player.tricksWon ?? 0}</strong>
                </div>

            </article>
        `;
    }

    html += "</div>";

    playerOverview.innerHTML = html;
}


function renderTrick() {
    const colorClassMap = {
        Rot: "trick-color-rot",
        Blau: "trick-color-blau",
        "Grün": "trick-color-gruen",
        Gelb: "trick-color-gelb"
    };

    trickPanel.classList.remove(
        "trick-color-rot",
        "trick-color-blau",
        "trick-color-gruen",
        "trick-color-gelb"
    );

    const activeColorClass =
        colorClassMap[
            gameState?.leadColor
        ];

    if (activeColorClass) {
        trickPanel.classList.add(
            activeColorClass
        );
    }

    const trick =
        Array.isArray(
            gameState?.currentTrick
        )
            ? gameState.currentTrick
            : [];

    if (trick.length === 0) {
        trickArea.innerHTML =
            "<p>Noch keine Karte gespielt.</p>";
    } else {
        trickArea.innerHTML =
            trick.map(entry => {
                const playerName =
                    gameScores[
                        entry.playerId
                    ]?.name ?? "Unbekannt";

                return `
                    <div class="played-card-wrap">
                        <span>
                            ${escapeHtml(playerName)}
                        </span>

                        <div
                            class="card display-card card-${entry.card.color.toLowerCase()}"
                            role="img"
                            aria-label="${escapeHtml(entry.card.color)} ${entry.card.value}"
                            title="${escapeHtml(entry.card.color)} ${entry.card.value}">

                            <strong>${entry.card.value}</strong>

                        </div>
                    </div>
                `;
            }).join("");
    }

    if (
        gameState.status ===
        "trickResult"
    ) {
        const winnerName =
            gameScores[
                gameState.lastWinnerId
            ]?.name ?? "Unbekannt";

        trickWinner.textContent =
            `${winnerName} gewinnt den Stich.`;
    } else {
        trickWinner.textContent = "";
    }
}


function renderHand() {
    if (!currentUser || !gameState) {
        return;
    }

    const cards =
        objectToCards(ownHand);

    const ownTurn =
        gameState.status === "playing" &&
        gameState.currentPlayerId ===
            currentUser.uid;

    handHint.textContent =
        ownTurn
            ? "Du bist am Zug. Wähle eine Karte."
            : gameState.status ===
                "trickResult"
                ? "Der Stich wird ausgewertet."
                : "Warte, bis du am Zug bist.";

    if (cards.length === 0) {
        handArea.innerHTML =
            "<p>Du hast keine Karten mehr.</p>";
        return;
    }

    handArea.innerHTML =
        cards.map(card => {
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

            let title =
                `${card.color} ${card.value}`;

            if (!ownTurn) {
                title +=
                    " – Du bist nicht am Zug.";
            } else if (!legal) {
                title +=
                    ` – Du musst ${gameState.leadColor} bedienen.`;
            }

            return `
                <button
                    type="button"
                    class="card card-${card.color.toLowerCase()}"
                    data-card-id="${escapeHtml(card.id)}"
                    aria-label="${escapeHtml(card.color)} ${card.value}"
                    ${disabled ? "disabled" : ""}
                    title="${escapeHtml(title)}">

                    <strong>${card.value}</strong>

                </button>
            `;
        }).join("");

    handArea
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


async function requestPlayCard(cardId) {
    if (
        gameState?.status !== "playing" ||
        gameState.currentPlayerId !==
            currentUser.uid ||
        playRequestPending
    ) {
        return;
    }

    const selectedCard =
        ownHand[cardId];

    const cards =
        objectToCards(ownHand);

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
                `games/${roomCode}/playRequests/${currentUser.uid}`
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
                    `games/${roomCode}/state`
                )
            ),
            get(
                ref(
                    database,
                    `games/${roomCode}/scores`
                )
            ),
            get(
                ref(
                    database,
                    `games/${roomCode}/playRequests`
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

        const handSnapshot =
            await get(
                ref(
                    database,
                    `games/${roomCode}/hands/${playerId}`
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
                    `games/${roomCode}/playRequests/${playerId}`
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
                    `games/${roomCode}/playRequests/${playerId}`
                )
            );
            return;
        }

        const leadColor =
            state.leadColor ??
            selectedCard.color;

        const trick =
            Array.isArray(
                state.currentTrick
            )
                ? [...state.currentTrick]
                : [];

        trick.push({
            playerId,
            card: selectedCard
        });

        delete hand[request.cardId];

        const newCardCount =
            Math.max(
                0,
                (
                    scores[playerId]
                        ?.cardCount ??
                    1
                ) - 1
            );

        const updates = {
            [`games/${roomCode}/hands/${playerId}`]:
                Object.keys(hand).length
                    ? hand
                    : null,

            [`games/${roomCode}/scores/${playerId}/cardCount`]:
                newCardCount,

            [`games/${roomCode}/state/leadColor`]:
                leadColor,

            [`games/${roomCode}/state/currentTrick`]:
                trick,

            [`games/${roomCode}/playRequests/${playerId}`]:
                null
        };

        if (
            trick.length ===
            state.playerOrder.length
        ) {
            const winnerId =
                determineTrickWinner(
                    trick,
                    leadColor
                );

            const winnerTricks =
                (
                    scores[winnerId]
                        ?.tricksWon ??
                    0
                ) + 1;

            const cardCounts = {
                ...Object.fromEntries(
                    state.playerOrder.map(id => [
                        id,
                        scores[id]?.cardCount ?? 0
                    ])
                ),

                [playerId]:
                    newCardCount
            };

            const roundWillEnd =
                state.playerOrder.every(
                    id =>
                        cardCounts[id] === 0
                );

            updates[
                `games/${roomCode}/scores/${winnerId}/tricksWon`
            ] = winnerTricks;

            updates[
                `games/${roomCode}/state/status`
            ] = "trickResult";

            updates[
                `games/${roomCode}/meta/status`
            ] = "trickResult";

            updates[
                `games/${roomCode}/state/currentPlayerId`
            ] = winnerId;

            updates[
                `games/${roomCode}/state/lastWinnerId`
            ] = winnerId;

            updates[
                `games/${roomCode}/state/roundWillEnd`
            ] = roundWillEnd;

        } else {
            updates[
                `games/${roomCode}/state/currentPlayerId`
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
            "Spielzug konnte nicht verarbeitet werden:",
            error
        );

    } finally {
        processingPlay = false;
    }
}


function scheduleHostActions() {
    if (
        !isHost() ||
        !gameState
    ) {
        return;
    }

    if (
        gameState.status ===
        "trickResult" &&
        scheduledTrickNumber !==
            gameState.trickNumber
    ) {
        scheduledTrickNumber =
            gameState.trickNumber;

        window.setTimeout(
            advanceAfterTrick,
            2500
        );
    }
}


async function advanceAfterTrick() {
    const stateSnapshot =
        await get(
            ref(
                database,
                `games/${roomCode}/state`
            )
        );

    const state =
        stateSnapshot.val();

    if (
        !state ||
        state.status !== "trickResult"
    ) {
        return;
    }

    if (state.roundWillEnd) {
        await finishRound(state);
        return;
    }

    await update(
        ref(database),
        {
            [`games/${roomCode}/state/status`]:
                "playing",

            [`games/${roomCode}/meta/status`]:
                "playing",

            [`games/${roomCode}/state/currentPlayerId`]:
                state.lastWinnerId,

            [`games/${roomCode}/state/leadColor`]:
                null,

            [`games/${roomCode}/state/currentTrick`]:
                [],

            [`games/${roomCode}/state/roundWillEnd`]:
                false,

            [`games/${roomCode}/state/trickNumber`]:
                (state.trickNumber ?? 1) + 1
        }
    );
}


async function finishRound(state) {
    const scoresSnapshot =
        await get(
            ref(
                database,
                `games/${roomCode}/scores`
            )
        );

    const scores =
        scoresSnapshot.val() ?? {};

    const updates = {};

    for (
        const playerId of
        state.playerOrder
    ) {
        const player =
            scores[playerId];

        const roundPoints =
            calculateRoundPoints(
                player.tip,
                player.tricksWon
            );

        updates[
            `games/${roomCode}/scores/${playerId}/roundPoints`
        ] = roundPoints;

        updates[
            `games/${roomCode}/scores/${playerId}/score`
        ] =
            (player.score ?? 0) +
            roundPoints;
    }

    updates[
        `games/${roomCode}/state/status`
    ] = "roundResult";

    updates[
        `games/${roomCode}/meta/status`
    ] = "roundResult";

    updates[
        `games/${roomCode}/state/leadColor`
    ] = null;

    updates[
        `games/${roomCode}/state/currentTrick`
    ] = [];

    updates[
        `games/${roomCode}/state/roundWillEnd`
    ] = false;

    await update(
        ref(database),
        updates
    );
}


function showResultOverlay() {
    const ownScore =
        gameScores[currentUser.uid];

    if (!ownScore) {
        return;
    }

    /*
     * Werte immer aktualisieren, auch wenn der Score-Listener
     * nach dem State-Listener ausgelöst wurde.
     */
    resultTip.textContent =
        String(ownScore.tip ?? 0);

    resultTricks.textContent =
        String(
            ownScore.tricksWon ?? 0
        );

    resultPoints.textContent =
        String(
            ownScore.roundPoints ?? 0
        );

    resultTotal.textContent =
        String(
            ownScore.score ?? 0
        );

    resultOverlay.hidden = false;

    if (
        resultRoundNumber ===
        gameState.roundNumber
    ) {
        return;
    }

    resultRoundNumber =
        gameState.roundNumber;

    let seconds = 7;

    resultCountdown.textContent =
        String(seconds);

    if (resultInterval) {
        window.clearInterval(
            resultInterval
        );
    }

    resultInterval =
        window.setInterval(
            () => {
                seconds--;

                resultCountdown.textContent =
                    String(
                        Math.max(
                            0,
                            seconds
                        )
                    );

                if (seconds <= 0) {
                    window.clearInterval(
                        resultInterval
                    );

                    resultInterval = null;
                }
            },
            1000
        );

    if (
        isHost() &&
        !resultTransitionTimer
    ) {
        resultTransitionTimer =
            window.setTimeout(
                moveToNextRoundSetup,
                7000
            );
    }
}


async function moveToNextRoundSetup() {
    resultTransitionTimer = null;

    const stateSnapshot =
        await get(
            ref(
                database,
                `games/${roomCode}/state`
            )
        );

    const state =
        stateSnapshot.val();

    if (
        !state ||
        state.status !== "roundResult"
    ) {
        return;
    }

    await update(
        ref(database),
        {
            [`games/${roomCode}/meta/status`]:
                "roundSetup",

            [`games/${roomCode}/state/status`]:
                "roundSetup",

            [`games/${roomCode}/state/currentPlayerId`]:
                null,

            [`games/${roomCode}/state/currentTipPlayerId`]:
                null,

            [`games/${roomCode}/state/currentTrick`]:
                [],

            [`games/${roomCode}/hands`]:
                null,

            [`games/${roomCode}/tipRequests`]:
                null,

            [`games/${roomCode}/playRequests`]:
                null
        }
    );
}


onAuthStateChanged(
    auth,
    async user => {
        if (user) {
            currentUser = user;

            try {
                await initializePage();
            } catch (error) {
                console.error(error);

                showError(
                    `Spiel konnte nicht geladen werden: ${error.message}`
                );
            }

            return;
        }

        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error(error);

            showError(
                `Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);
