import {
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    get,
    onDisconnect,
    onValue,
    ref,
    remove,
    runTransaction,
    serverTimestamp,
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
} from "./firebase-common.js?v=54";


const HEARTBEAT_INTERVAL_MS = 15000;
const STALE_ROOM_DELETE_AFTER_MS = 120000;


let currentUser = null;
let activeRoomCode = null;
let roomMeta = null;
let roomPlayers = {};
let availableRooms = {};

let stopMetaListener = null;
let stopPlayersListener = null;
let stopAvailableRoomsListener = null;
let stopConnectionListener = null;

let heartbeatTimer = null;
let presenceRoomCode = null;
let publicRoomDisconnect = null;

let lastPublishedPlayerCount = null;
let heartbeatRunning = false;

const cleanupInProgress =
    new Set();


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
            void cleanupStaleRooms();
        },
        error => {
            console.error(error);

            roomListStatus.hidden = false;
            roomListStatus.textContent =
                `Spielräume konnten nicht geladen werden: ${error.message}`;
        }
    );
}


async function refreshAvailableRooms() {
    refreshRoomsButton.disabled = true;

    try {
        const snapshot = await get(
            ref(
                database,
                "publicRooms"
            )
        );

        availableRooms =
            snapshot.val() ?? {};

        renderAvailableRooms();
        await cleanupStaleRooms();

    } catch (error) {
        console.error(error);

        roomListStatus.hidden = false;
        roomListStatus.textContent =
            `Aktualisierung fehlgeschlagen: ${error.message}`;

    } finally {
        refreshRoomsButton.disabled = false;
    }
}


