/*
 * Stichspiel – vollständige Spiellogik
 *
 * Benötigte HTML-IDs:
 * playerName, playerList, cardsPerPlayer, game, tipsArea,
 * trickArea, scoreboard, messageArea
 *
 * Vorhandene HTML-Buttons können weiterhin diese Funktionen aufrufen:
 * addPlayer(), startGame(), saveTips(), playCard(...),
 * finishGame(), resetGame()
 */

let players = [];

let currentPlayer = 0;
let currentTrick = [];
let leadColor = null;
let startingPlayer = 0;
let tipsSaved = false;

let roundNumber = 0;
let roundInProgress = false;
let roundFinished = false;
let cardsPerPlayerCurrent = 0;

const MAX_PLAYERS = 10;
const TRUMP_COLOR = "Rot";

const colors = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

function getElement(id) {
    return document.getElementById(id);
}

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

function setMessage(html) {
    const messageArea = getElement("messageArea");

    if (messageArea) {
        messageArea.innerHTML = html;
    }
}

function addPlayer() {
    if (roundNumber > 0 || roundInProgress) {
        alert(
            "Nach dem Start des Spiels können keine Spieler mehr hinzugefügt werden."
        );
        return;
    }

    if (players.length >= MAX_PLAYERS) {
        alert(`Es sind höchstens ${MAX_PLAYERS} Spieler erlaubt.`);
        return;
    }

    const input = getElement("playerName");

    if (!input) {
        alert("Das Eingabefeld mit der ID 'playerName' wurde nicht gefunden.");
        return;
    }

    const name = input.value.trim();

    if (name === "") {
        alert("Bitte einen Spielernamen eingeben.");
        return;
    }

    const nameAlreadyExists = players.some(
        player => player.name.toLowerCase() === name.toLowerCase()
    );

    if (nameAlreadyExists) {
        alert("Dieser Spielername wurde bereits verwendet.");
        return;
    }

    players.push({
        name,
        hand: [],
        tip: 0,
        tricksWon: 0,
        roundPoints: 0,
        score: 0
    });

    input.value = "";

    renderPlayerList();
    renderScoreboard();
}

function removePlayer(playerIndex) {
    if (roundNumber > 0 || roundInProgress) {
        alert(
            "Nach dem Start des Spiels können keine Spieler mehr entfernt werden."
        );
        return;
    }

    if (
        !Number.isInteger(playerIndex) ||
        playerIndex < 0 ||
        playerIndex >= players.length
    ) {
        return;
    }

    players.splice(playerIndex, 1);

    renderPlayerList();
    renderScoreboard();
}

function renderPlayerList() {
    const list = getElement("playerList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    players.forEach((player, playerIndex) => {
        const li = document.createElement("li");
        const name = document.createElement("span");

        name.textContent = player.name;
        li.appendChild(name);

        if (roundNumber === 0 && !roundInProgress) {
            const removeButton = document.createElement("button");

            removeButton.type = "button";
            removeButton.textContent = "Entfernen";
            removeButton.addEventListener(
                "click",
                () => removePlayer(playerIndex)
            );

            li.appendChild(document.createTextNode(" "));
            li.appendChild(removeButton);
        }

        list.appendChild(li);
    });
}

