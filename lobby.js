/*
 * Eintrittsseite und Warteraum.
 *
 * Die eigentliche Spielseite befindet sich in game.html.
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

const MAX_PLAYERS = 10;


let currentUser = null;
let activeRoomCode = null;
let roomMeta = null;
let roomPlayers = {};

let stopMetaListener = null;
let stopPlayersListener = null;


const entryPanel =
    document.getElementById("entryPanel");

const roomPanel =
    document.getElementById("roomPanel");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const onlinePlayerNameInput =
    document.getElementById("onlinePlayerName");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

const onlinePlayerList =
    document.getElementById("onlinePlayerList");

const lobbyStatus =
    document.getElementById("lobbyStatus");

const hostPanel =
    document.getElementById("hostPanel");

const cardsPerPlayerInput =
    document.getElementById("cardsPerPlayer");

const startGameButton =
    document.getElementById("startGameButton");

const leaveRoomButton =
    document.getElementById("leaveRoomButton");


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


function setStatus(message) {
    firebaseStatus.textContent = message;
}


function setEntryButtonsDisabled(disabled) {
    createRoomButton.disabled = disabled;
    joinRoomButton.disabled = disabled;
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


async function createRoom() {
    const playerName = validatePlayerName();

    if (!playerName || !currentUser) {
        return;
    }

    setEntryButtonsDisabled(true);
    setStatus("Spielraum wird erstellt …");

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

        setStatus(
            `Spielraum konnte nicht erstellt werden: ${error.message}`
        );

    } finally {
        setEntryButtonsDisabled(false);
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

        roomCodeInput.focus();
        return;
    }

    setEntryButtonsDisabled(true);
    setStatus("Spielraum wird gesucht …");

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

        if (meta.status !== "lobby") {
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

        const otherPlayers =
            Object.entries(players)
                .filter(
                    ([playerId]) =>
                        playerId !== currentUser.uid
                )
                .map(([, player]) => player);

        if (otherPlayers.length >= MAX_PLAYERS) {
            alert(
                "In diesem Spielraum sind bereits 10 Spieler."
            );

            return;
        }

        const duplicateName =
            otherPlayers.some(
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

        setStatus(
            `Beitritt fehlgeschlagen: ${error.message}`
        );

    } finally {
        setEntryButtonsDisabled(false);
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

    entryPanel.hidden = true;
    roomPanel.hidden = false;

    activeRoomCodeElement.innerHTML = `
        Spielcode:
        <strong>${escapeHtml(roomCode)}</strong>
    `;

    attachRoomListeners();
}


function attachRoomListeners() {
    stopMetaListener = onValue(
        ref(
            database,
            `games/${activeRoomCode}/meta`
        ),
        snapshot => {
            if (!snapshot.exists()) {
                alert(
                    "Der Spielraum wurde gelöscht."
                );

                resetLobby();
                return;
            }

            roomMeta = snapshot.val();

            renderLobby();

            if (
                roomMeta.status === "running"
            ) {
                openGamePage();
            }
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

            renderLobby();
        }
    );
}


function stopRoomListeners() {
    if (stopMetaListener) {
        stopMetaListener();
        stopMetaListener = null;
    }

    if (stopPlayersListener) {
        stopPlayersListener();
        stopPlayersListener = null;
    }
}


function renderLobby() {
    onlinePlayerList.innerHTML = "";

    const players =
        getOrderedPlayers();

    for (const player of players) {
        const item =
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

        item.textContent = label;
        onlinePlayerList.appendChild(item);
    }

    hostPanel.hidden = !isHost();

    const maxCards =
        players.length > 0
            ? Math.floor(80 / players.length)
            : 1;

    cardsPerPlayerInput.max =
        String(maxCards);

    if (
        Number(cardsPerPlayerInput.value) >
        maxCards
    ) {
        cardsPerPlayerInput.value =
            String(maxCards);
    }

    lobbyStatus.textContent =
        players.length < 2
            ? "Es wird mindestens ein weiterer Spieler benötigt."
            : `${players.length} Spieler sind bereit. Der Spielleiter kann starten.`;
}


async function startGame() {
    if (!isHost() || !activeRoomCode) {
        return;
    }

    const players =
        getOrderedPlayers();

    if (players.length < 2) {
        alert(
            "Mindestens 2 Spieler erforderlich."
        );

        return;
    }

    const cardsPerPlayer =
        Number(cardsPerPlayerInput.value);

    const maxCardsPerPlayer =
        Math.floor(
            80 / players.length
        );

    if (
        !Number.isInteger(cardsPerPlayer) ||
        cardsPerPlayer < 1 ||
        cardsPerPlayer > maxCardsPerPlayer
    ) {
        alert(
            `Bei ${players.length} Spielern sind ` +
            `1 bis ${maxCardsPerPlayer} Karten erlaubt.`
        );

        return;
    }

    startGameButton.disabled = true;
    startGameButton.textContent =
        "Spiel wird gestartet …";

    try {
        const deck = createDeck();
        shuffle(deck);

        const playerOrder =
            players.map(
                player => player.id
            );

        const startingPlayerId =
            playerOrder[0];

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
                score: 0,
                cardCount: cardsPerPlayer
            };
        }

        updates[
            `games/${activeRoomCode}/state`
        ] = {
            status: "tips",
            roundNumber: 1,
            cardsPerPlayer,
            playerOrder,
            startingPlayerId,
            currentPlayerId: startingPlayerId,
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

        /*
         * Der Meta-Listener leitet danach alle Geräte
         * automatisch auf game.html weiter.
         */

    } catch (error) {
        console.error(error);

        alert(
            `Das Spiel konnte nicht gestartet werden: ${error.message}`
        );

        startGameButton.disabled = false;
        startGameButton.textContent =
            "Spiel starten";
    }
}


