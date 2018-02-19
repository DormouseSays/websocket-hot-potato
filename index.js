const express = require('express')
const enableWs = require('express-ws')

const app = express()
enableWs(app)

app.use(express.static('static'))
app.use('/lib', express.static('node_modules/vue/dist'))
app.use('/lib', express.static('node_modules/bulma/css'))

var id = 1;
var order = 0;
var turn = 0;
var passesLeft = 0;
var gameId = 0;

/*
states:
lobby - waiting for players to join and ready
order - setting player order
game - active game with the players who joined
boom - potato exploded
over - game finished
*/
var state = { current: 'lobby', gameId: 0, players: [] };

var clients = [];
var viewers = [];
/*
random round length
real visuals, full width buttons w/ more padding
test?
heroku?
create git repo
write tests
*/

app.ws('/api/', (ws, req) => {

    //if the socket sends a 'view' event, add them to viewing list and put them in view mode

    // if (state.current != 'lobby') {
    //     ws.send(JSON.stringify({ message: 'game in progress', type: 'waiting' }));
    //     //console.log('connection ignored, game already started ')
    //     return;
    // }

    ws.id = id++;
    console.log('connection opened ' + ws.id)

    //TODO throw a random GUID on the websocket to identify sockets by more than user id?

    //TODO handle client with the same username(name all lowercase with no spaces) rejoining the same game

    //ws.send(JSON.stringify({ type: 'welcome', id: ws.id }));

    ws.on('message', msg => {
        var data = JSON.parse(msg);
        var response = { type: 'update', id: ws.id };

        //TODO compare id sent by client?
        let currentPlayer = state.players.find(p => p.id == ws.id);

        console.log('onMessage ' + data.type)

        if (data.type == 'join') {
            if (!data.name) {
                console.log('attempt to join missing name');
                ws.send(JSON.stringify({ error: 'badjoin', message: 'attempt to join missing name' }));
                return;
            }
            let name = data.name.replace(/\W/g, '').toLowerCase();
            

            if (data.gameId != null && data.gameId != state.gameId) {
                console.log('client attempted to rejoin different game');
                ws.send(JSON.stringify({ error: 'wronggame', message: 'client attempted to rejoin different game' }));
                return;
            }

            //TODO split up players by game? make find method that checks game id? or split players into buckets by game?
            let gameId = data.gameId;

            //check if player exists already
            let existingPlayer = state.players.find(p => p.name == data.name);
            let joinResponse = {type: 'welcome'};
            if (existingPlayer) {
                console.log('client re-joining with id ' + ws.id)
                joinResponse.message = 'client re-joined';
                ws.id = existingPlayer.id;
                joinResponse.id = existingPlayer.id;
                console.log('client re-joined, set id to ' + existingPlayer.id)

                //filter out old client
                clients = clients.filter(c => c.id != ws.id);
            } else {
                console.log('client joined')
                joinResponse.message = 'client joined';
                state.players.push({ id: ws.id, name: data.name, connected: true, order: null, ready: true, score: 0, shields: 1, reverses: 3 });
            }

            joinResponse.id = ws.id;
            clients.push(ws);

            //send id directly to current socket
            ws.send(JSON.stringify(joinResponse));
        } else if (data.type == 'start') {
            if (state.current == 'lobby') {
                state.current = 'order';
                order = 0;
                currentPlayer.order = order;
                state.currentPlayerId = currentPlayer.id;
                console.log('start game, currentPlayerId ' + state.currentPlayerId);
                order++;
            } else {
                response.error = 'not in the right state to start setting order';
            }
        } else if (data.type == 'order') {
            currentPlayer.order = order++;

            //if everyone has an order, advance state
            let unorderedPlayer = state.players.find(p => p.order == null);

            if (unorderedPlayer == null) {
                state.current = 'game';
                passesLeft = 5; //TODO randomize
                state.gameId = gameId++;
                //get first player for turn
            }
        } else if (data.type == 'pass' || data.type == 'reverse' || data.type == 'shield') {
            //confirm game state or fail
            if (state.current != 'game') {
                client.send(JSON.stringify({ error: 'wrongstate', message: 'not in game state' }));
                return;
            }

            //find player by turn, if they don't match current id, ignore
            if (state.currentPlayerId != currentPlayer.id) {
                client.send(JSON.stringify({ error: 'wrongturn', message: 'not your turn' }));
                return;
            }

            passesLeft--;

            //var currentPlayer = state.players[state.currentPlayerId];

            if (data.type == 'shield') {
                if (currentPlayer.shields <= 0) {
                    ws.send(JSON.stringify({ error: 'noshields', message: 'no shields left' }));
                    return;
                }
                currentPlayer.shields--;
            }

            if (passesLeft <= 0) {
                if (data.type == 'shield') {
                    //you pulled it off!
                } else {
                    currentPlayer.score = 0;
                }
                state.current = 'boom';
            } else {

                currentPlayer.score++;
                var nextOrder;
                if (data.type == 'reverse') {
                    if (currentPlayer.reverses <= 0) {
                        ws.send(JSON.stringify({ error: 'noreverse', message: 'no reverses left' }));
                        return;
                    }
                    currentPlayer.reverses--;
                    nextOrder = currentPlayer.order - 1;
                    if (nextOrder < 0) {
                        nextOrder = state.players.length - 1;
                    }
                } else {
                    //pass forward when using a shield and there's no explosion
                    nextOrder = (currentPlayer.order + 1) % state.players.length;
                }

                console.log('player ' + currentPlayer.id + ' changed order from ' + currentPlayer.order + ' to ' + nextOrder)
                let nextPlayer = getPlayer('order', nextOrder);

                //if still null, freak out
                state.currentPlayerId = nextPlayer.id;
            }
        } else if (data.type == 'restart') {
            //starting player is the one who just lost
            //state.currentPlayerId = nextPlayer.id;
            state.current = 'game';
            state.gameId = gameId++;
            passesLeft = randInt(5, 7);

            state.players.forEach(p => {
                p.score = 0;
                p.shields = 1;
                p.reverses = 3;
            });
        } else if (data.type == 'view') {
            viewers.push(ws);
        } else {
            console.log('bad type ' + data.type);
            ws.send(JSON.stringify({ error: 'badtype', message: data.type }));
            return;
        }

        response.state = state;
        clients.forEach(c => {
            if (c.readyState !== c.OPEN) { return; }
            c.send(JSON.stringify(response));
        });

        //also push to all viewers
        viewers.forEach(client => {
            if (client.readyState !== client.OPEN) { return; }
            client.send(JSON.stringify(state));
        });
    })

    ws.on('close', () => {
        console.log('connection closed ' + ws.id, + ' players length ' + state.players.length)
        let closedPlayer = state.players.find(p => p.id == ws.id);

        if (!closedPlayer) {
            console.log('closing connection had no player record');
            return;
        }

        closedPlayer.connected = false;

        var response = { type: 'update', id: ws.id, message: 'client left', state: state };
        clients.forEach(c => {
            if (c.readyState !== c.OPEN) { return; }
            c.send(JSON.stringify(response));
        });
    })
})

function getPlayer(k, v) {
    for (var p in state.players) {
        if (state.players.hasOwnProperty(p)) {
            if (state.players[p][k] == v) {
                return state.players[p];
            }
        }
    }
    return null;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

app.listen(80)
console.log('server running on port 80')