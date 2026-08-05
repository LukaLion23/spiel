/*
 * Gemeinsame Firebase-Verbindung und Hilfsfunktionen.
 */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    getDatabase
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

export const auth = getAuth(app);
export const database = getDatabase(app);

export const COLORS = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

export const TRUMP_COLOR = "Rot";
export const MAX_PLAYERS = 10;


const COLOR_ALIASES = new Map([
    ["rot", "Rot"],
    ["red", "Rot"],
    ["blau", "Blau"],
    ["blue", "Blau"],
    ["grün", "Grün"],
    ["gruen", "Grün"],
    ["green", "Grün"],
    ["gelb", "Gelb"],
    ["yellow", "Gelb"]
]);


export function normalizeColor(value) {
    const normalized =
        String(value ?? "")
            .trim()
            .toLocaleLowerCase("de-DE");

    return COLOR_ALIASES.get(normalized) ??
        String(value ?? "").trim();
}


export function getCardColorClass(color) {
    const normalizedColor =
        normalizeColor(color);

    const classByColor = {
        Rot: "card-rot",
        Blau: "card-blau",
        "Grün": "card-gruen",
        Gelb: "card-gelb"
    };

    return classByColor[normalizedColor] ??
        "card-unknown";
}


export function getCardImagePath(color) {
    const normalizedColor =
        normalizeColor(color);

    const imageByColor = {
        Rot: "./assets/cards/rot.png?v=57",
        Blau: "./assets/cards/blau.png?v=57",
        "Grün": "./assets/cards/gruen.png?v=57",
        Gelb: "./assets/cards/gelb.png?v=57"
    };

    return imageByColor[normalizedColor] ??
        "./assets/cards/blau.png?v=57";
}


