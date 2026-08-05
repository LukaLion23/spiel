import {
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    onValue,
    ref,
    remove,
    update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import {
    auth,
    database,
    cardsToObject,
    clearRoomSession,
    createDeck,
    escapeHtml,
    getRoomCodeFromUrl,
    orderedPlayers,
    redirectToStatus,
    rotateOrder,
    saveRoomSession,
    shuffle
} from "./firebase-common.js?v=53";


let currentUser = null;
let roomCode = null;
let roomMeta = null;
let roomPlayers = {};
let gameState = null;
let gameScores = {};


const pageError =
    document.getElementById("pageError");

const hostSetup =
    document.getElementById("hostSetup");

const playerWaiting =
    document.getElementById("playerWaiting");

const roundTitle =
    document.getElementById("roundTitle");

const cardsPerPlayerInput =
    document.getElementById("cardsPerPlayer");

const cardLimitInfo =
    document.getElementById("cardLimitInfo");

const startRoundButton =
    document.getElementById("startRoundButton");

const finishGameButton =
    document.getElementById("finishGameButton");

const lastRoundPanel =
    document.getElementById("lastRoundPanel");

const lastRoundScores =
    document.getElementById("lastRoundScores");

const finalResultPanel =
    document.getElementById("finalResultPanel");

const finalResult =
    document.getElementById("finalResult");

const finalHostActions =
    document.getElementById("finalHostActions");

const finalPlayerWaiting =
    document.getElementById("finalPlayerWaiting");

const newGameButton =
    document.getElementById("newGameButton");

const endRoomButton =
    document.getElementById("endRoomButton");


const CARD_COUNT_STORAGE_KEY =
    "kartenspielCardsPerPlayer";


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


function initializeSavedCardCount() {
    if (
        cardsPerPlayerInput.dataset
            .savedValueLoaded === "true"
    ) {
        return;
    }

    const roomValue =
        Number(
            roomMeta?.lastCardsPerPlayer
        );

    const browserValue =
        Number(
            localStorage.getItem(
                CARD_COUNT_STORAGE_KEY
            )
        );

    let savedValue = 5;

    if (
        Number.isInteger(roomValue) &&
        roomValue >= 1
    ) {
        savedValue = roomValue;
    } else if (
        Number.isInteger(browserValue) &&
        browserValue >= 1
    ) {
        savedValue = browserValue;
    }

    cardsPerPlayerInput.value =
        String(savedValue);

    cardsPerPlayerInput.dataset
        .savedValueLoaded = "true";
}


function saveCardCountLocally() {
    const value =
        Number(
            cardsPerPlayerInput.value
        );

    if (
        Number.isInteger(value) &&
        value >= 1
    ) {
        localStorage.setItem(
            CARD_COUNT_STORAGE_KEY,
            String(value)
        );
    }
}


async function initializePage() {
    roomCode =
        getRoomCodeFromUrl();

    if (roomCode.length !== 6) {
        showError(
            "Kein gültiger Spielraum gefunden."
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
            "Du gehörst nicht zu diesem Spielraum."
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
                    "roundSetup",
                    "gameFinished"
                ].includes(roomMeta.status)
            ) {
                redirectToStatus(
                    roomMeta.status,
                    roomCode,
                    "./round.html"
                );
                return;
            }

            renderPage();
        },
        error => {
            showError(error.message);
        }
    );

    onValue(
        ref(
            database,
            `games/${roomCode}/lobbyPlayers`
        ),
        snapshot => {
            roomPlayers =
                snapshot.val() ?? {};

            renderPage();
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

            renderPage();
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
}


function renderPage() {
    if (!roomMeta) {
        return;
    }

    const host = isHost();

    if (
        roomMeta.status ===
        "gameFinished"
    ) {
        hostSetup.hidden = true;
        playerWaiting.hidden = true;
        lastRoundPanel.hidden = true;

        finalResultPanel.hidden = false;
        finalHostActions.hidden = !host;
        finalPlayerWaiting.hidden = host;

        renderFinalResult();
        return;
    }

    finalResultPanel.hidden = true;

    hostSetup.hidden = !host;
    playerWaiting.hidden = host;

    const players =
        orderedPlayers(roomPlayers);

    const nextRound =
        (gameState?.roundNumber ?? 0) + 1;

    roundTitle.textContent =
        `Runde ${nextRound} vorbereiten`;

    initializeSavedCardCount();

    if (players.length > 0) {
        const maximumCards =
            Math.floor(
                80 / players.length
            );

        cardsPerPlayerInput.max =
            String(maximumCards);

        const currentValue =
            Number(
                cardsPerPlayerInput.value
            );

        if (
            !Number.isInteger(currentValue) ||
            currentValue < 1
        ) {
            cardsPerPlayerInput.value =
                "1";
        } else if (
            currentValue > maximumCards
        ) {
            cardsPerPlayerInput.value =
                String(maximumCards);
        }

        saveCardCountLocally();

        cardLimitInfo.textContent =
            `Bei ${players.length} Spielern sind höchstens ` +
            `${maximumCards} Karten pro Spieler möglich.`;
    } else {
        cardLimitInfo.textContent =
            "Spieler werden geladen …";
    }

    const hasPreviousRound =
        Boolean(
            gameState?.roundNumber &&
            Object.keys(gameScores).length > 0
        );

    lastRoundPanel.hidden =
        !hasPreviousRound;

    if (hasPreviousRound) {
        renderLastRound();
    }
}


function renderLastRound() {
    const order =
        gameState?.playerOrder ??
        Object.keys(gameScores);

    let html = `
        <table>
            <tr>
                <th>Spieler</th>
                <th>Letzte Runde</th>
                <th>Gesamt</th>
            </tr>
    `;

    for (const playerId of order) {
        const score =
            gameScores[playerId];

        if (!score) {
            continue;
        }

        html += `
            <tr>
                <td>${escapeHtml(score.name)}</td>
                <td>${score.roundPoints ?? 0}</td>
                <td>${score.score ?? 0}</td>
            </tr>
        `;
    }

    html += "</table>";

    lastRoundScores.innerHTML = html;
}


function renderFinalResult() {
    const scores =
        Object.values(gameScores);

    if (scores.length === 0) {
        finalResult.innerHTML =
            "<p>Es gibt noch keine Ergebnisse.</p>";
        return;
    }

    const sortedScores =
        [...scores].sort(
            (playerA, playerB) =>
                (playerB.score ?? 0) -
                (playerA.score ?? 0)
        );

    const highestScore =
        sortedScores[0].score ?? 0;

    const winners =
        sortedScores
            .filter(
                player =>
                    (player.score ?? 0) ===
                    highestScore
            )
            .map(player => player.name)
            .join(", ");

    let html = `
        <div class="winner-card">
            <span>Gewinner</span>
            <strong>${escapeHtml(winners)}</strong>
            <small>${highestScore} Punkte</small>
        </div>

        <div class="final-ranking">
    `;

    sortedScores.forEach(
        (player, index) => {
            html += `
                <div class="final-rank-row">
                    <span class="rank-number">
                        ${index + 1}
                    </span>

                    <span class="rank-name">
                        ${escapeHtml(player.name)}
                    </span>

                    <strong class="rank-points">
                        ${player.score ?? 0}
                        Punkte
                    </strong>
                </div>
            `;
        }
    );

    html += "</div>";

    finalResult.innerHTML = html;
}


async function startRound() {
    if (!isHost()) {
        return;
    }

    const players =
        orderedPlayers(roomPlayers);

    if (players.length < 2) {
        alert(
            "Mindestens 2 Spieler erforderlich."
        );
        return;
    }

    const cardsPerPlayer =
        Number(
            cardsPerPlayerInput.value
        );

    const maximumCards =
        Math.floor(
            80 / players.length
        );

    if (
        !Number.isInteger(cardsPerPlayer) ||
        cardsPerPlayer < 1 ||
        cardsPerPlayer > maximumCards
    ) {
        alert(
            `Bitte gib eine ganze Zahl von 1 bis ${maximumCards} ein.`
        );
        return;
    }

    saveCardCountLocally();

    startRoundButton.disabled = true;
    startRoundButton.textContent =
        "Karten werden ausgeteilt …";

    try {
        const deck = createDeck();
        shuffle(deck);

        const previousRoundNumber =
            gameState?.roundNumber ?? 0;

        const roundNumber =
            previousRoundNumber + 1;

        const playerOrder =
            players.map(
                player => player.id
            );

        /*
         * In jeder neuen Runde beginnt der nächste Spieler.
         */
        const startingPlayerId =
            playerOrder[
                (roundNumber - 1) %
                playerOrder.length
            ];

        const tipOrder =
            rotateOrder(
                playerOrder,
                startingPlayerId
            );

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
                `games/${roomCode}/hands/${player.id}`
            ] = cardsToObject(cards);

            updates[
                `games/${roomCode}/scores/${player.id}`
            ] = {
                name: player.name,
                tip: 0,
                tipSubmitted: false,
                tipError: "",
                tricksWon: 0,
                roundPoints: 0,
                score:
                    gameScores[player.id]
                        ?.score ??
                    0,
                cardCount:
                    cardsPerPlayer
            };
        }

        updates[
            `games/${roomCode}/state`
        ] = {
            status: "tips",
            roundNumber,
            cardsPerPlayer,
            playerOrder,
            startingPlayerId,
            tipOrder,
            currentTipPlayerId:
                tipOrder[0],
            currentPlayerId:
                startingPlayerId,
            leadColor: null,
            currentTrick: [],
            trickNumber: 1,
            lastWinnerId: null,
            roundWillEnd: false
        };

        updates[
            `games/${roomCode}/meta/status`
        ] = "tips";

        updates[
            `games/${roomCode}/meta/lastCardsPerPlayer`
        ] = cardsPerPlayer;

        updates[
            `games/${roomCode}/tipRequests`
        ] = null;

        updates[
            `games/${roomCode}/playRequests`
        ] = null;

        await update(
            ref(database),
            updates
        );

    } catch (error) {
        console.error(error);

        alert(
            `Runde konnte nicht gestartet werden: ${error.message}`
        );

        startRoundButton.disabled = false;
        startRoundButton.textContent =
            "Karten austeilen und Tipps starten";
    }
}


