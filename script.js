const players = [];

const colors = [
    "Rot",
    "Blau",
    "Grün",
    "Gelb"
];

function addPlayer(){

    const input =
        document.getElementById("playerName");

    const name =
        input.value.trim();

    if(name === ""){
        return;
    }

    players.push({
        name: name,
        hand: []
    });

    input.value = "";

    renderPlayerList();
}

function renderPlayerList(){

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

function createDeck(){

    const deck = [];

    for(const color of colors){

        for(let value = 1; value <= 20; value++){

            deck.push({
                color,
                value
            });

        }
    }

    return deck;
}

function shuffle(deck){

    for(let i = deck.length - 1; i > 0; i--){

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [deck[i], deck[j]] =
        [deck[j], deck[i]];
    }
}

function startGame(){

    const cardsPerPlayer =
        parseInt(
            document.getElementById(
                "cardsPerPlayer"
            ).value
        );

    const deck =
        createDeck();

    shuffle(deck);

    players.forEach(player=>{
        player.hand = [];
    });

    for(let i=0;i<cardsPerPlayer;i++){

        players.forEach(player=>{

            if(deck.length > 0){

                player.hand.push(
                    deck.pop()
                );

            }

        });

    }

    renderHands();
}

function renderHands(){

    const game =
        document.getElementById("game");

    game.innerHTML = "";

    players.forEach(player=>{

        const div =
            document.createElement("div");

        div.className =
            "player";

        let html =
            `<h3>${player.name}</h3>`;

        player.hand.forEach(card=>{

            html += `
                <span class="card">
                    ${card.color}
                    ${card.value}
                </span>
            `;
        });

        div.innerHTML = html;

        game.appendChild(div);

    });
}