function createDeck() {
    const deck = [];

    for (const color of colors) {
        for (let value = 1; value <= 20; value++) {
            deck.push({
                color,
                value
            });
        }
    }

    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function sortHand(hand) {
    const colorOrder = new Map(
        colors.map((color, index) => [color, index])
    );

    hand.sort((cardA, cardB) => {
        const colorDifference =
            colorOrder.get(cardA.color) -
            colorOrder.get(cardB.color);

        if (colorDifference !== 0) {
            return colorDifference;
        }

        return cardA.value - cardB.value;
    });
}

/*
 * startGame() startet beim ersten Aufruf das Spiel.
 * Nach einer beendeten Runde startet dieselbe Funktion die nächste Runde.
 * Die Gesamtpunkte bleiben dabei erhalten.
 */
function startGame() {
    if (roundInProgress) {
        alert("Die aktuelle Runde ist noch nicht beendet.");
        return;
    }

    if (players.length < 2) {
        alert("Mindestens 2 Spieler erforderlich.");
        return;
    }

    if (players.length > MAX_PLAYERS) {
        alert(`Es sind höchstens ${MAX_PLAYERS} Spieler erlaubt.`);
        return;
    }

    const cardsInput = getElement("cardsPerPlayer");

    if (!cardsInput) {
        alert(
            "Das Eingabefeld mit der ID 'cardsPerPlayer' wurde nicht gefunden."
        );
        return;
    }

    const cardsPerPlayer = Number(cardsInput.value);
    const maxCardsPerPlayer = Math.floor(
        80 / players.length
    );

    if (
        !Number.isInteger(cardsPerPlayer) ||
        cardsPerPlayer < 1 ||
        cardsPerPlayer > maxCardsPerPlayer
    ) {
        alert(
            `Bei ${players.length} Spielern sind 1 bis ` +
            `${maxCardsPerPlayer} Karten pro Spieler erlaubt.`
        );
        return;
    }

    const deck = createDeck();
    shuffle(deck);

    roundNumber++;
    cardsPerPlayerCurrent = cardsPerPlayer;

    /*
     * Der Startspieler wechselt in jeder Runde.
     * Runde 1: Spieler 1, Runde 2: Spieler 2 usw.
     */
    startingPlayer =
        (roundNumber - 1) % players.length;

    currentPlayer = startingPlayer;
    currentTrick = [];
    leadColor = null;
    tipsSaved = false;
    roundInProgress = true;
    roundFinished = false;

    players.forEach(player => {
        player.hand = [];
        player.tip = 0;
        player.tricksWon = 0;
        player.roundPoints = 0;
    });

    for (let i = 0; i < cardsPerPlayer; i++) {
        players.forEach(player => {
            player.hand.push(deck.pop());
        });
    }

    players.forEach(player => {
        sortHand(player.hand);
    });

    renderPlayerList();
    renderHands();
    renderTips();
    renderCurrentTrick();
    renderScoreboard();

    setMessage(`
        <h2>Runde ${roundNumber}</h2>
        <p>
            Zuerst müssen alle Tipps abgegeben und gespeichert werden.
        </p>
        <p>
            Danach beginnt
            <b>${escapeHtml(players[currentPlayer].name)}</b>.
        </p>
    `);
}

function renderHands() {
    const game = getElement("game");

    if (!game) {
        return;
    }

    let heading = "<h2>Spielerhände</h2>";

    if (roundNumber > 0) {
        heading = `<h2>Spielerhände – Runde ${roundNumber}</h2>`;
    }

    game.innerHTML = heading;

    if (!roundInProgress && roundNumber === 0) {
        game.innerHTML += "<p>Noch keine Runde gestartet.</p>";
        return;
    }

    players.forEach((player, playerIndex) => {
        const div = document.createElement("div");

        div.className = "player";

        let html = `
            <h3>${escapeHtml(player.name)}</h3>
            <p>
                Tipp: ${player.tip} |
                Gewonnene Stiche: ${player.tricksWon}
            </p>
        `;

        if (player.hand.length === 0) {
            html += "<p>Keine Karten mehr auf der Hand.</p>";
        }

        player.hand.forEach((card, cardIndex) => {
            const isCurrentPlayer =
                playerIndex === currentPlayer;

            const followsSuit =
                canPlayCard(player, card);

            const disabled =
                !roundInProgress ||
                roundFinished ||
                !tipsSaved ||
                !isCurrentPlayer ||
                !followsSuit;

            let title = "";

            if (!tipsSaved) {
                title = "Zuerst müssen die Tipps gespeichert werden.";
            } else if (!isCurrentPlayer) {
                title = "Dieser Spieler ist nicht am Zug.";
            } else if (!followsSuit) {
                title = `Du musst ${leadColor} bedienen.`;
            }

            html += `
                <button
                    type="button"
                    class="card card-${card.color.toLowerCase()}"
                    onclick="playCard(${playerIndex}, ${cardIndex})"
                    ${disabled ? "disabled" : ""}
                    title="${escapeHtml(title)}">
                    ${escapeHtml(card.color)} ${card.value}
                </button>
            `;
        });

        div.innerHTML = html;
        game.appendChild(div);
    });
}

function renderTips() {
    const tipsArea = getElement("tipsArea");

    if (!tipsArea) {
        return;
    }

    if (roundNumber === 0) {
        tipsArea.innerHTML =
            "<h2>Tipps eingeben</h2><p>Noch keine Runde gestartet.</p>";
        return;
    }

    let html = `<h2>Tipps eingeben – Runde ${roundNumber}</h2>`;

    players.forEach((player, index) => {
        const disabled =
            tipsSaved ||
            !roundInProgress ||
            roundFinished;

        html += `
            <div>
                <label for="tip_${index}">
                    <b>${escapeHtml(player.name)}</b>
                </label>

                <input
                    type="number"
                    min="0"
                    max="${cardsPerPlayerCurrent}"
                    step="1"
                    value="${player.tip}"
                    id="tip_${index}"
                    ${disabled ? "disabled" : ""}>
            </div>
        `;
    });

    const buttonDisabled =
        tipsSaved ||
        !roundInProgress ||
        roundFinished;

    html += `
        <br>
        <button
            type="button"
            onclick="saveTips()"
            ${buttonDisabled ? "disabled" : ""}>
            ${tipsSaved ? "Tipps gespeichert" : "Tipps speichern"}
        </button>
    `;

    tipsArea.innerHTML = html;
}

function saveTips() {
    if (!roundInProgress || roundFinished) {
        alert("Aktuell läuft keine Runde.");
        return;
    }

    if (tipsSaved) {
        alert("Die Tipps wurden bereits gespeichert.");
        return;
    }

    const enteredTips = [];

    for (let index = 0; index < players.length; index++) {
        const input = getElement(`tip_${index}`);

        if (!input) {
            alert(
                `Das Tippfeld für ${players[index].name} wurde nicht gefunden.`
            );
            return;
        }

        const tip = Number(input.value);

        if (
            !Number.isInteger(tip) ||
            tip < 0 ||
            tip > cardsPerPlayerCurrent
        ) {
            alert(
                `Ungültiger Tipp bei ${players[index].name}. ` +
                `Erlaubt sind ganze Zahlen von 0 bis ` +
                `${cardsPerPlayerCurrent}.`
            );
            input.focus();
            return;
        }

        enteredTips.push(tip);
    }

    players.forEach((player, index) => {
        player.tip = enteredTips[index];
    });

    tipsSaved = true;

    renderTips();
    renderHands();
    renderScoreboard();

    setMessage(`
        <h2>Status</h2>
        <p>Alle Tipps wurden gespeichert.</p>
        <p>
            <b>${escapeHtml(players[currentPlayer].name)}</b>
            beginnt.
        </p>
    `);
}

function canPlayCard(player, card) {
    if (!player || !card) {
        return false;
    }

    if (leadColor === null) {
        return true;
    }

    const hasLeadColor = player.hand.some(
        handCard => handCard.color === leadColor
    );

    if (!hasLeadColor) {
        return true;
    }

    return card.color === leadColor;
}

function determineTrickWinner() {
    if (currentTrick.length === 0) {
        return null;
    }

    const trumpCards = currentTrick.filter(
        entry => entry.card.color === TRUMP_COLOR
    );

    const relevantCards =
        trumpCards.length > 0
            ? trumpCards
            : currentTrick.filter(
                entry => entry.card.color === leadColor
            );

    const winningEntry = relevantCards.reduce(
        (highestCard, currentCard) =>
            currentCard.card.value > highestCard.card.value
                ? currentCard
                : highestCard
    );

    return winningEntry.playerIndex;
}

function finishTrick() {
    if (currentTrick.length !== players.length) {
        return;
    }

    const winner = determineTrickWinner();

    if (winner === null) {
        return;
    }

    players[winner].tricksWon++;

    currentPlayer = winner;
    startingPlayer = winner;

    currentTrick = [];
    leadColor = null;

    const allHandsEmpty = players.every(
        player => player.hand.length === 0
    );

    if (allHandsEmpty) {
        finishRound();
        return;
    }

    renderHands();
    renderCurrentTrick();
    renderScoreboard();

    setMessage(`
        <h2>Status</h2>

        <p>
            Stich gewonnen von:
            <b>${escapeHtml(players[winner].name)}</b>
        </p>

        <p>
            ${escapeHtml(players[winner].name)}
            beginnt den nächsten Stich.
        </p>
    `);
}

function calculateRoundPoints(player) {
    if (player.tip === player.tricksWon) {
        return 10 + player.tricksWon * 5;
    }

    return -5 * Math.abs(
        player.tip - player.tricksWon
    );
}

function finishRound() {
    if (!roundInProgress || roundFinished) {
        return;
    }

    roundFinished = true;
    roundInProgress = false;
    tipsSaved = false;

    players.forEach(player => {
        player.roundPoints =
            calculateRoundPoints(player);

        player.score += player.roundPoints;
    });

    renderHands();
    renderTips();
    renderCurrentTrick();
    renderScoreboard();

    const resultRows = players.map(player => `
        <tr>
            <td>${escapeHtml(player.name)}</td>
            <td>${player.tip}</td>
            <td>${player.tricksWon}</td>
            <td>${player.roundPoints}</td>
            <td>${player.score}</td>
        </tr>
    `).join("");

    setMessage(`
        <h2>Runde ${roundNumber} beendet</h2>

        <table>
            <tr>
                <th>Spieler</th>
                <th>Tipp</th>
                <th>Stiche</th>
                <th>Rundenpunkte</th>
                <th>Gesamtpunkte</th>
            </tr>
            ${resultRows}
        </table>

        <p>
            Über den bisherigen Start-Button kann jetzt
            die nächste Runde gestartet werden.
        </p>
    `);
}

function playCard(playerIndex, cardIndex) {
    if (!roundInProgress || roundFinished) {
        alert("Aktuell läuft keine Runde.");
        return;
    }

    if (!tipsSaved) {
        alert("Zuerst müssen alle Tipps gespeichert werden.");
        return;
    }

    if (
        !Number.isInteger(playerIndex) ||
        !Number.isInteger(cardIndex) ||
        playerIndex < 0 ||
        playerIndex >= players.length
    ) {
        return;
    }

    if (playerIndex !== currentPlayer) {
        alert("Dieser Spieler ist nicht am Zug.");
        return;
    }

    const player = players[playerIndex];
    const card = player.hand[cardIndex];

    if (!card) {
        alert("Diese Karte ist nicht mehr vorhanden.");
        renderHands();
        return;
    }

    if (!canPlayCard(player, card)) {
        alert(`Du musst ${leadColor} bedienen.`);
        return;
    }

    if (leadColor === null) {
        leadColor = card.color;
    }

    currentTrick.push({
        playerIndex,
        card
    });

    player.hand.splice(cardIndex, 1);

    if (currentTrick.length === players.length) {
        renderHands();
        renderCurrentTrick();
        finishTrick();
        return;
    }

    currentPlayer =
        (currentPlayer + 1) % players.length;

    renderHands();
    renderCurrentTrick();
    renderScoreboard();

    setMessage(`
        <h2>Status</h2>

        <p>
            Stichfarbe:
            <b>${escapeHtml(leadColor)}</b>
        </p>

        <p>
            <b>${escapeHtml(players[currentPlayer].name)}</b>
            ist am Zug.
        </p>
    `);
}

function renderCurrentTrick() {
    const area = getElement("trickArea");

    if (!area) {
        return;
    }

    let html = "<h2>Aktueller Stich</h2>";

    if (leadColor !== null) {
        html += `
            <p>
                Stichfarbe:
                <b>${escapeHtml(leadColor)}</b>
            </p>
        `;
    }

    if (currentTrick.length === 0) {
        html += "<p>Noch keine Karte in diesem Stich.</p>";
    }

    currentTrick.forEach(entry => {
        html += `
            <p>
                ${escapeHtml(players[entry.playerIndex].name)}:
                ${escapeHtml(entry.card.color)}
                ${entry.card.value}
            </p>
        `;
    });

    area.innerHTML = html;
}

function renderScoreboard() {
    const board = getElement("scoreboard");

    if (!board) {
        return;
    }

    let html = "<h2>Punktestand</h2>";

    html += `
        <table>
            <tr>
                <th>Spieler</th>
                <th>Tipp</th>
                <th>Stiche</th>
                <th>Rundenpunkte</th>
                <th>Gesamtpunkte</th>
            </tr>
    `;

    players.forEach(player => {
        html += `
            <tr>
                <td>${escapeHtml(player.name)}</td>
                <td>${player.tip}</td>
                <td>${player.tricksWon}</td>
                <td>${player.roundPoints}</td>
                <td>${player.score}</td>
            </tr>
        `;
    });

    html += "</table>";

    board.innerHTML = html;
}

function finishGame() {
    if (roundInProgress) {
        alert(
            "Die aktuelle Runde muss zuerst zu Ende gespielt werden."
        );
        return;
    }

    if (players.length === 0) {
        alert("Es wurden noch keine Spieler angelegt.");
        return;
    }

    if (roundNumber === 0) {
        alert("Es wurde noch keine Runde gespielt.");
        return;
    }

    const highestScore = Math.max(
        ...players.map(player => player.score)
    );

    const winners = players.filter(
        player => player.score === highestScore
    );

    const winnerNames = winners
        .map(player => escapeHtml(player.name))
        .join(", ");

    setMessage(`
        <h2>Spiel beendet</h2>

        <p>
            ${winners.length === 1 ? "Gewinner" : "Gewinner"}:
            <b>${winnerNames}</b>
        </p>

        <p>
            Gesamtpunktzahl:
            <b>${highestScore}</b>
        </p>
    `);
}

function resetGame() {
    const confirmed = window.confirm(
        "Soll das gesamte Spiel einschließlich aller Punkte zurückgesetzt werden?"
    );

    if (!confirmed) {
        return;
    }

    players = [];
    currentPlayer = 0;
    currentTrick = [];
    leadColor = null;
    startingPlayer = 0;
    tipsSaved = false;

    roundNumber = 0;
    roundInProgress = false;
    roundFinished = false;
    cardsPerPlayerCurrent = 0;

    const playerNameInput = getElement("playerName");

    if (playerNameInput) {
        playerNameInput.value = "";
    }

    renderPlayerList();
    renderHands();
    renderTips();
    renderCurrentTrick();
    renderScoreboard();

    setMessage(`
        <h2>Status</h2>
        <p>Das Spiel wurde vollständig zurückgesetzt.</p>
    `);
}

function initializeGameView() {
    renderPlayerList();
    renderHands();
    renderTips();
    renderCurrentTrick();
    renderScoreboard();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeGameView
    );
} else {
    initializeGameView();
}
