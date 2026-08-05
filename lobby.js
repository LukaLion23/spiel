import {
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    onValue,
    ref,
    remove,
    runTransaction,
    set,
    update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import {
    auth,
    database,
    MAX_PLAYERS,
    cleanRoomCode,
    clearRoomSession,
    escapeHtml,
    orderedPlayers,
    redirectToStatus,
    saveRoomSession
} from "./firebase-common.js?v=53";


let currentUser = null;
let activeRoomCode = null;
let roomMeta = null;
let roomPlayers = {};
let availableRooms = {};

let stopMetaListener = null;
let stopPlayersListener = null;
let stopAvailableRoomsListener = null;

let lastPublishedPlayerCount = null;


const entryPanel =
    document.getElementById("entryPanel");

const lobbyPanel =
    document.getElementById("lobbyPanel");

const playerNameInput =
    document.getElementById("playerName");

const roomNameInput =
    document.getElementById("roomName");

const createRoomButton =
    document.getElementById("createRoomButton");

const refreshRoomsButton =
    document.getElementById("refreshRoomsButton");

const availableRoomList =
    document.getElementById("availableRoomList");

const roomListStatus =
    document.getElementById("roomListStatus");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const activeRoomNameElement =
    document.getElementById("activeRoomName");

const playerList =
    document.getElementById("playerList");

const lobbyStatus =
    document.getElementById("lobbyStatus");

const hostControls =
    document.getElementById("hostControls");

const prepareGameButton =
    document.getElementById("prepareGameButton");

const leaveRoomButton =
    document.getElementById("leaveRoomButton");


function setStatus(message) {
    firebaseStatus.textContent = message;
}


function setEntryDisabled(disabled) {
    createRoomButton.disabled = disabled;
    refreshRoomsButton.disabled = disabled;

    availableRoomList
        .querySelectorAll(
            "[data-room-code]"
        )
        .forEach(button => {
            button.disabled = disabled;
        });
}


function getPlayerName() {
    return playerNameInput.value.trim();
}


function getRoomName() {
    return roomNameInput.value.trim();
}


function validatePlayerName() {
    const name = getPlayerName();

    if (!name) {
        alert("Bitte gib deinen Namen ein.");
        playerNameInput.focus();
        return null;
    }

    if (name.length > 30) {
        alert(
            "Der Spielername darf höchstens 30 Zeichen lang sein."
        );
        playerNameInput.focus();
        return null;
    }

    return name;
}


function validateRoomName() {
    const roomName = getRoomName();

    if (!roomName) {
        alert(
            "Bitte gib dem Spielraum einen Namen."
        );
        roomNameInput.focus();
        return null;
    }

    if (roomName.length > 40) {
        alert(
            "Der Raumname darf höchstens 40 Zeichen lang sein."
        );
        roomNameInput.focus();
        return null;
    }

    const duplicateName =
        Object.values(availableRooms)
            .some(room =>
                String(room.roomName)
                    .trim()
                    .toLocaleLowerCase("de-DE") ===
                roomName.toLocaleLowerCase("de-DE")
            );

    if (duplicateName) {
        alert(
            "Ein offener Spielraum verwendet bereits diesen Namen."
        );
        roomNameInput.focus();
        return null;
    }

    return roomName;
}


function generateRoomCode() {
    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let index = 0; index < 6; index++) {
        code += characters[
            Math.floor(
                Math.random() *
                characters.length
            )
        ];
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


function startAvailableRoomsListener() {
    if (stopAvailableRoomsListener) {
        return;
    }

    stopAvailableRoomsListener = onValue(
        ref(
            database,
            "publicRooms"
        ),
        snapshot => {
            availableRooms =
                snapshot.val() ?? {};

            renderAvailableRooms();
        },
        error => {
            console.error(error);

            roomListStatus.hidden = false;
            roomListStatus.textContent =
                `Spielräume konnten nicht geladen werden: ${error.message}`;
        }
    );
}


function renderAvailableRooms() {
    availableRoomList.innerHTML = "";

    const roomEntries =
        Object.entries(availableRooms)
            .filter(
                ([, room]) =>
                    room &&
                    room.roomName &&
                    room.hostId
            )
            .sort(
                ([, roomA], [, roomB]) =>
                    (roomB.createdAt ?? 0) -
                    (roomA.createdAt ?? 0)
            );

    roomListStatus.hidden =
        roomEntries.length > 0;

    if (roomEntries.length === 0) {
        roomListStatus.textContent =
            "Aktuell gibt es keinen offenen Spielraum.";
        return;
    }

    for (const [roomCode, room] of roomEntries) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "room-entry";
        button.dataset.roomCode =
            cleanRoomCode(roomCode);

        const playerCount =
            Number(room.playerCount);

        const playerCountText =
            Number.isInteger(playerCount) &&
            playerCount >= 1
                ? `${playerCount} ${
                    playerCount === 1
                        ? "Spieler"
                        : "Spieler"
                }`
                : "Offen";

        button.innerHTML = `
            <span class="room-entry-main">
                <strong>
                    ${escapeHtml(room.roomName)}
                </strong>

                <small>
                    Spielleiter:
                    ${escapeHtml(room.hostName ?? "Unbekannt")}
                </small>
            </span>

            <span class="room-entry-side">
                <small>
                    ${escapeHtml(playerCountText)}
                </small>

                <span class="join-room-label">
                    Beitreten
                </span>
            </span>
        `;

        availableRoomList.appendChild(
            button
        );
    }
}


async function createRoom() {
    const playerName =
        validatePlayerName();

    const roomName =
        validateRoomName();

    if (
        !playerName ||
        !roomName ||
        !currentUser
    ) {
        return;
    }

    setEntryDisabled(true);
    setStatus("Spielraum wird erstellt …");

    try {
        for (let attempt = 0; attempt < 10; attempt++) {
            const roomCode =
                generateRoomCode();

            const metaReference =
                ref(
                    database,
                    `games/${roomCode}/meta`
                );

            const transaction =
                await runTransaction(
                    metaReference,
                    currentMeta => {
                        if (currentMeta !== null) {
                            return;
                        }

                        return {
                            hostId:
                                currentUser.uid,
                            hostName:
                                playerName,
                            roomName,
                            status:
                                "lobby",
                            createdAt:
                                Date.now()
                        };
                    },
                    {
                        applyLocally: false
                    }
                );

            if (!transaction.committed) {
                continue;
            }

            try {
                await update(
                    ref(database),
                    {
                        [`games/${roomCode}/lobbyPlayers/${currentUser.uid}`]:
                            {
                                name:
                                    playerName,
                                joinedAt:
                                    Date.now()
                            },

                        [`publicRooms/${roomCode}`]:
                            {
                                hostId:
                                    currentUser.uid,
                                hostName:
                                    playerName,
                                roomName,
                                createdAt:
                                    Date.now(),
                                playerCount:
                                    1
                            }
                    }
                );

            } catch (error) {
                await remove(
                    ref(
                        database,
                        `games/${roomCode}`
                    )
                );

                throw error;
            }

            roomNameInput.value = "";

            await enterRoom(
                roomCode,
                playerName,
                roomName
            );

            return;
        }

        throw new Error(
            "Kein freier interner Spielcode gefunden."
        );

    } catch (error) {
        console.error(error);

        setStatus(
            `Raum konnte nicht erstellt werden: ${error.message}`
        );

    } finally {
        setEntryDisabled(false);
    }
}


async function joinRoom(roomCode) {
    const playerName =
        validatePlayerName();

    roomCode =
        cleanRoomCode(roomCode);

    if (
        !playerName ||
        !currentUser ||
        roomCode.length !== 6
    ) {
        return;
    }

    setEntryDisabled(true);
    setStatus("Spielraum wird geöffnet …");

    try {
        const metaSnapshot =
            await get(
                ref(
                    database,
                    `games/${roomCode}/meta`
                )
            );

        if (!metaSnapshot.exists()) {
            alert(
                "Dieser Spielraum existiert nicht mehr."
            );
            return;
        }

        const meta =
            metaSnapshot.val();

        if (meta.status !== "lobby") {
            alert(
                "Dieses Spiel wurde bereits gestartet."
            );
            return;
        }

        const playersSnapshot =
            await get(
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
                        playerId !==
                        currentUser.uid
                )
                .map(([, player]) => player);

        if (
            otherPlayers.length >=
            MAX_PLAYERS
        ) {
            alert(
                "Der Spielraum ist bereits voll."
            );
            return;
        }

        const duplicateName =
            otherPlayers.some(
                player =>
                    String(player.name)
                        .toLocaleLowerCase("de-DE") ===
                    playerName.toLocaleLowerCase("de-DE")
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
                name:
                    playerName,
                joinedAt:
                    players[currentUser.uid]
                        ?.joinedAt ??
                    Date.now()
            }
        );

        await enterRoom(
            roomCode,
            playerName,
            meta.roomName ??
                "Spielraum"
        );

    } catch (error) {
        console.error(error);

        setStatus(
            `Beitritt fehlgeschlagen: ${error.message}`
        );

    } finally {
        setEntryDisabled(false);
    }
}


