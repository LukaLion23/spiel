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
    clearRoomSession,
    database,
    escapeHtml,
    getCardColorClass,
    getCardImagePath,
    getRoomCodeFromUrl,
    objectToCards,
    redirectToStatus,
    rotateOrder,
    saveRoomSession
} from "./firebase-common.js?v=58";


let currentUser = null;
let roomCode = null;
let roomMeta = null;
let gameState = null;
let gameScores = {};
let ownHand = {};

let stopTipRequestsListener = null;
let processingTips = false;
let tipRequestPending = false;


const pageError =
    document.getElementById("pageError");

const roundTitle =
    document.getElementById("roundTitle");

const playerDisplay =
    document.getElementById("playerDisplay");

const currentTipPlayerElement =
    document.getElementById("currentTipPlayer");

const tipInput =
    document.getElementById("tipInput");

const submitTipButton =
    document.getElementById("submitTipButton");

const tipStatus =
    document.getElementById("tipStatus");

const handArea =
    document.getElementById("handArea");

const tipOverview =
    document.getElementById("tipOverview");


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


function getTipOrder(state = gameState) {
    if (!state) {
        return [];
    }

    if (
        Array.isArray(state.tipOrder) &&
        state.tipOrder.length > 0
    ) {
        return state.tipOrder;
    }

    return rotateOrder(
        state.playerOrder ?? [],
        state.startingPlayerId
    );
}


