// network.js
// Maneja toda la lógica P2P con PeerJS

class NetworkManager {
    constructor(uiCallbacks) {
        this.peer = null;
        this.isHost = false;
        this.roomCode = null;
        this.myNickname = '';
        
        // Host state
        this.connections = []; // Lista de conexiones de PeerJS
        this.players = []; // Lista de objetos { id, nickname, isHost, isReady }

        // Cliente state
        this.hostConnection = null;
        this.isDisconnecting = false;
        
        // Torneo state
        this.gameSettings = { timeLimit: 0, totalRounds: 1 };
        this.currentRound = 1;
        this.allFilters = [
            "hue-rotate(0deg) saturate(1.5)",
            "hue-rotate(90deg) saturate(3)",
            "hue-rotate(180deg) saturate(2)",
            "hue-rotate(270deg) saturate(3)",
            "invert(1) hue-rotate(180deg)",
            "sepia(1) saturate(5) hue-rotate(45deg)",
            "brightness(0.2) sepia(1) hue-rotate(180deg)",
            "hue-rotate(320deg) saturate(4)",
            "invert(1) hue-rotate(45deg) saturate(2)",
            "sepia(1) saturate(5) hue-rotate(150deg)",
            "hue-rotate(120deg) brightness(1.5) saturate(2)",
            "invert(1) sepia(1) saturate(5) hue-rotate(280deg)",
            "hue-rotate(45deg) saturate(4)",
            "brightness(2) grayscale(1)",
            "brightness(0.3) contrast(2)",
            "hue-rotate(200deg) saturate(3) brightness(0.8)",
            "sepia(1) hue-rotate(300deg) saturate(5) brightness(1.2)",
            "invert(0.8) hue-rotate(90deg)",
            "hue-rotate(15deg) saturate(5) contrast(1.5)",
            "sepia(0.8) saturate(2) hue-rotate(80deg) brightness(0.9)"
        ];

        // Callbacks a la UI (app.js)
        // onRoomCreated, onJoinedRoom, onPlayersUpdated, onError, onRoomClosed
        // + Nuevos callbacks de carrera: onRaceStart, onRaceUpdate, onGameOver
        this.ui = uiCallbacks; 
    }

    // --- FUNCIONES COMUNES ---