async function enterRoom(
    roomCode,
    playerName,
    roomName
) {
    stopRoomListeners();

    activeRoomCode = roomCode;
    lastPublishedPlayerCount = null;

    saveRoomSession(
        roomCode,
        playerName
    );

    entryPanel.hidden = true;
    lobbyPanel.hidden = false;

    activeRoomNameElement.innerHTML = `
        Raum:
        <strong>${escapeHtml(roomName)}</strong>
    `;

    stopMetaListener = onValue(
        ref(
            database,
            `games/${roomCode}/meta`
        ),
        snapshot => {
            if (!snapshot.exists()) {
                alert(
                    "Der Spielraum wurde gelöscht."
                );

                resetPage();
                return;
            }

            roomMeta = snapshot.val();

            activeRoomNameElement.innerHTML = `
                Raum:
                <strong>
                    ${escapeHtml(
                        roomMeta.roomName ??
                        "Spielraum"
                    )}
                </strong>
            `;

            if (roomMeta.status !== "lobby") {
                redirectToStatus(
                    roomMeta.status,
                    roomCode,
                    "./index.html"
                );
                return;
            }

            renderLobby();
        }
    );

    stopPlayersListener = onValue(
        ref(
            database,
            `games/${roomCode}/lobbyPlayers`
        ),
        snapshot => {
            roomPlayers =
                snapshot.val() ?? {};

            renderLobby();
        }
    );
}