function getForbiddenLastTip(
    state = gameState,
    scores = gameScores
) {
    if (!state) {
        return null;
    }

    const tipOrder =
        getTipOrder(state);

    const currentTipPlayerId =
        state.currentTipPlayerId;

    if (
        tipOrder.length === 0 ||
        currentTipPlayerId !==
            tipOrder[tipOrder.length - 1]
    ) {
        return null;
    }

    const previousPlayerIds =
        tipOrder.slice(
            0,
            tipOrder.length - 1
        );

    const previousTipSum =
        previousPlayerIds.reduce(
            (sum, playerId) =>
                sum +
                (
                    scores[playerId]
                        ?.tipSubmitted
                        ? Number(
                            scores[playerId].tip
                        )
                        : 0
                ),
            0
        );

    const forbiddenTip =
        state.cardsPerPlayer -
        previousTipSum;

    if (
        forbiddenTip < 0 ||
        forbiddenTip >
            state.cardsPerPlayer
    ) {
        return null;
    }

    return forbiddenTip;
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
                clearRoomSession();

                window.location.replace(
                    "./index.html"
                );
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

            if (
                gameState?.currentTipPlayerId !==
                currentUser.uid
            ) {
                tipRequestPending = false;
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

            const ownScore =
                gameScores[currentUser.uid];

            if (
                ownScore?.tipSubmitted ||
                ownScore?.tipError
            ) {
                tipRequestPending = false;
            }

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
    if (
        !currentUser ||
        !gameState
    ) {
        return;
    }

    roundTitle.textContent =
        `Runde ${gameState.roundNumber}: Tipp abgeben`;

    tipInput.max =
        String(
            gameState.cardsPerPlayer
        );

    const tipOrder =
        getTipOrder();

    const currentTipPlayerId =
        gameState.currentTipPlayerId;

    const currentTipPlayerName =
        gameScores[currentTipPlayerId]
            ?.name ??
        "Unbekannt";

    currentTipPlayerElement.innerHTML = `
        Jetzt tippt:
        <strong>
            ${escapeHtml(currentTipPlayerName)}
        </strong>
    `;

    const ownScore =
        gameScores[currentUser.uid];

    const submitted =
        Boolean(
            ownScore?.tipSubmitted
        );

    const ownTurn =
        currentTipPlayerId ===
        currentUser.uid;

    tipInput.disabled =
        submitted ||
        !ownTurn ||
        tipRequestPending;

    submitTipButton.disabled =
        submitted ||
        !ownTurn ||
        tipRequestPending;

    if (submitted) {
        tipInput.value =
            String(ownScore.tip);

        tipStatus.textContent =
            "Dein Tipp wurde gespeichert.";
    } else if (ownScore?.tipError) {
        tipStatus.textContent =
            ownScore.tipError;
    } else if (!ownTurn) {
        tipStatus.textContent =
            `${currentTipPlayerName} ist mit dem Tipp dran.`;
    } else {
        const forbiddenTip =
            getForbiddenLastTip();

        if (forbiddenTip === null) {
            tipStatus.textContent =
                `Du bist dran. Erlaubt sind 0 bis ` +
                `${gameState.cardsPerPlayer} Stiche.`;
        } else {
            tipStatus.textContent =
                `Du bist als Letzter dran. ` +
                `Du darfst nicht ${forbiddenTip} tippen, ` +
                `weil die Summe aller Tipps sonst genau ` +
                `${gameState.cardsPerPlayer} wäre.`;
        }
    }

    renderTipOverview(
        tipOrder,
        currentTipPlayerId
    );
}


function renderTipOverview(
    tipOrder,
    currentTipPlayerId
) {
    let html =
        '<div class="tip-order-list">';

    tipOrder.forEach(
        (playerId, index) => {
            const player =
                gameScores[playerId];

            if (!player) {
                return;
            }

            const isCurrent =
                playerId ===
                currentTipPlayerId;

            const isStarter =
                playerId ===
                gameState.startingPlayerId;

            let result = "wartet";

            if (player.tipSubmitted) {
                result =
                    `${player.tip} Stiche`;
            } else if (isCurrent) {
                result =
                    "tippt jetzt";
            }

            html += `
                <div class="tip-order-row ${isCurrent ? "is-current" : ""}">
                    <span class="tip-position">
                        ${index + 1}
                    </span>

                    <span class="tip-player-name">
                        ${escapeHtml(player.name)}
                        ${isStarter ? '<small>Rundenanfänger</small>' : ""}
                    </span>

                    <strong class="tip-value">
                        ${escapeHtml(result)}
                    </strong>
                </div>
            `;
        }
    );

    html += "</div>";

    tipOverview.innerHTML = html;
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
                class="card display-card ${getCardColorClass(card.color)}"
                role="img"
                aria-label="${escapeHtml(card.color)} ${card.value}"
                title="${escapeHtml(card.color)} ${card.value}">

                <img
                    class="card-color-image"
                    src="${getCardImagePath(card.color)}"
                    alt=""
                    aria-hidden="true"
                    draggable="false">

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

    if (
        gameState.currentTipPlayerId !==
        currentUser.uid
    ) {
        alert(
            "Du bist noch nicht mit deinem Tipp an der Reihe."
        );
        return;
    }

    const tip =
        Number(tipInput.value);

    if (
        !Number.isInteger(tip) ||
        tip < 0 ||
        tip >
            gameState.cardsPerPlayer
    ) {
        alert(
            `Bitte gib eine ganze Zahl von 0 bis ` +
            `${gameState.cardsPerPlayer} ein.`
        );
        return;
    }

    const forbiddenTip =
        getForbiddenLastTip();

    if (
        forbiddenTip !== null &&
        tip === forbiddenTip
    ) {
        alert(
            `Du darfst nicht ${forbiddenTip} tippen. ` +
            `Die Summe aller Tipps wäre sonst genau so hoch ` +
            `wie die Anzahl der Karten.`
        );
        return;
    }

    tipRequestPending = true;
    renderPage();

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

    } catch (error) {
        console.error(error);

        tipRequestPending = false;
        renderPage();

        alert(
            `Tipp konnte nicht gespeichert werden: ${error.message}`
        );
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

        const tipOrder =
            Array.isArray(state.tipOrder)
                ? state.tipOrder
                : rotateOrder(
                    state.playerOrder ?? [],
                    state.startingPlayerId
                );

        const currentPlayerId =
            state.currentTipPlayerId ??
            tipOrder[0];

        const request =
            requests[currentPlayerId];

        const updates = {};

        /*
         * Zu früh gesendete Anfragen anderer Spieler entfernen.
         */
        for (
            const requestPlayerId of
            Object.keys(requests)
        ) {
            if (
                requestPlayerId !==
                currentPlayerId
            ) {
                updates[
                    `games/${roomCode}/tipRequests/${requestPlayerId}`
                ] = null;
            }
        }

        if (!request) {
            if (
                Object.keys(updates).length > 0
            ) {
                await update(
                    ref(database),
                    updates
                );
            }

            return;
        }

        const score =
            scores[currentPlayerId];

        const tip =
            Number(request.tip);

        if (
            !score ||
            score.tipSubmitted ||
            !Number.isInteger(tip) ||
            tip < 0 ||
            tip > state.cardsPerPlayer
        ) {
            updates[
                `games/${roomCode}/tipRequests/${currentPlayerId}`
            ] = null;

            await update(
                ref(database),
                updates
            );

            return;
        }

        const currentIndex =
            tipOrder.indexOf(
                currentPlayerId
            );

        const isLastTip =
            currentIndex ===
            tipOrder.length - 1;

        if (isLastTip) {
            const previousTipSum =
                tipOrder
                    .slice(
                        0,
                        tipOrder.length - 1
                    )
                    .reduce(
                        (sum, playerId) =>
                            sum +
                            (
                                scores[playerId]
                                    ?.tipSubmitted
                                    ? Number(
                                        scores[playerId].tip
                                    )
                                    : 0
                            ),
                        0
                    );

            if (
                previousTipSum + tip ===
                state.cardsPerPlayer
            ) {
                updates[
                    `games/${roomCode}/tipRequests/${currentPlayerId}`
                ] = null;

                updates[
                    `games/${roomCode}/scores/${currentPlayerId}/tipError`
                ] =
                    `Dieser Tipp ist nicht erlaubt. ` +
                    `Die Summe aller Tipps darf nicht genau ` +
                    `${state.cardsPerPlayer} ergeben.`;

                await update(
                    ref(database),
                    updates
                );

                return;
            }
        }

        updates[
            `games/${roomCode}/scores/${currentPlayerId}/tip`
        ] = tip;

        updates[
            `games/${roomCode}/scores/${currentPlayerId}/tipSubmitted`
        ] = true;

        updates[
            `games/${roomCode}/scores/${currentPlayerId}/tipError`
        ] = "";

        updates[
            `games/${roomCode}/tipRequests/${currentPlayerId}`
        ] = null;

        if (isLastTip) {
            updates[
                `games/${roomCode}/state/currentTipPlayerId`
            ] = null;

            updates[
                `games/${roomCode}/state/status`
            ] = "playing";

            updates[
                `games/${roomCode}/meta/status`
            ] = "playing";
        } else {
            updates[
                `games/${roomCode}/state/currentTipPlayerId`
            ] =
                tipOrder[
                    currentIndex + 1
                ];
        }

        await update(
            ref(database),
            updates
        );

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
