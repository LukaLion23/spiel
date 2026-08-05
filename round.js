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
    createDeck,
    escapeHtml,
    getRoomCodeFromUrl,
    orderedPlayers,
    redirectToStatus,
    saveRoomSession,
    shuffle
} from "./firebase-common.js?v=40";


let currentUser = null;
let roomCode = null;
let roomMeta = null;
let roomPlayers = {};
let gameState = null;
let gameScores = {};


const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

const firebaseStatus =
    document.getElementById("firebaseStatus");

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
        firebaseStatus.textContent =
            "Kein gültiger Spielraum gefunden.";
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
        firebaseStatus.textContent =
            "Du gehörst nicht zu diesem Spielraum.";
        return;
    }

    saveRoomSession(
        roomCode,
        playerSnapshot.val().name
    );

    activeRoomCodeElement.innerHTML = `
        Spielcode:
        <strong>${escapeHtml(roomCode)}</strong>
    `;

    firebaseStatus.textContent =
        "Mit dem Spiel verbunden.";

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
                firebaseStatus.textContent =
                    "Der Spielraum wurde gelöscht.";
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

            if (
                gameState?.cardsPerPlayer
            ) {
                cardsPerPlayerInput.value =
                    String(
                        gameState.cardsPerPlayer
                    );
            }

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
        finalResultPanel.hidden = false;

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

    const maximumCards =
        players.length > 0
            ? Math.floor(
                80 / players.length
            )
            : 1;

    cardsPerPlayerInput.max =
        String(maximumCards);

    if (
        Number(cardsPerPlayerInput.value) >
        maximumCards
    ) {
        cardsPerPlayerInput.value =
            String(maximumCards);
    }

    cardLimitInfo.textContent =
        `Bei ${players.length} Spielern sind höchstens ` +
        `${maximumCards} Karten pro Spieler möglich.`;

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
                <th>Tipp</th>
                <th>Stiche</th>
                <th>Rundenpunkte</th>
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
                <td>${score.tip ?? 0}</td>
                <td>${score.tricksWon ?? 0}</td>
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
        finalResult.textContent =
            "Es gibt noch keine Ergebnisse.";
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
        <p class="winner-text">
            Gewinner:
            <strong>${escapeHtml(winners)}</strong>
            mit ${highestScore} Punkten
        </p>

        <ol class="ranking-list">
    `;

    for (const player of sortedScores) {
        html += `
            <li>
                <span>${escapeHtml(player.name)}</span>
                <strong>${player.score ?? 0} Punkte</strong>
            </li>
        `;
    }

    html += "</ol>";

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
                `games/${roomCode}/hands/${player.id}`
            ] = cardsToObject(cards);

            updates[
                `games/${roomCode}/scores/${player.id}`
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
            "Soll das gesamte Spiel beendet werden?"
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


startRoundButton.addEventListener(
    "click",
    startRound
);

finishGameButton.addEventListener(
    "click",
    finishGame
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

                firebaseStatus.textContent =
                    `Seite konnte nicht geladen werden: ${error.message}`;
            }

            return;
        }

        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error(error);

            firebaseStatus.textContent =
                `Anmeldung fehlgeschlagen: ${error.message}`;
        }
    }
);