function renderLobby() {
    playerList.innerHTML = "";

    const players =
        orderedPlayers(roomPlayers);

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
        playerList.appendChild(item);
    }

    const host = isHost();

    hostControls.hidden = !host;

    prepareGameButton.disabled =
        players.length < 2;

    lobbyStatus.textContent =
        players.length < 2
            ? "Es wird mindestens ein weiterer Spieler benötigt."
            : `${players.length} Spieler sind im Raum.`;

    if (host) {
        void publishRoomPlayerCount(
            players.length
        );
    }
}


async function publishRoomPlayerCount(
    playerCount
) {
    if (
        !isHost() ||
        !activeRoomCode ||
        roomMeta?.status !== "lobby" ||
        lastPublishedPlayerCount ===
            playerCount
    ) {
        return;
    }

    lastPublishedPlayerCount =
        playerCount;

    try {
        await set(
            ref(
                database,
                `publicRooms/${activeRoomCode}`
            ),
            {
                hostId:
                    currentUser.uid,
                hostName:
                    roomMeta.hostName ??
                    getPlayerName(),
                roomName:
                    roomMeta.roomName ??
                    "Spielraum",
                createdAt:
                    roomMeta.createdAt ??
                    Date.now(),
                playerCount
            }
        );

    } catch (error) {
        console.error(
            "Spielerzahl konnte nicht veröffentlicht werden:",
            error
        );

        lastPublishedPlayerCount = null;
    }
}