function getRoomTimestamp(room) {
    const lastSeenAt =
        Number(room?.lastSeenAt);

    if (Number.isFinite(lastSeenAt)) {
        return lastSeenAt;
    }

    const createdAt =
        Number(room?.createdAt);

    if (Number.isFinite(createdAt)) {
        return createdAt;
    }

    return 0;
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
                    getRoomTimestamp(roomB) -
                    getRoomTimestamp(roomA)
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
                ? `${playerCount} Spieler`
                : "Offen";

        button.innerHTML = `
            <span class="room-entry-main">
                <strong>
                    ${escapeHtml(room.roomName)}
                </strong>

                <small>
                    Spielleiter:
                    ${escapeHtml(
                        room.hostName ??
                        "Unbekannt"
                    )}
                </small>
            </span>

            <span class="room-entry-side">
                <small>
                    ${escapeHtml(
                        playerCountText
                    )}
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


async function cleanupStaleRooms() {
    const now = Date.now();

    const staleRoomCodes =
        Object.entries(availableRooms)
            .filter(([, room]) => {
                const timestamp =
                    getRoomTimestamp(room);

                return (
                    timestamp === 0 ||
                    now - timestamp >
                        STALE_ROOM_DELETE_AFTER_MS
                );
            })
            .map(([roomCode]) =>
                cleanRoomCode(roomCode)
            )
            .filter(roomCode =>
                roomCode.length === 6
            );

    for (const roomCode of staleRoomCodes) {
        if (cleanupInProgress.has(roomCode)) {
            continue;
        }

        cleanupInProgress.add(roomCode);

        try {
            await update(
                ref(database),
                {
                    [`publicRooms/${roomCode}`]:
                        null,

                    [`games/${roomCode}`]:
                        null
                }
            );

        } catch (error) {
            /*
             * Eine Löschung kann abgelehnt werden,
             * wenn der Raum serverseitig noch nicht
             * lange genug verwaist ist. Dann wird sie
             * beim nächsten Listener-Aufruf erneut versucht.
             */
            console.debug(
                `Verwaister Raum ${roomCode} wurde noch nicht gelöscht:`,
                error.message
            );

        } finally {
            cleanupInProgress.delete(
                roomCode
            );
        }
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

            const createdAt =
                Date.now();

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
                            createdAt,
                            lastSeenAt:
                                createdAt
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
                                    createdAt
                            },

                        [`games/${roomCode}/meta/lastSeenAt`]:
                            serverTimestamp(),

                        [`publicRooms/${roomCode}`]:
                            {
                                hostId:
                                    currentUser.uid,
                                hostName:
                                    playerName,
                                roomName,
                                createdAt,
                                lastSeenAt:
                                    serverTimestamp(),
                                playerCount:
                                    1
                            }
                    }
                );

                /*
                 * Sicherstellen, dass der Raum tatsächlich
                 * im gemeinsamen Verzeichnis angekommen ist.
                 */
                const publicSnapshot =
                    await get(
                        ref(
                            database,
                            `publicRooms/${roomCode}`
                        )
                    );

                if (!publicSnapshot.exists()) {
                    throw new Error(
                        "Der Spielraum konnte nicht veröffentlicht werden."
                    );
                }

            } catch (error) {
                await update(
                    ref(database),
                    {
                        [`games/${roomCode}`]:
                            null,

                        [`publicRooms/${roomCode}`]:
                            null
                    }
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
        const [
            metaSnapshot,
            publicRoomSnapshot
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
                    `publicRooms/${roomCode}`
                )
            )
        ]);

        if (
            !metaSnapshot.exists() ||
            !publicRoomSnapshot.exists()
        ) {
            alert(
                "Dieser Spielraum existiert nicht mehr."
            );

            availableRooms[roomCode] =
                undefined;

            renderAvailableRooms();
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
                        .toLocaleLowerCase(
                            "de-DE"
                        ) ===
                    playerName.toLocaleLowerCase(
                        "de-DE"
                    )
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
    await stopHostPresence();
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

            roomMeta =
                snapshot.val();

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
                void stopHostPresence();

                redirectToStatus(
                    roomMeta.status,
                    roomCode,
                    "./index.html"
                );

                return;
            }

            if (isHost()) {
                void startHostPresence();
            } else {
                void stopHostPresence();
            }

            renderLobby();
        },
        error => {
            console.error(error);

            setStatus(
                `Raumverbindung fehlgeschlagen: ${error.message}`
            );
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


async function startHostPresence() {
    if (
        !isHost() ||
        !activeRoomCode ||
        roomMeta?.status !== "lobby"
    ) {
        return;
    }

    if (
        presenceRoomCode ===
            activeRoomCode &&
        heartbeatTimer &&
        stopConnectionListener
    ) {
        return;
    }

    if (
        presenceRoomCode !==
        activeRoomCode
    ) {
        await stopHostPresence();

        presenceRoomCode =
            activeRoomCode;
    }

    const publicRoomReference =
        ref(
            database,
            `publicRooms/${activeRoomCode}`
        );

    publicRoomDisconnect =
        onDisconnect(
            publicRoomReference
        );

    try {
        await publicRoomDisconnect.remove();

    } catch (error) {
        console.error(
            "Automatisches Entfernen des Raums konnte nicht vorbereitet werden:",
            error
        );
    }

    if (!stopConnectionListener) {
        stopConnectionListener =
            onValue(
                ref(
                    database,
                    ".info/connected"
                ),
                snapshot => {
                    if (
                        snapshot.val() === true &&
                        isHost() &&
                        roomMeta?.status ===
                            "lobby"
                    ) {
                        void registerDisconnectAndPublish();
                    }
                }
            );
    }

    if (!heartbeatTimer) {
        heartbeatTimer =
            window.setInterval(
                () => {
                    void publishPublicRoom(
                        orderedPlayers(
                            roomPlayers
                        ).length
                    );
                },
                HEARTBEAT_INTERVAL_MS
            );
    }

    await publishPublicRoom(
        orderedPlayers(
            roomPlayers
        ).length
    );
}


async function registerDisconnectAndPublish() {
    if (
        !isHost() ||
        !activeRoomCode ||
        roomMeta?.status !== "lobby"
    ) {
        return;
    }

    const publicRoomReference =
        ref(
            database,
            `publicRooms/${activeRoomCode}`
        );

    publicRoomDisconnect =
        onDisconnect(
            publicRoomReference
        );

    await publicRoomDisconnect.remove();

    await publishPublicRoom(
        orderedPlayers(
            roomPlayers
        ).length
    );
}


async function publishPublicRoom(
    playerCount
) {
    if (
        heartbeatRunning ||
        !isHost() ||
        !activeRoomCode ||
        roomMeta?.status !== "lobby"
    ) {
        return;
    }

    heartbeatRunning = true;

    try {
        await update(
            ref(database),
            {
                [`games/${activeRoomCode}/meta/lastSeenAt`]:
                    serverTimestamp(),

                [`publicRooms/${activeRoomCode}`]:
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
                        lastSeenAt:
                            serverTimestamp(),
                        playerCount
                    }
            }
        );

        lastPublishedPlayerCount =
            playerCount;

    } catch (error) {
        console.error(
            "Spielraum konnte nicht veröffentlicht werden:",
            error
        );

    } finally {
        heartbeatRunning = false;
    }
}


async function stopHostPresence() {
    if (heartbeatTimer) {
        window.clearInterval(
            heartbeatTimer
        );

        heartbeatTimer = null;
    }

    if (stopConnectionListener) {
        stopConnectionListener();
        stopConnectionListener = null;
    }

    if (publicRoomDisconnect) {
        try {
            await publicRoomDisconnect.cancel();
        } catch (error) {
            console.debug(
                "OnDisconnect-Auftrag konnte nicht abgebrochen werden:",
                error.message
            );
        }

        publicRoomDisconnect = null;
    }

    presenceRoomCode = null;
    heartbeatRunning = false;
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

    if (
        host &&
        roomMeta?.status === "lobby" &&
        lastPublishedPlayerCount !==
            players.length
    ) {
        void publishPublicRoom(
            players.length
        );
    }

    if (
        host &&
        players.length === 0
    ) {
        void deleteEmptyHostRoom();
    }
}


async function deleteEmptyHostRoom() {
    if (
        !isHost() ||
        !activeRoomCode
    ) {
        return;
    }

    const roomCode =
        activeRoomCode;

    await stopHostPresence();

    try {
        await update(
            ref(database),
            {
                [`games/${roomCode}`]:
                    null,

                [`publicRooms/${roomCode}`]:
                    null
            }
        );

    } catch (error) {
        console.error(
            "Leerer Raum konnte nicht gelöscht werden:",
            error
        );
    }

    resetPage();
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
        await stopHostPresence();

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

        await startHostPresence();
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
        await stopHostPresence();

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


async function resetPage() {
    await stopHostPresence();
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
        void refreshAvailableRooms();
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
                await refreshAvailableRooms();
                await restoreSavedRoom();

            } catch (error) {
                console.error(error);

                setStatus(
                    `Spielräume konnten nicht vollständig geladen werden: ${error.message}`
                );
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