export function escapeHtml(value) {
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


export function cleanRoomCode(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}


export function getSavedRoomCode() {
    return cleanRoomCode(
        sessionStorage.getItem(
            "kartenspielRoomCode"
        )
    );
}


export function saveRoomSession(
    roomCode,
    playerName
) {
    sessionStorage.setItem(
        "kartenspielRoomCode",
        roomCode
    );

    sessionStorage.setItem(
        "kartenspielPlayerName",
        playerName
    );
}


export function clearRoomSession() {
    sessionStorage.removeItem(
        "kartenspielRoomCode"
    );

    sessionStorage.removeItem(
        "kartenspielPlayerName"
    );
}


export function getRoomCodeFromUrl() {
    const parameters =
        new URLSearchParams(
            window.location.search
        );

    const queryRoom =
        cleanRoomCode(
            parameters.get("room")
        );

    if (queryRoom.length === 6) {
        return queryRoom;
    }

    return getSavedRoomCode();
}


export function routeForStatus(
    status,
    roomCode
) {
    const roomParameter =
        `?room=${encodeURIComponent(roomCode)}`;

    if (status === "lobby") {
        return `./index.html${roomParameter}`;
    }

    if (
        status === "roundSetup" ||
        status === "gameFinished"
    ) {
        return `./round.html${roomParameter}`;
    }

    if (status === "tips") {
        return `./tip.html${roomParameter}`;
    }

    if (
        status === "playing" ||
        status === "trickResult" ||
        status === "roundResult"
    ) {
        return `./game.html${roomParameter}`;
    }

    return `./index.html${roomParameter}`;
}


export function redirectToStatus(
    status,
    roomCode,
    currentPage
) {
    const target =
        routeForStatus(
            status,
            roomCode
        );

    if (!target.startsWith(currentPage)) {
        window.location.replace(target);
    }
}


export function createDeck() {
    const deck = [];

    for (const color of COLORS) {
        for (
            let value = 1;
            value <= 20;
            value++
        ) {
            deck.push({
                id: `${color}_${value}`,
                color,
                value
            });
        }
    }

    return deck;
}


function secureRandomInteger(
    maximumExclusive
) {
    if (
        !Number.isInteger(maximumExclusive) ||
        maximumExclusive <= 0
    ) {
        throw new Error(
            "Die Zufallsobergrenze muss eine positive ganze Zahl sein."
        );
    }

    /*
     * Ablehnungsverfahren gegen Modulo-Verzerrung:
     * Nur Werte aus einem vollständig teilbaren Bereich
     * werden verwendet.
     */
    const maximumUint32 =
        0x100000000;

    const validLimit =
        maximumUint32 -
        (
            maximumUint32 %
            maximumExclusive
        );

    const randomBuffer =
        new Uint32Array(1);

    let randomValue;

    do {
        crypto.getRandomValues(
            randomBuffer
        );

        randomValue =
            randomBuffer[0];
    } while (
        randomValue >= validLimit
    );

    return randomValue %
        maximumExclusive;
}


export function shuffle(deck) {
    if (!Array.isArray(deck)) {
        throw new Error(
            "Zum Mischen wird ein Kartenstapel benötigt."
        );
    }

    /*
     * Unverzerrtes Fisher-Yates-Mischen mit
     * crypto.getRandomValues statt Math.random.
     */
    for (
        let index = deck.length - 1;
        index > 0;
        index--
    ) {
        const randomIndex =
            secureRandomInteger(
                index + 1
            );

        [
            deck[index],
            deck[randomIndex]
        ] = [
            deck[randomIndex],
            deck[index]
        ];
    }

    return deck;
}


export function cardsToObject(cards) {
    const result = {};

    for (const card of cards) {
        result[card.id] = card;
    }

    return result;
}


export function objectToCards(handObject) {
    const colorOrder = new Map(
        COLORS.map((color, index) => [
            color,
            index
        ])
    );

    return Object.values(
        handObject ?? {}
    ).sort((cardA, cardB) => {
        const colorDifference =
            colorOrder.get(cardA.color) -
            colorOrder.get(cardB.color);

        if (colorDifference !== 0) {
            return colorDifference;
        }

        return cardA.value - cardB.value;
    });
}


export function canPlayCard(
    handCards,
    card,
    leadColor
) {
    const normalizedLeadColor =
        normalizeColor(leadColor);

    if (!normalizedLeadColor) {
        return true;
    }

    const hasLeadColor =
        handCards.some(
            handCard =>
                normalizeColor(
                    handCard.color
                ) === normalizedLeadColor
        );

    if (!hasLeadColor) {
        return true;
    }

    return normalizeColor(card.color) ===
        normalizedLeadColor;
}


function getTrickCardStrength(
    card,
    leadColor
) {
    const cardColor =
        normalizeColor(card?.color);

    const normalizedLeadColor =
        normalizeColor(leadColor);

    const cardValue =
        Number(card?.value);

    if (
        !COLORS.includes(cardColor) ||
        !Number.isFinite(cardValue)
    ) {
        return Number.NEGATIVE_INFINITY;
    }

    /*
     * Rot ist immer Trumpf und schlägt jede andere Farbe.
     * Unter mehreren roten Karten gewinnt die höchste Zahl.
     */
    if (cardColor === TRUMP_COLOR) {
        return 2000 + cardValue;
    }

    /*
     * Gibt es keinen roten Trumpf, können nur Karten der
     * ausgespielten Farbe den Stich gewinnen.
     */
    if (cardColor === normalizedLeadColor) {
        return 1000 + cardValue;
    }

    /*
     * Karten einer nicht ausgespielten Nicht-Trumpf-Farbe
     * können den Stich nicht gewinnen.
     */
    return cardValue;
}


export function determineTrickWinner(
    trick,
    leadColor
) {
    if (
        !Array.isArray(trick) ||
        trick.length === 0
    ) {
        throw new Error(
            "Ein leerer Stich kann nicht ausgewertet werden."
        );
    }

    const effectiveLeadColor =
        normalizeColor(
            leadColor ??
            trick[0]?.card?.color
        );

    const winner =
        trick.reduce(
            (highestEntry, currentEntry) => {
                const highestStrength =
                    getTrickCardStrength(
                        highestEntry.card,
                        effectiveLeadColor
                    );

                const currentStrength =
                    getTrickCardStrength(
                        currentEntry.card,
                        effectiveLeadColor
                    );

                return currentStrength >
                    highestStrength
                    ? currentEntry
                    : highestEntry;
            }
        );

    return winner.playerId;
}


export function calculateRoundPoints(
    tip,
    tricksWon
) {
    if (tip === tricksWon) {
        return 10 + tricksWon * 5;
    }

    return -5 * Math.abs(
        tip - tricksWon
    );
}


export function getNextPlayerId(
    playerOrder,
    currentPlayerId
) {
    const currentIndex =
        playerOrder.indexOf(
            currentPlayerId
        );

    return playerOrder[
        (currentIndex + 1) %
        playerOrder.length
    ];
}


export function rotateOrder(
    playerOrder,
    startingPlayerId
) {
    const startIndex =
        playerOrder.indexOf(
            startingPlayerId
        );

    if (startIndex < 0) {
        return [...playerOrder];
    }

    return [
        ...playerOrder.slice(startIndex),
        ...playerOrder.slice(0, startIndex)
    ];
}


export function orderedPlayers(
    playersObject
) {
    return Object.entries(
        playersObject ?? {}
    )
        .sort(
            ([, playerA], [, playerB]) =>
                (playerA.joinedAt ?? 0) -
                (playerB.joinedAt ?? 0)
        )
        .map(([id, player]) => ({
            id,
            ...player
        }));
}
