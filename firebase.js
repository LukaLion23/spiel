/*
 * Firebase-Online-Lobby für GitHub Pages
 *
 * Diese Datei erstellt zunächst nur die gemeinsame Lobby:
 * - Spielraum erstellen
 * - Raumcode erzeugen
 * - einem Raum beitreten
 * - Spielerliste auf allen Geräten live anzeigen
 *
 * Die eigentliche Spiellogik wird im nächsten Schritt
 * vom lokalen script.js nach Firebase verschoben.
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
    getDatabase,
    get,
    onDisconnect,
    onValue,
    ref,
    runTransaction,
    serverTimestamp,
    set
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyCEFNMFPTKy7ZHutPkes_blz8ai-XocVBk",
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


let currentUser = null;
let activeRoomCode = null;
let stopRoomListener = null;


const firebaseStatus =
    document.getElementById("firebaseStatus");

const activeRoomCodeElement =
    document.getElementById("activeRoomCode");

const onlinePlayerList =
    document.getElementById("onlinePlayerList");

const onlinePlayerNameInput =
    document.getElementById("onlinePlayerName");

const roomCodeInput =
    document.getElementById("roomCodeInput");

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");


function setStatus(message) {
    firebaseStatus.textContent = message;
}


function setLobbyButtonsDisabled(disabled) {
    createRoomButton.disabled = disabled;
    joinRoomButton.disabled = disabled;
}


function getPlayerName() {
    return onlinePlayerNameInput.value.trim();
}


function cleanRoomCode(value) {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}


function generateRoomCode() {
    /*
     * 0, O, 1 und I werden vermieden,
     * damit der Spielcode leichter lesbar ist.
     */
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
        onlinePlayerNameInput.focus();
        return null;
    }

    return playerName;
}