async function finishGame() {
    if (!isHost()) {
        return;
    }

    const confirmed =
        window.confirm(
            "Soll das aktuelle Spiel beendet werden?"
        );

    if (!confirmed) {
        return;
    }

    await update(
        ref(database),
        {
            [`games/${roomCode}/meta/status`]:
                "gameFinished",

            [`games/${roomCode}/state/status`]:
                "gameFinished"
        }
    );
}


async function startNewGame() {
    if (!isHost()) {
        return;
    }

    newGameButton.disabled = true;

    try {
        await update(
            ref(database),
            {
                [`games/${roomCode}/meta/status`]:
                    "roundSetup",

                [`games/${roomCode}/state`]:
                    {
                        status:
                            "roundSetup",
                        roundNumber: 0
                    },

                [`games/${roomCode}/scores`]:
                    null,

                [`games/${roomCode}/hands`]:
                    null,

                [`games/${roomCode}/tipRequests`]:
                    null,

                [`games/${roomCode}/playRequests`]:
                    null
            }
        );

    } catch (error) {
        console.error(error);

        alert(
            `Neues Spiel konnte nicht gestartet werden: ${error.message}`
        );

        newGameButton.disabled = false;
    }
}


async function endRoom() {
    if (!isHost()) {
        return;
    }

    const confirmed =
        window.confirm(
            "Soll der Spielraum beendet und gelöscht werden?"
        );

    if (!confirmed) {
        return;
    }

    await remove(
        ref(
            database,
            `games/${roomCode}`
        )
    );

    clearRoomSession();

    window.location.replace(
        "./index.html"
    );
}


cardsPerPlayerInput.addEventListener(
    "input",
    saveCardCountLocally
);


startRoundButton.addEventListener(
    "click",
    startRound
);

finishGameButton.addEventListener(
    "click",
    finishGame
);

newGameButton.addEventListener(
    "click",
    startNewGame
);

endRoomButton.addEventListener(
    "click",
    endRoom
);


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
                    `Seite konnte nicht geladen werden: ${error.message}`
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
