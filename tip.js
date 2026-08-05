import {
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    onValue,
    ref,
    set,
    update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import {
    auth,
    database,
    escapeHtml,
    getRoomCodeFromUrl,
    objectToCards,
    redirectToStatus,
    saveRoomSession
} from "./firebase-common.js?v=40";


let currentUser = null;
let roomCode = null;
let roomMeta = null;
let gameState = null;
let gameScores = {};
let ownHand = {};

let stopTipRequestsListener = null;
let processingTips = false;


const roundTitle =
    document.getElementById("roundTitle");

const playerDisplay =
    document.getElementById("playerDisplay");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const tipInput =
    document.getElementById("tipInput");

const submitTipButton =
    document.getElementById("submitTipButton");

const tipStatus =
    document.getElementById("tipStatus");

const handArea =
    document.getElementById("handArea");

const tipProgress =
    document.getElementById("tipProgress");


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
            "Kein Spielraum gefunden.";
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
            "Du gehörst nicht zu diesem Spiel.";
        return;
    }

    saveRoomSession(
        roomCode,
        playerSnapshot.val().name
    );

    playerDisplay.textContent =
        `Du spielst als ${playerSnapshot.val().name}.`;

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

            if (roomMeta.status !== "tips") {
                redirectToStatus(
                    roomMeta.status,
                    roomCode,
                    "./tip.html"
                );
                return;
            }

            attachHostListener();
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

            if (gameState) {
                roundTitle.textContent =
                    `Runde ${gameState.roundNumber}: Tipp abgeben`;

                tipInput.max =
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

    onValue(
        ref(
            database,
            `games/${roomCode}/hands/${currentUser.uid}`
        ),
        snapshot => {
            ownHand =
                snapshot.val() ?? {};

            renderHand();
        }
    );
}


function attachHostListener() {
    if (!isHost()) {
        if (stopTipRequestsListener) {
            stopTipRequestsListener();
            stopTipRequestsListener = null;
        }
        return;
    }

    if (stopTipRequestsListener) {
        return;
    }

    stopTipRequestsListener = onValue(
        ref(
            database,
            `games/${roomCode}/tipRequests`
        ),
        () => {
            processTipRequests();
        }
    );
}


function renderPage() {
    if (!currentUser || !gameState) {
        return;
    }

    const ownScore =
        gameScores[currentUser.uid];

    const submitted =
        Boolean(
            ownScore?.tipSubmitted
        );

    tipInput.disabled = submitted;
    submitTipButton.disabled = submitted;

    if (submitted) {
        tipInput.value =
            String(ownScore.tip);

        tipStatus.textContent =
            "Dein Tipp wurde gespeichert. Warte auf die anderen Spieler.";
    } else {
        tipStatus.textContent =
            `Erlaubt sind 0 bis ${gameState.cardsPerPlayer} Stiche.`;
    }

    const scores =
        Object.values(gameScores);

    const submittedCount =
        scores.filter(
            score =>
                score.tipSubmitted
        ).length;

    tipProgress.innerHTML = `
        <div class="progress-row">
            <span>
                ${submittedCount} von ${scores.length}
                Spielern haben ihren Tipp abgegeben.
            </span>

            <progress
                max="${scores.length}"
                value="${submittedCount}">
            </progress>
        </div>
    `;

    firebaseStatus.textContent =
        submitted
            ? "Tipp gespeichert."
            : "Wähle deinen Tipp anhand deiner Karten.";
}


function renderHand() {
    const cards =
        objectToCards(ownHand);

    if (cards.length === 0) {
        handArea.innerHTML =
            "<p>Keine Karten vorhanden.</p>";
        return;
    }

    handArea.innerHTML =
        cards.map(card => `
            <div
                class="card display-card card-${card.color.toLowerCase()}">
                <span>${escapeHtml(card.color)}</span>
                <strong>${card.value}</strong>
            </div>
        `).join("");
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
            `Bitte gib eine ganze Zahl von 0 bis ` +
            `${gameState.cardsPerPlayer} ein.`
        );
        return;
    }

    submitTipButton.disabled = true;

    try {
        await set(
            ref(
                database,
                `games/${roomCode}/tipRequests/${currentUser.uid}`
            ),
            {
                tip,
                createdAt: Date.now()
            }
        );

        tipStatus.textContent =
            "Tipp wird gespeichert …";

    } catch (error) {
        console.error(error);

        alert(
            `Tipp konnte nicht gespeichert werden: ${error.message}`
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
                    `games/${roomCode}/tipRequests`
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
                tip >
                    state.cardsPerPlayer
            ) {
                updates[
                    `games/${roomCode}/tipRequests/${playerId}`
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
                `games/${roomCode}/scores/${playerId}/tip`
            ] = tip;

            updates[
                `games/${roomCode}/scores/${playerId}/tipSubmitted`
            ] = true;

            updates[
                `games/${roomCode}/tipRequests/${playerId}`
            ] = null;

            changed = true;
        }

        const allSubmitted =
            state.playerOrder.every(
                playerId =>
                    scores[playerId]
                        ?.tipSubmitted
            );

        if (allSubmitted) {
            updates[
                `games/${roomCode}/state/status`
            ] = "playing";

            updates[
                `games/${roomCode}/meta/status`
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


submitTipButton.addEventListener(
    "click",
    submitTip
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