    generarCodigoAleatorio(length = 6) {
        const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let resultado = '';
        for (let i = 0; i < length; i++) {
            resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        return resultado;
    }

    // --- LÓGICA DEL ANFITRIÓN (HOST) ---

    async crearSala(nickname) {
        this.isHost = true;
        this.myNickname = nickname;
        this.roomCode = this.generarCodigoAleatorio();
        
        // En PeerJS, el ID del host será el código de la sala
        // Para evitar colisiones globales, le agregamos un prefijo fijo
        const peerId = `caballos-p2p-${this.roomCode}`;
        
        this.peer = new Peer(peerId);

        this.peer.on('open', (id) => {
            console.log('Sala creada con ID:', id);
            
            // El host es el jugador 1, asume estar listo por defecto
            this.players.push({
                id: 'host',
                nickname: this.myNickname,
                isHost: true,
                isReady: true,
                totalPoints: 0,
                roundPoints: 0,
                prevPos: 0,
                disqualified: false,
                colorFilter: this.allFilters[0]
            });
            
            this.ui.onRoomCreated(this.roomCode);
            this.ui.onPlayersUpdated(this.players);
        });

        this.peer.on('connection', (conn) => {
            console.log('Nueva conexión entrante de:', conn.peer);
            
            if (this.players.length >= 6) {
                // Sala llena, rechazar
                conn.on('open', () => {
                    conn.send({ type: 'ERROR', message: 'La sala está llena' });
                    setTimeout(() => conn.close(), 500);
                });
                return;
            }

            // Guardar conexión
            this.connections.push(conn);

            conn.on('data', (data) => {
                this.manejarMensajeComoHost(conn.peer, data);
            });

            conn.on('close', () => {
                console.log('Conexión cerrada:', conn.peer);
                this.eliminarJugador(conn.peer);
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            alert('Error en la red: ' + err.type);
            this.ui.onError();
        });
    }

    manejarMensajeComoHost(peerId, data) {
        if (data.type === 'JOIN') {
            // Un cliente envía su nombre
            console.log(`Jugador unido: ${data.nickname} (${peerId})`);
            
            // Asignar el primer color disponible
            const coloresUsados = this.players.map(p => p.colorFilter);
            const colorDisponible = this.allFilters.find(c => !coloresUsados.includes(c)) || this.allFilters[0];
            
            this.players.push({
                id: peerId,
                nickname: data.nickname,
                isHost: false,
                isReady: false,
                totalPoints: 0,
                roundPoints: 0,
                prevPos: 0,
                disqualified: false,
                colorFilter: colorDisponible
            });
            
            // Actualizar UI del Host
            this.ui.onPlayersUpdated(this.players);
            
            // Mandar ajustes actuales al que se acaba de unir
            this.transmitirATodos({
                type: 'SETTINGS_UPDATE',
                settings: this.gameSettings
            });
            // Avisar a todos los clientes conectados el nuevo estado de la sala
            this.transmitirATodos({
                type: 'PLAYERS_UPDATE',
                players: this.players
            });
        } else if (data.type === 'CHAT_MSG') {
            const player = this.players.find(p => p.id === peerId);
            if (player) {
                const msgData = {
                    type: 'CHAT_MSG',
                    nickname: player.nickname,
                    text: data.text,
                    isHost: false,
                    colorFilter: player.colorFilter
                };
                this.transmitirATodos(msgData);
                if (this.ui && this.ui.onChatMessage) {
                    this.ui.onChatMessage(msgData);
                }
            }
        } else if (data.type === 'SELECT_COLOR') {
            const player = this.players.find(p => p.id === peerId);
            if (player) {
                const colorTaken = this.players.some(p => p.colorFilter === data.colorFilter && p.id !== peerId);
                if (!colorTaken && this.allFilters.includes(data.colorFilter)) {
                    player.colorFilter = data.colorFilter;
                    this.transmitirATodos({ type: 'PLAYERS_UPDATE', players: this.players });
                    this.ui.onPlayersUpdated(this.players);
                }
            }
        } else if (data.type === 'READY_TOGGLE') {
            const player = this.players.find(p => p.id === peerId);
            if (player) {
                player.isReady = data.isReady;
                this.ui.onPlayersUpdated(this.players);
                this.transmitirATodos({
                    type: 'PLAYERS_UPDATE',
                    players: this.players
                });
            }
        } else if (data.type === 'CHANGE_NAME') {
            const player = this.players.find(p => p.id === peerId);
            if (player) {
                player.nickname = data.nickname;
                this.ui.onPlayersUpdated(this.players);
                this.transmitirATodos({
                    type: 'PLAYERS_UPDATE',
                    players: this.players
                });
            }
        } else if (data.type === 'PROGRESS') {
            const player = this.players.find(p => p.id === peerId);
            if (player) {
                player.progress = data.progress;
                player.state = data.state || 'normal';
                if (data.finished) {
                    player.finished = true;
                    player.wpm = data.wpm;
                    player.time = data.time;
                    player.disqualified = data.disqualified;
                }
                
                this.transmitirATodos({
                    type: 'RACE_UPDATE',
                    players: this.players
                });
                
                this.ui.onRaceUpdate(this.players);
                
                if (data.finished) {
                    this.comprobarFinDeCarrera();
                }
            }
        }
    }

    actualizarAjustes(nuevosAjustes) {
        if (!this.isHost) return;
        this.gameSettings = nuevosAjustes;
        this.currentRound = 1; // reset si cambian ajustes
        
        this.transmitirATodos({
            type: 'SETTINGS_UPDATE',
            settings: this.gameSettings
        });
    }

    iniciarCarrera(texto) {
        if (!this.isHost) return;
        
        // Resetear progreso y puntos de ronda actual
        this.players.forEach(p => {
            p.progress = 0;
            p.finished = false;
            p.wpm = 0;
            p.time = 0;
            p.roundPoints = 0;
            p.disqualified = false;
            if (this.currentRound === 1) {
                p.totalPoints = 0;
                p.prevPos = undefined;
            }
        });

        this.transmitirATodos({
            type: 'START_RACE',
            text: texto,
            players: this.players,
            currentRound: this.currentRound,
            settings: this.gameSettings
        });
        
        this.ui.onRaceStart(texto, this.currentRound, this.gameSettings);
        this.ui.onRaceUpdate(this.players);
    }

    comprobarFinDeCarrera() {
        if (!this.isHost) return;
        
        // Todos los jugadores en la sala participan
        const corredores = this.players;
        const todosTerminaron = corredores.every(p => p.finished);
        
        if (todosTerminaron) {
            // Guardar posiciones previas
            let jugadoresOrdenados = [...this.players].sort((a, b) => b.totalPoints - a.totalPoints);
            jugadoresOrdenados.forEach((p, index) => {
                p.prevPos = index + 1;
            });
            
            // Asignar puntos F1 a los que no están descalificados
            const puntosF1 = [25, 18, 15, 12, 10, 8];
            let clasificados = this.players.filter(p => !p.disqualified).sort((a, b) => a.time - b.time);
            
            clasificados.forEach((p, i) => {
                const ptos = puntosF1[i] || 0;
                p.roundPoints = ptos;
                p.totalPoints += ptos;
            });
            
            // Los descalificados se quedan con 0 en ronda (ya seteado)
            
            const hasNextRound = this.currentRound < this.gameSettings.totalRounds;

            this.transmitirATodos({
                type: 'GAME_OVER',
                players: this.players,
                hasNextRound: hasNextRound,
                currentRound: this.currentRound,
                totalRounds: this.gameSettings.totalRounds
            });
            this.ui.onGameOver(this.players, hasNextRound, this.currentRound, this.gameSettings.totalRounds);
            
            if (hasNextRound) {
                this.currentRound++;
            }
        }
    }

    transmitirATodos(mensaje) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(mensaje);
            }
        });
    }

    eliminarJugador(peerId) {
        this.connections = this.connections.filter(c => c.peer !== peerId);
        this.players = this.players.filter(p => p.id !== peerId);
        this.ui.onPlayersUpdated(this.players);
        this.transmitirATodos({
            type: 'PLAYERS_UPDATE',
            players: this.players
        });
        this.comprobarFinDeCarrera(); // Re-evaluar fin de carrera si alguien sale
    }


    // --- LÓGICA DEL CLIENTE ---

    async unirseSala(nickname, roomCode) {
        this.isHost = false;
        this.myNickname = nickname;
        this.roomCode = roomCode.toUpperCase();
        
        const hostPeerId = `caballos-p2p-${this.roomCode}`;
        
        // El cliente no necesita un ID específico, PeerJS le asignará uno aleatorio
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            console.log('Conectado al servidor de señalización con ID:', id);
            
            // Conectar al Host
            this.hostConnection = this.peer.connect(hostPeerId, { reliable: true });

            this.hostConnection.on('open', () => {
                console.log('Conectado al Host!');
                this.ui.onJoinedRoom(this.roomCode);
                
                // Enviar nuestro nombre al Host
                this.hostConnection.send({
                    type: 'JOIN',
                    nickname: this.myNickname
                });
            });

            this.hostConnection.on('data', (data) => {
                this.manejarMensajeComoCliente(data);
            });

            this.hostConnection.on('close', () => {
                if (!this.isDisconnecting) {
                    alert('Conexión con el anfitrión perdida.');
                    this.ui.onRoomClosed();
                }
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                alert('No se encontró la sala. Comprueba el código.');
            } else {
                alert('Error al unirse: ' + err.type);
            }
            this.ui.onError();
        });
    }
    
    // --- ACCIONES DEL CLIENTE ---
    
    toggleReady(isReady) {
        if (!this.isHost && this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({
                type: 'READY_TOGGLE',
                isReady: isReady
            });
        }
    }

    desconectar() {
        this.isDisconnecting = true;
        if (this.isHost) {
            this.transmitirATodos({ type: 'ROOM_CLOSED' });
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.hostConnection = null;
        this.connections = [];
        this.players = [];
        this.isHost = false;
        this.roomCode = null;
        this.isDisconnecting = false;
    }

    cambiarNombre(nuevoNombre) {
        this.myNickname = nuevoNombre;
        if (this.isHost) {
            const myPlayer = this.players.find(p => p.isHost);
            if (myPlayer) {
                myPlayer.nickname = nuevoNombre;
                this.ui.onPlayersUpdated(this.players);
                this.transmitirATodos({
                    type: 'PLAYERS_UPDATE',
                    players: this.players
                });
            }
        } else if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({
                type: 'CHANGE_NAME',
                nickname: nuevoNombre
            });
        }
    }

    seleccionarColor(colorFilter) {
        if (!this.allFilters.includes(colorFilter)) return;
        
        if (this.isHost) {
            const colorTaken = this.players.some(p => p.colorFilter === colorFilter && !p.isHost);
            if (!colorTaken) {
                const myPlayer = this.players.find(p => p.isHost);
                if (myPlayer) {
                    myPlayer.colorFilter = colorFilter;
                    this.transmitirATodos({ type: 'PLAYERS_UPDATE', players: this.players });
                    this.ui.onPlayersUpdated(this.players);
                }
            }
        } else if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({
                type: 'SELECT_COLOR',
                colorFilter: colorFilter
            });
        }
    }

    enviarMensajeChat(text) {
        if (this.isHost) {
            const myPlayer = this.players.find(p => p.isHost);
            const msgData = {
                type: 'CHAT_MSG',
                nickname: myPlayer ? myPlayer.nickname : 'Host',
                text: text,
                isHost: true,
                colorFilter: myPlayer ? myPlayer.colorFilter : 'none'
            };
            this.transmitirATodos(msgData);
            if (this.ui && this.ui.onChatMessage) {
                this.ui.onChatMessage(msgData);
            }
        } else if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({
                type: 'CHAT_MSG',
                text: text
            });
        }
    }

    enviarProgreso(progreso, isFinished = false, wpm = 0, time = 0, disqualified = false, state = 'normal') {
        if (this.isHost) {
            const myPlayer = this.players.find(p => p.isHost);
            if (myPlayer) {
                myPlayer.progress = progreso;
                myPlayer.state = state;
                if (isFinished) {
                    myPlayer.finished = true;
                    myPlayer.wpm = wpm;
                    myPlayer.time = time;
                    myPlayer.disqualified = disqualified;
                }
                this.transmitirATodos({
                    type: 'RACE_UPDATE',
                    players: this.players
                });
                this.ui.onRaceUpdate(this.players);
                if (isFinished) this.comprobarFinDeCarrera();
            }
        } else if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({
                type: 'PROGRESS',
                progress: progreso,
                finished: isFinished,
                wpm: wpm,
                time: time,
                disqualified: disqualified,
                state: state
            });
        }
    }

    manejarMensajeComoCliente(data) {
        if (data.type === 'PLAYERS_UPDATE') {
            this.players = data.players;
            this.ui.onPlayersUpdated(this.players);
        } else if (data.type === 'ERROR') {
            alert(data.message);
            location.reload();
        } else if (data.type === 'ROOM_CLOSED') {
            this.isDisconnecting = true;
            alert('El anfitrión ha cerrado la sala.');
            this.ui.onRoomClosed();
            this.isDisconnecting = false;
        } else if (data.type === 'CHAT_MSG') {
            if (this.ui.onChatMessage) {
                this.ui.onChatMessage(data);
            }
        } else if (data.type === 'START_RACE') {
            this.players = data.players;
            this.currentRound = data.currentRound;
            this.gameSettings = data.settings;
            this.ui.onRaceStart(data.text, this.currentRound, this.gameSettings);
            this.ui.onRaceUpdate(this.players);
        } else if (data.type === 'RACE_UPDATE') {
            this.players = data.players;
            this.ui.onRaceUpdate(this.players);
        } else if (data.type === 'GAME_OVER') {
            this.players = data.players;
            this.currentRound = data.hasNextRound ? data.currentRound + 1 : data.currentRound;
            this.ui.onGameOver(this.players, data.hasNextRound, data.currentRound, data.totalRounds);
        } else if (data.type === 'SETTINGS_UPDATE') {
            this.gameSettings = data.settings;
            if (this.ui.onSettingsUpdate) this.ui.onSettingsUpdate(this.gameSettings);
        }
    }
}