async function prepareGame() {
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

    prepareGameButton.disabled = true;

    try {
        await update(
            ref(database),
            {
                [`games/${activeRoomCode}/meta/status`]:
                    "roundSetup",

                [`games/${activeRoomCode}/state/status`]:
                    "roundSetup",

                [`publicRooms/${activeRoomCode}`]:
                    null
            }
        );

    } catch (error) {
        console.error(error);

        alert(
            `Spiel konnte nicht vorbereitet werden: ${error.message}`
        );

        prepareGameButton.disabled = false;
    }
}


async function leaveRoom() {
    if (!activeRoomCode || !currentUser) {
        resetPage();
        return;
    }

    const host = isHost();

    const confirmed =
        window.confirm(
            host
                ? "Als Spielleiter löschst du den ganzen Raum. Fortfahren?"
                : "Möchtest du den Raum verlassen?"
        );

    if (!confirmed) {
        return;
    }

    if (host) {
        await update(
            ref(database),
            {
                [`games/${activeRoomCode}`]:
                    null,

                [`publicRooms/${activeRoomCode}`]:
                    null
            }
        );
    } else {
        await remove(
            ref(
                database,
                `games/${activeRoomCode}/lobbyPlayers/${currentUser.uid}`
            )
        );
    }

    resetPage();
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


function resetPage() {
    stopRoomListeners();

    activeRoomCode = null;
    roomMeta = null;
    roomPlayers = {};
    lastPublishedPlayerCount = null;

    clearRoomSession();

    entryPanel.hidden = false;
    lobbyPanel.hidden = true;

    activeRoomNameElement.textContent = "";

    setStatus(
        "Wähle einen offenen Spielraum oder erstelle einen neuen."
    );
}


async function restoreSavedRoom() {
    const savedRoomCode =
        cleanRoomCode(
            sessionStorage.getItem(
                "kartenspielRoomCode"
            )
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

    playerNameInput.value =
        savedPlayerName;

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
        clearRoomSession();
        return;
    }

    const meta =
        metaSnapshot.val();

    if (meta.status !== "lobby") {
        redirectToStatus(
            meta.status,
            savedRoomCode,
            "./index.html"
        );
        return;
    }

    await enterRoom(
        savedRoomCode,
        savedPlayerName,
        meta.roomName ??
            "Spielraum"
    );
}


createRoomButton.addEventListener(
    "click",
    createRoom
);

refreshRoomsButton.addEventListener(
    "click",
    () => {
        renderAvailableRooms();
    }
);

availableRoomList.addEventListener(
    "click",
    event => {
        const roomButton =
            event.target.closest(
                "[data-room-code]"
            );

        if (!roomButton) {
            return;
        }

        void joinRoom(
            roomButton.dataset.roomCode
        );
    }
);

prepareGameButton.addEventListener(
    "click",
    prepareGame
);

leaveRoomButton.addEventListener(
    "click",
    leaveRoom
);

roomNameInput.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            createRoom();
        }
    }
);


onAuthStateChanged(
    auth,
    async user => {
        if (user) {
            currentUser = user;

            setStatus(
                "Wähle einen offenen Spielraum oder erstelle einen neuen."
            );

            setEntryDisabled(false);
            startAvailableRoomsListener();

            try {
                await restoreSavedRoom();
            } catch (error) {
                console.error(error);
            }

            return;
        }

        try {
            setStatus(
                "Anonyme Anmeldung läuft …"
            );

            setEntryDisabled(true);

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setStatus(
                `Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);
