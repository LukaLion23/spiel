let players = [];

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

        li.textContent = player.name;

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
           