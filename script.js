let players = [];

let currentPlayer = 0;
let currentTrick = [];
let leadColor = null;
let startingPlayer = 0;
let tipsSaved = false;

const colors = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

function addPlayer() {

    const input =
        document.getElementById("playerName");

    const name =
        input.value.trim();

    if (name === "") {
        return;
    }

    players.push({
        name: name,
        hand: [],
        tip: 0,
        tricksWon: 0,
        score: 0
    });

    input.value = "";

    renderPlayerList();
    renderScoreboard();
}

function renderPlayerList() {

    const list =
        document.getElementById("playerList");

    list.innerHTML = "";

    players.forEach(player => {

        const li =
            document.createElement("li");

        li.textContent =
            player.name;

        list.appendChild(li);
    });
}

function createDeck() {

    const deck = [];

    for (const color of colors) {

        for (let value = 1; value <= 20; value++) {

            deck.push({
                color: color,
                value: value
            });

        }
    }

    return deck;
}

function shuffle(deck) {

    for (let i = deck.length - 1; i > 0; i--) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [deck[i], deck[j]] =
        [deck[j], deck[i]];
    }
}

function startGame() {

    if (players.length < 2) {

        alert(
            "Mindestens 2 Spieler erforderlich."
        );

        return;
    }

    const cardsPerPlayer =
        parseInt(
            document.getElementById(
                "cardsPerPlayer"
            ).value
        );

    const deck =
        createDeck();

    shuffle(deck);

    players.forEach(player => {

        player.hand = [];
        player.tip = 0;
        player.tricksWon = 0;

    });

    for (let i = 0; i < cardsPerPlayer; i++) {

        players.forEach(player => {

            if (deck.length > 0) {

                player.hand.push(
                    deck.pop()
                );

            }

        });

    }

    currentPlayer = 0;
    currentTrick = [];
    leadColor = null;
    tipsSaved = false;

    renderHands();
    renderTips();
    renderCurrentTrick();

    tipsSaved = true;
    document.getElementById(
        "messageArea"
    ).innerHTML =
    `
        <h2>Status</h2>
        <p>${players[0].name} beginnt.</p>
    `;
}

function renderHands() {

    const game =
        document.getElementById("game");

    game.innerHTML =
        "<h2>Spielerhände</h2>";

    players.forEach((player, playerIndex) => {

        const div =
            document.createElement("div");

        div.className = "player";

        let html =
            `<h3>${player.name}</h3>`;

        player.hand.forEach((card, cardIndex) => {

            html += `
                <button
                    class="card"
                    onclick="playCard(${playerIndex}, ${cardIndex})">
                    ${card.color} ${card.value}
                </button>
            `;
        });

        div.innerHTML = html;

        game.appendChild(div);

    });
}

function renderTips() {

    const tipsArea =
        document.getElementById("tipsArea");

    let html =
        "<h2>Tipps eingeben</h2>";

    players.forEach((player, index) => {

        html += `
            <div>
                <b>${player.name}</b>

                <input
                    type="number"
                    min="0"
                    max="${player.hand.length}"
                    value="0"
                    id="tip_${index}">
            </div>
        `;
    });

    html += `
        <br>
        <button onclick="saveTips()">
            Tipps speichern
        </button>
    `;

    tipsArea.innerHTML = html;
}

function saveTips() {

    players.forEach((player, index) => {

        player.tip =
            parseInt(
                document.getElementById(
                    `tip_${index}`
                ).value
            );

    });

    document.getElementById(
        "messageArea"
    ).innerHTML =
    `
        <h2>Status</h2>
        <p>
            Tipps gespeichert.
            ${players[currentPlayer].name} beginnt.
        </p>
    `;
}

function canPlayCard(player, card) {

    if (leadColor === null) {
        return true;
    }

    const hasLeadColor =
        player.hand.some(
            c => c.color === leadColor
        );

    if (!hasLeadColor) {
        return true;
    }

    return card.color === leadColor;
}