async function createRoom() {
    const playerName = validatePlayerName();

    if (!playerName) {
        return;
    }

    if (!currentUser) {
        alert(
            "Firebase ist noch nicht verbunden. Bitte kurz warten."
        );
        return;
    }

    setLobbyButtonsDisabled(true);
    setStatus("Spielraum wird erstellt …");

    try {
        /*
         * Falls zufällig schon ein Raum mit demselben Code
         * existiert, werden bis zu zehn neue Codes versucht.
         */
        for (let attempt = 0; attempt < 10; attempt++) {
            const roomCode = generateRoomCode();
            const gameReference =
                ref(database, `games/${roomCode}`);

            const result = await runTransaction(
                gameReference,
                currentGame => {
                    if (currentGame !== null) {
                        /*
                         * undefined bricht diese Transaktion ab,
                         * damit ein anderer Raumcode versucht wird.
                         */
                        return;
                    }

                    return {
                        hostId: currentUser.uid,
                        status: "lobby",
                        createdAt: Date.now(),

                        players: {
                            [currentUser.uid]: {
                                name: playerName,
                                joinedAt: Date.now()
                            }
                        }
                    };
                },
                {
                    applyLocally: false
                }
            );

            if (result.committed) {
                await enterRoom(roomCode);
                return;
            }
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
        setLobbyButtonsDisabled(false);
    }
}


async function joinRoom() {
    const playerName = validatePlayerName();

    if (!playerName) {
        return;
    }

    if (!currentUser) {
        alert(
            "Firebase ist noch nicht verbunden. Bitte kurz warten."
        );
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

    setLobbyButtonsDisabled(true);
    setStatus("Spielraum wird gesucht …");

    try {
        const gameReference =
            ref(database, `games/${roomCode}`);

        /*
         * Erst prüfen, ob der Raum existiert.
         */
        const gameSnapshot = await get(gameReference);

        if (!gameSnapshot.exists()) {
            alert("Dieser Spielraum existiert nicht.");
            setStatus("Kein passender Spielraum gefunden.");
            return;
        }

        /*
         * Spieler per Transaktion einfügen, damit die
         * maximale Spielerzahl auch bei gleichzeitigem
         * Beitritt eingehalten wird.
         */
        const result = await runTransaction(
            gameReference,
            currentGame => {
                if (currentGame === null) {
                    return;
                }

                if (currentGame.status !== "lobby") {
                    return;
                }

                const players =
                    currentGame.players ?? {};

                /*
                 * Dasselbe Gerät darf erneut in seinen
                 * bisherigen Raum eintreten.
                 */
                if (players[currentUser.uid]) {
                    players[currentUser.uid].name =
                        playerName;

                    currentGame.players = players;
                    return currentGame;
                }

                const playerValues =
                    Object.values(players);

                if (playerValues.length >= 10) {
                    return;
                }

                const nameAlreadyExists =
                    playerValues.some(player =>
                        String(player.name)
                            .toLowerCase() ===
                        playerName.toLowerCase()
                    );

                if (nameAlreadyExists) {
                    return;
                }

                players[currentUser.uid] = {
                    name: playerName,
                    joinedAt: Date.now()
                };

                currentGame.players = players;

                return currentGame;
            },
            {
                applyLocally: false
            }
        );

        if (!result.committed) {
            const latestSnapshot =
                await get(gameReference);

            if (!latestSnapshot.exists()) {
                alert("Dieser Spielraum existiert nicht mehr.");
            } else {
                const latestGame =
                    latestSnapshot.val();

                if (latestGame.status !== "lobby") {
                    alert(
                        "Dieses Spiel wurde bereits gestartet."
                    );
                } else {
                    const latestPlayers =
                        Object.values(
                            latestGame.players ?? {}
                        );

                    const duplicateName =
                        latestPlayers.some(player =>
                            String(player.name)
                                .toLowerCase() ===
                            playerName.toLowerCase()
                        );

                    if (duplicateName) {
                        alert(
                            "Dieser Spielername wird bereits verwendet."
                        );
                    } else {
                        alert(
                            "Der Spielraum ist voll oder der Beitritt wurde abgelehnt."
                        );
                    }
                }
            }

            setStatus("Beitritt nicht möglich.");
            return;
        }

        await enterRoom(roomCode);

    } catch (error) {
        console.error(error);

        setStatus(
            `Beitritt fehlgeschlagen: ${error.message}`
        );

    } finally {
        setLobbyButtonsDisabled(false);
    }
}


async function enterRoom(roomCode) {
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

    activeRoomCodeElement.innerHTML = `
        Aktueller Spielcode:
        <strong>${roomCode}</strong>
    `;

    setStatus("Mit dem Spielraum verbunden.");

    const ownPlayerReference = ref(
        database,
        `games/${roomCode}/players/${currentUser.uid}`
    );

    /*
     * Wird die Seite oder der Browser geschlossen,
     * wird der Spieler aus der Lobby entfernt.
     */
    await onDisconnect(
        ownPlayerReference
    ).remove();

    if (stopRoomListener) {
        stopRoomListener();
    }

    const gameReference =
        ref(database, `games/${roomCode}`);

    stopRoomListener = onValue(
        gameReference,
        snapshot => {
            if (!snapshot.exists()) {
                setStatus(
                    "Der Spielraum existiert nicht mehr."
                );

                onlinePlayerList.innerHTML = "";
                activeRoomCodeElement.textContent = "";
                activeRoomCode = null;
                return;
            }

            const game = snapshot.val();

            renderOnlinePlayers(
                game.players ?? {},
                game.hostId
            );
        },
        error => {
            console.error(error);

            setStatus(
                `Firebase-Verbindungsfehler: ${error.message}`
            );
        }
    );
}


function renderOnlinePlayers(players, hostId) {
    onlinePlayerList.innerHTML = "";

    const playerEntries = Object.entries(players)
        .sort(
            ([, playerA], [, playerB]) =>
                (playerA.joinedAt ?? 0) -
                (playerB.joinedAt ?? 0)
        );

    for (const [userId, player] of playerEntries) {
        const listItem =
            document.createElement("li");

        let label = player.name;

        if (userId === hostId) {
            label += " (Spielleiter)";
        }

        if (userId === currentUser.uid) {
            label += " (Du)";
        }

        listItem.textContent = label;
        onlinePlayerList.appendChild(listItem);
    }
}


createRoomButton.addEventListener(
    "click",
    createRoom
);

joinRoomButton.addEventListener(
    "click",
    joinRoom
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
        if (event.key === "Enter") {
            if (roomCodeInput.value.trim() === "") {
                createRoom();
            } else {
                joinRoom();
            }
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

            setLobbyButtonsDisabled(false);

            /*
             * Name und Raumcode derselben Browser-Sitzung
             * nach einem versehentlichen Neuladen einsetzen.
             */
            const savedName =
                sessionStorage.getItem(
                    "kartenspielPlayerName"
                );

            const savedRoomCode =
                sessionStorage.getItem(
                    "kartenspielRoomCode"
                );

            if (savedName) {
                onlinePlayerNameInput.value =
                    savedName;
            }

            if (savedRoomCode) {
                roomCodeInput.value =
                    savedRoomCode;
            }

            return;
        }

        try {
            setStatus("Anonyme Anmeldung läuft …");
            setLobbyButtonsDisabled(true);

            await signInAnonymously(auth);

        } catch (error) {
            console.error(error);

            setStatus(
                `Anonyme Anmeldung fehlgeschlagen: ${error.message}`
            );
        }
    }
);