function openGamePage() {
    if (!activeRoomCode) {
        return;
    }

    window.location.href =
        `./game.html?room=${encodeURIComponent(activeRoomCode)}`;
}


async function leaveRoom() {
    if (
        !activeRoomCode ||
        !currentUser
    ) {
        resetLobby();
        return;
    }

    const host = isHost();

    const confirmed = window.confirm(
        host
            ? "Als Spielleiter löschst du damit den gesamten Raum. Fortfahren?"
            : "Möchtest du den Spielraum verlassen?"
    );

    if (!confirmed) {
        return;
    }

    try {
        if (host) {
            await remove(
                ref(
                    database,
                    `games/${activeRoomCode}`
                )
            );
        } else {
            await remove(
                ref(
                    database,
                    `games/${activeRoomCode}/lobbyPlayers/${currentUser.uid}`
                )
            );
        }

    } catch (error) {
        console.error(error);

        alert(
            `Der Raum konnte nicht verlassen werden: ${error.message}`
        );
    }

    resetLobby();
}


function resetLobby() {
    stopRoomListeners();

    activeRoomCode = null;
    roomMeta = null;
    roomPlayers = {};

    sessionStorage.removeItem(
        "kartenspielRoomCode"
    );

    entryPanel.hidden = false;
    roomPanel.hidden = true;

    onlinePlayerList.innerHTML = "";
    activeRoomCodeElement.textContent = "";

    setStatus(
        "Firebase verbunden. Du kannst ein Spiel erstellen oder beitreten."
    );
}


async function restoreRoom() {
    const savedRoomCode =
        cleanRoomCode(
            sessionStorage.getItem(
                "kartenspielRoomCode"
            ) ?? ""
        );

    const savedPlayerName =
        sessionStorage.getItem(
            "kartenspielPlayerName"
        );

    if (
        savedRoomCode.length !== 6 ||
        !savedPlayerName
    ) {
        return;
    }

    const [
        metaSnapshot,
        playerSnapshot
    ] = await Promise.all([
        get(
            ref(
                database,
                `games/${savedRoomCode}/meta`
            )
        ),
        get(
            ref(
                database,
                `games/${savedRoomCode}/lobbyPlayers/${currentUser.uid}`
            )
        )
    ]);

    if (
        !metaSnapshot.exists() ||
        !playerSnapshot.exists()
    ) {
        sessionStorage.removeItem(
            "kartenspielRoomCode"
        );

        return;
    }

    onlinePlayerNameInput.value =
        savedPlayerName;

    roomCodeInput.value =
        savedRoomCode;

    activeRoomCode =
        savedRoomCode;

    if (
        metaSnapshot.val().status ===
        "running"
    ) {
        openGamePage();
        return;
    }

    await enterRoom(savedRoomCode);
}


createRoomButton.addEventListener(
    "click",
    createRoom
);

joinRoomButton.addEventListener(
    "click",
    joinRoom
);

startGameButton.addEventListener(
    "click",
    startGame
);

leaveRoomButton.addEventListener(
    "click",
    leaveRoom
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

            setStatus(
                "Firebase verbunden. Du kannst ein Spiel erstellen oder beitreten."
            );

            setEntryButtonsDisabled(false);

            try {
                await restoreRoom();
            } catch (error) {
                console.error(error);
            }

            return;
        }

        try {
            setStatus(
                "Anonyme Anmeldung läuft …"
            );

            setEntryButtonsDisabled(true);

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setStatus(
                `Anonyme Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);