function determineTrickWinner() {

    const trumpCards =
        currentTrick.filter(
            entry =>
                entry.card.color === "Rot"
        );

    if (trumpCards.length > 0) {

        trumpCards.sort(
            (a, b) =>
                b.card.value - a.card.value
        );

        return trumpCards[0].playerIndex;
    }

    const leadCards =
        currentTrick.filter(
            entry =>
                entry.card.color === leadColor
        );

    leadCards.sort(
        (a, b) =>
            b.card.value - a.card.value
    );

    return leadCards[0].playerIndex;
}

function finishTrick() {

    const winner =
        determineTrickWinner();

    players[winner].tricksWon++;

    currentPlayer =
        winner;

    startingPlayer =
        winner;

    currentTrick = [];
    leadColor = null;

    renderHands();
    renderCurrentTrick();
    renderScoreboard();

    document.getElementById(
        "messageArea"
    ).innerHTML = `
        <h2>Status</h2>

        <p>
            Stich gewonnen von:
            <b>${players[winner].name}</b>
        </p>

        <p>
            ${players[winner].name}
            beginnt den nächsten Stich.
        </p>
    `;

    const roundFinished =
    players.every(player =>player.hand.length === 0);

        if (roundFinished) {
            finishRound();
        }

function finishRound() {

    players.forEach(player => {

        if (
            player.tip ===
            player.tricksWon
        ) {

            player.score +=
                10 +
                (player.tricksWon * 5);

        } else {

            player.score +=
                -5 *
                Math.abs(
                    player.tip -
                    player.tricksWon
                );
        }

    });

    renderScoreboard();

    document.getElementById(
        "messageArea"
    ).innerHTML = `
        <h2>Runde beendet</h2>

        <p>
            Punkte wurden berechnet.
        </p>
    `;
}

function playCard(
    playerIndex,
    cardIndex
) {


    if (
        playerIndex !== currentPlayer
    ) {

        if (!tipsSaved) {
            alert("Zuerst Tipps speichern.");
            return;
        }

        alert(
            "Dieser Spieler ist nicht am Zug."
        );

        return;
    }

    const player =
        players[playerIndex];

    const card =
        player.hand[cardIndex];

    if (
        !canPlayCard(
            player,
            card
        )
    ) {

        alert(
            "Du musst Farbe bedienen."
        );

        return;
    }

    if (
        leadColor === null
    ) {

        leadColor =
            card.color;
    }

    currentTrick.push({
        playerIndex,
        card
    });

    player.hand.splice(
        cardIndex,
        1
    );

    renderHands();
    renderCurrentTrick();

    if (
        currentTrick.length ===
        players.length
    ) {

        finishTrick();
        return;
    }

    currentPlayer++;

    if (
        currentPlayer >=
        players.length
    ) {

        currentPlayer = 0;
    }

    document.getElementById(
        "messageArea"
    ).innerHTML = `
        <h2>Status</h2>

        <p>
            ${players[currentPlayer].name}
            ist am Zug.
        </p>
    `;
}

function renderCurrentTrick() {

    const area =
        document.getElementById(
            "trickArea"
        );

    let html =
        "<h2>Aktueller Stich</h2>";

    currentTrick.forEach(entry => {

        html += `
            <p>
                ${players[
                    entry.playerIndex
                ].name}
                :
                ${entry.card.color}
                ${entry.card.value}
            </p>
        `;
    });

    area.innerHTML = html;
}

function renderScoreboard() {

    const board =
        document.getElementById(
            "scoreboard"
        );

    let html =
        "<h2>Punktestand</h2>";

    html += `
        <table>
            <tr>
                <th>Spieler</th>
                <th>Punkte</th>
            </tr>
    `;

    players.forEach(player => {

        html += `
            <tr>
                <td>${player.name}</td>
                <td>${player.score}</td>
            </tr>
        `;
    });

    html += "</table>";

    board.innerHTML = html;
}