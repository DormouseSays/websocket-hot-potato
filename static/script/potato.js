//TODO separate components for each 'state' ?

var app = new Vue({
    el: '#app',
    data: {
        userId: 0,
        gameId: 0,
        name: null,
        message: 'Hello Vue!',
        errorMessage: null,
        socketReady: false,
        ready: false,
        readyMessage: '',
        order: null,
        state: 'lobby',
        players: [],
        score: 0,
        shields: 0,
        reverses: 0
    },
    computed: {
        allReady: function () {
            return this.players.length > 1 && this.players.find(p => !p.ready) == null;
        },
        playerCount: function () {
            return this.players.length;
        }
    },
    created: function () {
        console.log('created')
    },
    methods: {
        onSocketReady: function () {
            console.log('socket ready')
            this.socketReady = true;
            // `this` points to the vm instance
            var savedName = storage.get('username');
            var savedGameId = storage.get('gameid');

            if (savedGameId != null && savedGameId > 0) {
                this.state = 'loading';
                this.name = savedName;
                this.gameId = savedGameId;
                //trigger rejoin call
                socket.send(JSON.stringify({ type: 'join', gameId: this.gameId, name: this.name }));

            } else if (savedName) {
                //move to next state
                this.name = savedName;
                this.ready = true;
                socket.send(JSON.stringify({ type: 'join', name: this.name }));
            }
            console.log('started app with name ' + this.name + ' and game ' + this.gameId)
        },
        onJoin: function () {
            this.readyMessage = '';
            if (!this.name) {
                //gotta set name first
                this.readyMessage = 'You must set your name to join';
                return;
            }

            this.ready = true;
            storage.set('username', this.name)

            socket.send(JSON.stringify({ type: 'join', data: this.ready, name: this.name }));
        },
        onStart: function () {
            socket.send(JSON.stringify({ type: 'start' }));
        },
        onOrder: function () {
            socket.send(JSON.stringify({ type: 'order' }));
        },
        onPass: function () {
            socket.send(JSON.stringify({ type: 'pass' }));
        },
        onRestart: function () {
            socket.send(JSON.stringify({ type: 'restart' }));
        },
        onShield: function () {
            socket.send(JSON.stringify({ type: 'shield' }));
        },
        onReverse: function () {
            socket.send(JSON.stringify({ type: 'reverse' }));
        },
        onMessage: function (msg) {
            var data = JSON.parse(msg);
            this.errorMessage = null;
            console.log('app onMessage ', data)

            if (data.type == 'welcome') {
                console.log('welcome stuff ', data)
                this.userId = data.id;
            } else if (data.error) {
                this.errorMessage = data.message;
                console.log('data error, type ' + data.error)
                if (data.error == 'wronggame') {
                    //blow away saved stuff, update
                    storage.remove('username');
                    storage.remove('gameid');
                }
            } else if (data.type == 'failure') {
                this.state = 'failure';
            } else if (data.state) {
                var updatedPlayers = [];
                for (var k in data.state.players) {
                    if (data.state.players.hasOwnProperty(k)) {
                        updatedPlayers.push(data.state.players[k]);
                        if (data.state.players[k].id == this.userId) {
                            //update current players data
                            this.order = data.state.players[k].order;
                            this.shields = data.state.players[k].shields;
                            this.reverses = data.state.players[k].reverses;
                            this.score = data.state.players[k].score;
                        }
                    }
                }

                this.players = updatedPlayers;
                this.state = data.state.current;
                this.currentPlayerId = data.state.currentPlayerId;

                if (typeof data.state.gameId == 'number' && data.state.gameId != this.gameId) {
                    this.gameId = data.state.gameId;
                    storage.set('gameid', this.gameId);
                }
            }

        }
    }
});

// wss: protocol is equivalent of https: 
// ws:  protocol is equivalent of http:
// You ALWAYS need to provide absolute address, not just relative path like /api
const socket = new WebSocket('ws://' + window.location.hostname + '/api');

socket.onopen = () => {
    //socket.send(JSON.stringify({ message: 'someone joined', type: 'join', data: 'player' }));
    app.onSocketReady();
}

socket.onmessage = e => {
    app.onMessage(event.data);
}

// //override console
// console = {}
// var logDiv = document.getElementById('log');
// console.log = function () {
//     //append all arguments
//     for (var i = 0, j = arguments.length; i < j; i++) {
//         logDiv.innerHTML += '<div>' + arguments[i] + '</div>';
//     }
// }
// console.error = console.log;
