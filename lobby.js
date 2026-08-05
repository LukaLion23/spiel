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
} from "./firebase-common.js?v=40";


let currentUser = null;
let activeRoomCode = null;
let roomMeta = null;
let roomPlayers = {};

let stopMetaListener = null;
let stopPlayersListener = null;


const entryPanel =
    document.getElementById("entryPanel");

const lobbyPanel =
    document.getElementById("lobbyPanel");

const playerNameInput =
    document.getElementById("playerName");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

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
    joinRoomButton.disabled = disabled;
}


function getPlayerName() {
    return playerNameInput.value.trim();
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
        return null;
    }

    return name;
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


async function createRoom() {
    const name = validatePlayerName();

    if (!name || !currentUser) {
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
                            status: "lobby",
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

            await set(
                ref(
                    database,
                    `games/${roomCode}/lobbyPlayers/${currentUser.uid}`
                ),
                {
                    name,
                    joinedAt: Date.now()
                }
            );

            await enterRoom(
                roomCode,
                name
            );

            return;
        }

        throw new Error(
            "Kein freier Spielcode gefunden."
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


async function joinRoom() {
    const name = validatePlayerName();

    if (!name || !currentUser) {
        return;
    }

    const roomCode =
        cleanRoomCode(
            roomCodeInput.value
        );

    if (roomCode.length !== 6) {
        alert(
            "Der Spielcode muss genau 6 Zeichen haben."
        );
        return;
    }

    setEntryDisabled(true);
    setStatus("Spielraum wird gesucht …");

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
                "Dieser Spielraum existiert nicht."
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
                        .toLowerCase() ===
                    name.toLowerCase()
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
                name,
                joinedAt:
                    players[currentUser.uid]
                        ?.joinedAt ??
                    Date.now()
            }
        );

        await enterRoom(
            roomCode,
            name
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
    playerName
) {
    stopListeners();

    activeRoomCode = roomCode;

    saveRoomSession(
        roomCode,
        playerName
    );

    entryPanel.hidden = true;
    lobbyPanel.hidden = false;

    activeRoomCodeElement.innerHTML = `
        Spielcode:
        <strong>${escapeHtml(roomCode)}</strong>
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
                    "roundSetup"
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

    resetPage();
}


function stopListeners() {
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
    stopListeners();

    activeRoomCode = null;
    roomMeta = null;
    roomPlayers = {};

    clearRoomSession();

    entryPanel.hidden = false;
    lobbyPanel.hidden = true;

    setStatus(
        "Firebase verbunden. Du kannst ein Spiel erstellen oder beitreten."
    );
}


createRoomButton.addEventListener(
    "click",
    createRoom
);

joinRoomButton.addEventListener(
    "click",
    joinRoom
);

prepareGameButton.addEventListener(
    "click",
    prepareGame
);

leaveRoomButton.addEventListener(
    "click",
    leaveRoom
);

roomCodeInput.addEventListener(
    "input",
    event => {
        event.target.value =
            cleanRoomCode(
                event.target.value
            );
    }
);


onAuthStateChanged(
    auth,
    async user => {
        if (user) {
            currentUser = user;

            setStatus(
                "Firebase verbunden."
            );

            setEntryDisabled(false);
            return;
        }

        try {
            setStatus(
                "Anonyme Anmeldung läuft …"
            );

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setStatus(
                `Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);
