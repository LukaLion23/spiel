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


export function shuffle(deck) {
    for (
        let index = deck.length - 1;
        index > 0;
        index--
    ) {
        const randomIndex =
            Math.floor(
                Math.random() *
                (index + 1)
            );

        [
            deck[index],
            deck[randomIndex]
        ] = [
            deck[randomIndex],
            deck[index]
        ];
    }
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
    if (!leadColor) {
        return true;
    }

    const hasLeadColor =
        handCards.some(
            handCard =>
                handCard.color ===
                leadColor
        );

    if (!hasLeadColor) {
        return true;
    }

    return card.color === leadColor;
}


export function determineTrickWinner(
    trick,
    leadColor
) {
    const trumpCards =
        trick.filter(
            entry =>
                entry.card.color ===
                TRUMP_COLOR
        );

    const relevantCards =
        trumpCards.length > 0
            ? trumpCards
            : trick.filter(
                entry =>
                    entry.card.color ===
                    leadColor
            );

    return relevantCards.reduce(
        (highest, current) =>
            current.card.value >
            highest.card.value
                ? current
                : highest
    ).playerId;
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
