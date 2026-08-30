import { textDatabase } from './texts.js';
import AudioEngine from './audio.js';
import TypingGame from './game.js';
import NetworkManager from './network.js';

// app.js
// Maneja la UI y conecta con la red

console.log(`
  _____       _             _______   __ 
 |  __ \\     | |           |  ___\\ \\ / / 
 | |__) |__ _| | _____     | |_   \\ V /  
 |  ___/ _ \\ | |/ / _ \\    |  _|   > <   
 | |  | (_|  |   < (_) |   | |    / . \\  
 |_|   \\__,_|_|\\_\\___/     |_|   /_/ \\_\\ 
                                         
 ¡Hey! Estás revisando el código de Carrera de Caballos.
 🐴 Desarrollado por @Pako_FX 🐴
`);

window.onerror = function(msg, url, lineNo, columnNo, error) {
    alert('Error: ' + msg + '\nLínea: ' + lineNo + '\nColumna: ' + columnNo + '\nArchivo: ' + url);
    return false;
};
window.onunhandledrejection = function(event) {
    alert('Unhandled Promise Rejection: ' + event.reason);
};

document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const screenHome = document.getElementById('screen-home');
    const screenLobby = document.getElementById('screen-lobby');
    const screenGame = document.getElementById('screen-game');
    const screenResults = document.getElementById('screen-results');
    
    const inputNickname = document.getElementById('nickname');
    const inputRoomCode = document.getElementById('room-code-input');
    
    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    
    const displayRoomCode = document.getElementById('display-room-code');
    const playersList = document.getElementById('players-list');
    const horseSelectionGrid = document.getElementById('horse-selection-grid');
    const playerCount = document.getElementById('player-count');
    
    // Modal
    const btnOpenModal = document.getElementById('btn-open-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const modalCaballos = document.getElementById('modal-caballos');
    
    // Chat
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    
    const hostControls = document.getElementById('host-controls');
    const clientControls = document.getElementById('client-controls');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnReady = document.getElementById('btn-ready');
    const btnLeaveRoom = document.getElementById('btn-leave-room');
    const clientWaitingMsg = document.getElementById('client-waiting-msg');
    const lobbyNicknameInput = document.getElementById('lobby-nickname-input');
    const btnChangeName = document.getElementById('btn-change-name');
    const btnCopyCode = document.getElementById('btn-copy-code');
    
    // UI Settings
    const settingRounds = document.getElementById('setting-rounds');
    const settingTimeEasy = document.getElementById('setting-time-easy');
    const settingTimeMode = document.getElementById('setting-time-mode');
    const settingTimeCustom = document.getElementById('setting-time-custom');
    const settingCategory = document.getElementById('setting-category');
    const settingDifficulty = document.getElementById('setting-difficulty');
    const settingLanguage = document.getElementById('setting-language');
    const settingMode = document.getElementById('setting-mode');
    const gameSettingsPanel = document.getElementById('game-settings');
    
    // UI Game
    const roundIndicator = document.getElementById('round-indicator');
    const gameTimer = document.getElementById('game-timer');
    const countdownContainer = document.getElementById('countdown-container');
    const raceTrackContainer = document.getElementById('race-track-container');
    
    const gameOptionsBtn = document.getElementById('game-options-btn');
    const gameOptionsPanel = document.getElementById('game-options-panel');
    const volSlider = document.getElementById('vol-slider');
    const btnAbandon = document.getElementById('btn-abandon');
    
    // UI Results
    const resultsBody = document.getElementById('results-body');
    const btnBackToLobby = document.getElementById('btn-back-to-lobby');
    const nextRoundMsg = document.getElementById('next-round-msg');
    const nextRoundTimer = document.getElementById('next-round-timer');
    
    let isClientReady = false;
    let game = null;
    let autoNextInterval = null;

    // Inicializar NetworkManager pasando los callbacks para actualizar la UI
    const network = new NetworkManager({
        onRoomCreated: (code) => {
            chatMessages.innerHTML = ''; // Limpiar chat anterior
            displayRoomCode.textContent = code;
            hostControls.style.display = 'block';
            clientControls.style.display = 'none';
            cambiarPantalla(screenLobby);
            
            gameSettingsPanel.style.display = 'block';
            settingRounds.disabled = false;
            settingCategory.disabled = false;
            settingMode.disabled = false;
            settingLanguage.disabled = false;
            settingDifficulty.disabled = false;
            
            settingTimeEasy.disabled = false;
            settingTimeMode.disabled = false;
            settingTimeCustom.disabled = false;
            updateTimeUI();
        },
        onJoinedRoom: (code) => {
            chatMessages.innerHTML = ''; // Limpiar chat anterior
            displayRoomCode.textContent = code;
            hostControls.style.display = 'none';
            clientControls.style.display = 'block';
            isClientReady = false;
            btnReady.textContent = 'Estoy Listo';
            btnReady.classList.remove('success');
            btnReady.classList.add('primary');
            clientWaitingMsg.style.display = 'none';
            cambiarPantalla(screenLobby);
            
            gameSettingsPanel.style.display = 'block';
            settingRounds.disabled = true;
            settingTimeEasy.disabled = true;
            settingTimeMode.disabled = true;
            settingTimeCustom.disabled = true;
            settingCategory.disabled = true;
            settingMode.disabled = true;
            settingLanguage.disabled = true;
            settingDifficulty.disabled = true;
        },
        onPlayersUpdated: (players) => {
            actualizarListaJugadores(players);
            
            // Lógica para habilitar el botón de iniciar juego (solo Host)
            if (network.isHost) {
                const clients = players.filter(p => !p.isHost);
                const readyClients = clients.filter(p => p.isReady).length;
                const readyRatio = clients.length > 0 ? (readyClients / clients.length) : 0;
                
                if (clients.length > 0 && readyRatio >= 0.5) {
                    btnStartGame.disabled = false;
                    btnStartGame.textContent = readyRatio === 1 ? 'Iniciar Carrera' : 'Iniciar Carrera (Forzar)';
                } else {
                    btnStartGame.disabled = true;
                    btnStartGame.textContent = `Esperando listos... (${readyClients}/${clients.length})`;
                }
            }
        },
        onError: (err) => {
            alert('Error de conexión: ' + err);
            btnCreateRoom.disabled = false;
            btnJoinRoom.disabled = false;
        },
        onChatMessage: (msg) => {
            renderChatMessage(msg);
        },
        onRoomClosed: () => {
            resetToHome();
        },
        onSettingsUpdate: (settings) => {
            settingRounds.value = settings.totalRounds;
            settingCategory.value = settings.category || 'quotes';
            settingMode.value = settings.mode || 'normal';
            settingLanguage.value = settings.language || 'es';
            settingDifficulty.value = settings.difficulty || 'normal';
            
            updateTimeUI();
            if (settings.difficulty === 'facil') {
                settingTimeEasy.value = settings.timeLimit;
            } else {
                if (settings.timeLimit === 0) {
                    settingTimeMode.value = '0';
                } else {
                    settingTimeMode.value = 'custom';
                    settingTimeCustom.value = settings.timeLimit;
                }
                updateTimeUI();
            }
        },
        onRaceStart: (texto, currentRound, settings) => {
            prepararCarrera(texto, currentRound, settings);
        },
        onRaceUpdate: (players) => {
            actualizarCarrera(players);
        },
        onGameOver: (players, hasNextRound, currentRound, totalRounds) => {
            setTimeout(() => {
                mostrarResultados(players, hasNextRound, currentRound, totalRounds);
            }, 1500);
        }
    });

    // Eventos de Botones
    btnCreateRoom.addEventListener('click', () => {
        AudioEngine.init(); // Iniciar AudioContext
        const nickname = inputNickname.value.trim() || 'Jinete ' + Math.floor(Math.random() * 100);
        btnCreateRoom.disabled = true;
        btnJoinRoom.disabled = true;
        network.crearSala(nickname);
    });

    btnJoinRoom.addEventListener('click', () => {
        AudioEngine.init(); // Iniciar AudioContext
        const nickname = inputNickname.value.trim() || 'Jinete ' + Math.floor(Math.random() * 100);
        const code = inputRoomCode.value.trim();
        if (!code) {
            alert('Introduce un código de sala');
            return;
        }
        btnJoinRoom.disabled = true;
        btnCreateRoom.disabled = true;
        network.unirseSala(nickname, code);
    });

    btnReady.addEventListener('click', () => {
        isClientReady = !isClientReady;
        if (isClientReady) {
            btnReady.textContent = 'No estoy Listo';
            btnReady.classList.remove('primary');
            btnReady.classList.add('success');
            clientWaitingMsg.style.display = 'block';
        } else {
            btnReady.textContent = 'Estoy Listo';
            btnReady.classList.remove('success');
            btnReady.classList.add('primary');
            clientWaitingMsg.style.display = 'none';
        }
        network.toggleReady(isClientReady);
    });

    btnLeaveRoom.addEventListener('click', () => {
        network.desconectar();
        btnJoinRoom.disabled = false;
        btnCreateRoom.disabled = false;
        cambiarPantalla(screenHome);
    });

    btnChangeName.addEventListener('click', () => {
        const newName = lobbyNicknameInput.value.trim();
        if (newName) {
            network.cambiarNombre(newName);
            lobbyNicknameInput.value = '';
            lobbyNicknameInput.placeholder = newName;
        }
    });

    btnCopyCode.addEventListener('click', () => {
        const code = displayRoomCode.textContent;
        if (code && code !== '----') {
            navigator.clipboard.writeText(code).then(() => {
                const originalText = btnCopyCode.innerHTML;
                btnCopyCode.innerHTML = '✅ Copiado!';
                setTimeout(() => {
                    btnCopyCode.innerHTML = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Error al copiar: ', err);
            });
        }
    });

    // Lógica del Modal
    btnOpenModal.addEventListener('click', () => {
        modalCaballos.style.display = 'block';
    });
    btnCloseModal.addEventListener('click', () => {
        modalCaballos.style.display = 'none';
    });
    window.addEventListener('click', (event) => {
        if (event.target === modalCaballos) {
            modalCaballos.style.display = 'none';
        }
    });

    // Lógica del Chat
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const text = chatInput.value.trim();
            if (text && network) {
                network.enviarMensajeChat(text);
                chatInput.value = '';
            }
        }
    });

    function renderChatMessage(msg) {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<span class="author"><span style="display:inline-block; transform:scaleX(-1); filter:${msg.colorFilter || 'none'}; margin-right:5px;">🏇</span>${msg.nickname}${msg.isHost ? ' 👑' : ''}:</span> ${msg.text}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (AudioEngine && AudioEngine.playBeep) AudioEngine.playBeep();
    }

    // Lógica del Panel de Opciones en Juego
    gameOptionsBtn.addEventListener('click', () => {
        if (gameOptionsPanel.style.display === 'none') {
            gameOptionsPanel.style.display = 'block';
        } else {
            gameOptionsPanel.style.display = 'none';
        }
    });

    volSlider.addEventListener('input', (e) => {
        if (AudioEngine) {
            AudioEngine.setVolume(parseFloat(e.target.value));
        }
    });

    btnAbandon.addEventListener('click', () => {
        if (game && !game.isFinished) {
            game.finish(true); // Fuerza DNF
            gameOptionsPanel.style.display = 'none';
        }
    });

    function updateTimeUI() {
        if (settingDifficulty.value === 'facil') {
            settingTimeEasy.style.display = 'inline-block';
            settingTimeMode.style.display = 'none';
            settingTimeCustom.style.display = 'none';
        } else {
            settingTimeEasy.style.display = 'none';
            settingTimeMode.style.display = 'inline-block';
            if (settingTimeMode.value === 'custom') {
                settingTimeCustom.style.display = 'inline-block';
            } else {
                settingTimeCustom.style.display = 'none';
            }
        }
    }

    function syncSettings() {
        if (network.isHost) {
            let timeLimit = 0;
            if (settingDifficulty.value === 'facil') {
                timeLimit = parseInt(settingTimeEasy.value, 10) || 0;
            } else {
                timeLimit = settingTimeMode.value === 'custom' ? parseInt(settingTimeCustom.value, 10) || 0 : 0;
            }
            network.actualizarAjustes({
                totalRounds: parseInt(settingRounds.value, 10) || 1,
                timeLimit: timeLimit,
                language: settingLanguage.value,
                category: settingCategory.value,
                difficulty: settingDifficulty.value,
                mode: settingMode.value
            });
        }
    }
    settingRounds.addEventListener('change', syncSettings);
    settingLanguage.addEventListener('change', syncSettings);
    settingCategory.addEventListener('change', syncSettings);
    
    settingTimeEasy.addEventListener('change', syncSettings);
    settingTimeMode.addEventListener('change', () => {
        if (network.isHost) {
            updateTimeUI();
            syncSettings();
        }
    });
    settingTimeCustom.addEventListener('change', syncSettings);
    
    settingDifficulty.addEventListener('change', () => {
        if (network.isHost) {
            updateTimeUI();
            syncSettings();
        }
    });
    settingMode.addEventListener('change', syncSettings);

    let usedTextsHistory = [];
    function getUniqueRandomText(language, category, difficulty) {
        const db = textDatabase || {};
        const langObj = db[language] || db.es || {};
        const categoryObj = langObj[category] || langObj.quotes || {};
        const pool = categoryObj[difficulty] || categoryObj.normal || ["Texto de prueba."];
        
        if (usedTextsHistory.length >= pool.length) usedTextsHistory = [];
        
        let available = pool.filter(t => !usedTextsHistory.includes(t));
        if (available.length === 0) available = pool;
        
        const randomText = available[Math.floor(Math.random() * available.length)];
        usedTextsHistory.push(randomText);
        return randomText;
    }

    btnStartGame.addEventListener('click', () => {
        if (network.isHost) {
            syncSettings();
            usedTextsHistory = []; // Resetear memoria al iniciar torneo
            const language = settingLanguage.value;
            const category = settingCategory.value;
            const difficulty = settingDifficulty.value;
            const randomText = getUniqueRandomText(language, category, difficulty);
            const currentSettings = {
                totalRounds: parseInt(settingRounds.value) || 1,
                timeLimit: network.gameSettings ? network.gameSettings.timeLimit : 0,
                language: language,
                category: category,
                mode: settingMode.value
            };
            network.iniciarCarrera(randomText, currentSettings);
        }
    });
    
    btnBackToLobby.addEventListener('click', () => {
        if (network.isHost) {
            network.players.forEach(p => p.isReady = false);
            const hostP = network.players.find(p => p.isHost);
            if(hostP) hostP.isReady = true;
            
            network.transmitirATodos({ type: 'PLAYERS_UPDATE', players: network.players });
            network.ui.onPlayersUpdated(network.players);
        } else {
            isClientReady = false;
            btnReady.textContent = 'Estoy Listo';
            btnReady.classList.remove('success');
            btnReady.classList.add('primary');
            clientWaitingMsg.style.display = 'none';
        }
        cambiarPantalla(screenLobby);
    });

    // Desconexión limpia al cerrar la pestaña
    window.addEventListener('beforeunload', () => {
        network.desconectar();
    });

    // Funciones Auxiliares
    function cambiarPantalla(pantallaMostrar) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        pantallaMostrar.classList.add('active');
        
        if (AudioEngine) {
            AudioEngine.stopMusic();
            if (pantallaMostrar === screenLobby || pantallaMostrar === screenHome) {
                AudioEngine.playLobbyMusic();
            } else if (pantallaMostrar === screenResults) {
                AudioEngine.playResultsMusic();
            }
        }
    }

    function actualizarListaJugadores(players) {
        document.getElementById('player-count').textContent = players.length;
        playersList.innerHTML = '';
        
        players.forEach(p => {
            const li = document.createElement('li');
            
            let text = p.nickname;
            if (p.isHost) {
                text += ' 👑';
            }
            
            const nameSpan = document.createElement('span');
            // Mini caballo a la izquierda del nombre
            const miniHorse = document.createElement('span');
            miniHorse.textContent = '🏇';
            miniHorse.style.display = 'inline-block';
            miniHorse.style.transform = 'scaleX(-1)';
            miniHorse.style.marginRight = '8px';
            miniHorse.style.filter = p.colorFilter || 'none';
            
            nameSpan.appendChild(miniHorse);
            nameSpan.appendChild(document.createTextNode(text));
            
            const statusSpan = document.createElement('span');
            if (p.isReady) {
                statusSpan.textContent = '✅ Listo';
                statusSpan.style.color = 'var(--success)';
            } else {
                statusSpan.textContent = '⏳ Esperando';
                statusSpan.style.color = '#ccc';
            }
            statusSpan.style.fontSize = '0.85em';
            
            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            playersList.appendChild(li);
        });

        renderModalGrid(players);
        
        // Activar/desactivar start button
        if (network.isHost) {
            const clients = players.filter(p => !p.isHost);
            const readyClients = clients.filter(p => p.isReady).length;
            const readyRatio = clients.length > 0 ? (readyClients / clients.length) : 0;
            
            if (clients.length > 0 && readyRatio >= 0.5) {
                btnStartGame.disabled = false;
                btnStartGame.textContent = readyRatio === 1 ? 'Iniciar Carrera' : 'Iniciar Carrera (Forzar)';
            } else {
                btnStartGame.disabled = true;
                btnStartGame.textContent = 'Esperando listos... (' + readyClients + '/' + clients.length + ')';
            }
        }
    }

    function renderModalGrid(players) {
        horseSelectionGrid.innerHTML = '';
        const allFilters = network.allFilters || [];
        
        // Identificar al jugador local
        let myPlayerId = null;
        if (network.isHost) {
            myPlayerId = 'host';
        } else if (network.peer) {
            myPlayerId = network.peer.id;
        }

        allFilters.forEach(filterStyle => {
            const card = document.createElement('div');
            card.className = 'horse-card';
            
            const playerOwner = players.find(p => p.colorFilter === filterStyle);
            
            const emojiDiv = document.createElement('div');
            emojiDiv.className = 'emoji';
            emojiDiv.textContent = '🏇';
            emojiDiv.style.filter = filterStyle;
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'player-info';
            
            if (playerOwner) {
                // Caballo ocupado
                infoDiv.textContent = playerOwner.nickname + (playerOwner.isHost ? ' 👑' : '');
                
                if (playerOwner.isReady) {
                    card.style.borderColor = 'var(--success)';
                }
                
                if (playerOwner.id === myPlayerId) {
                    card.classList.add('selected');
                } else {
                    card.classList.add('unavailable');
                }
            } else {
                // Caballo libre
                infoDiv.textContent = 'Libre';
                infoDiv.style.opacity = '0.5';
                
                card.addEventListener('click', () => {
                    network.seleccionarColor(filterStyle);
                    modalCaballos.style.display = 'none'; // Auto cerrar modal al elegir
                });
            }
            
            card.appendChild(emojiDiv);
            card.appendChild(infoDiv);
            horseSelectionGrid.appendChild(card);
        });
    }

    function prepararCarrera(texto, currentRound, settings) {
        cambiarPantalla(screenGame);
        
        if (autoNextInterval) clearInterval(autoNextInterval);
        
        roundIndicator.textContent = `Ronda ${currentRound}/${settings.totalRounds}`;
        
        if (!game) {
            game = new TypingGame({
                onProgress: (percent, state, streak) => {
                    network.enviarProgreso(percent, false, 0, 0, false, state, 0, streak, game.currentIndex);
                },
                onFinish: (wpm, time, disqualified, errors) => {
                    const finalProgress = disqualified ? (game.currentIndex / game.text.length) * 100 : 100;
                    network.enviarProgreso(finalProgress, true, wpm, time, disqualified, 'normal', errors, 0, game.currentIndex);
                },
                onError: () => {
                    network.perderVida();
                }
            });
        }
        
        raceTrackContainer.innerHTML = '';
        const corredores = network.players; // Todos en la sala corren
        
        let currentLeaderId = null;
        if (currentRound > 1) {
            let maxPoints = -1;
            corredores.forEach(p => {
                if (p.totalPoints > maxPoints) {
                    maxPoints = p.totalPoints;
                    currentLeaderId = p.id;
                }
            });
            if (maxPoints === 0) currentLeaderId = null;
        }
        
        // Calcular altura dinámica
        const numPlayers = Math.max(1, corredores.length);
        const trackHeight = Math.max(40, Math.min(100, 450 / numPlayers - 10)); 
        const horseFontSize = trackHeight * 0.7;
        const nameFontSize = Math.min(24, trackHeight * 0.35);
        
        corredores.forEach((p) => {
            const playerRow = document.createElement('div');
            playerRow.className = 'player-row';
            
            const track = document.createElement('div');
            track.className = 'track';
            track.style.height = `${trackHeight}px`;
            
            const name = document.createElement('div');
            name.className = 'track-name';
            name.textContent = p.nickname + ((p.id === currentLeaderId) ? ' 👑' : '');
            name.style.fontSize = `${nameFontSize}px`;
            name.style.fontWeight = 'bold';
            name.style.color = '#c6784d'; // Color base similar al del emoji
            if (p.colorFilter !== undefined) {
                name.style.filter = p.colorFilter;
            }
            
            if (p.maxLives !== undefined) {
                const heartsSpan = document.createElement('span');
                heartsSpan.id = 'hearts-' + p.id;
                heartsSpan.style.marginLeft = '10px';
                let heartsHtml = '';
                for (let i = 0; i < p.maxLives; i++) heartsHtml += '❤️';
                heartsSpan.innerHTML = heartsHtml;
                name.appendChild(heartsSpan);
            }
            
            const horse = document.createElement('div');
            horse.className = 'horse';
            horse.id = 'horse-' + p.id;
            horse.textContent = '🏇';
            horse.style.fontSize = `${horseFontSize}px`;
            if (p.colorFilter !== undefined) {
                horse.style.filter = p.colorFilter;
            }
            
            track.appendChild(horse);
            playerRow.appendChild(name);
            playerRow.appendChild(track);
            raceTrackContainer.appendChild(playerRow);
        });
        
        countdownContainer.style.display = 'block';
        game.textDisplay.style.opacity = '0.3';
        game.textDisplay.innerHTML = 'Prepara tus dedos...';
        
        let count = 3;
        countdownContainer.textContent = count;
        if (AudioEngine) {
            AudioEngine.stopMusic();
            AudioEngine.playCountdownTick();
        }
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownContainer.textContent = count;
                if (AudioEngine) AudioEngine.playCountdownTick();
            } else if (count === 0) {
                countdownContainer.textContent = '¡YA!';
                if (AudioEngine) AudioEngine.playCountdownGo();
            } else {
                clearInterval(interval);
                countdownContainer.style.display = 'none';
                game.textDisplay.style.opacity = '1';
                if (AudioEngine) {
                    AudioEngine.playGo();
                    AudioEngine.playMusic();
                }
                game.start(texto, settings);
                network.enviarProgreso(0, false, 0, 0, false, 'normal', 0, 0, 0);
            }
        }, 1000);
    }

    function actualizarCarrera(corredores) {
        corredores.forEach((p) => {
            const horse = document.getElementById('horse-' + p.id);
            if (horse) {
                horse.style.left = p.progress + '%';
                
                if (p.maxLives !== undefined) {
                    const heartsSpan = document.getElementById('hearts-' + p.id);
                    if (heartsSpan) {
                        let heartsHtml = '';
                        const currentLives = Math.max(0, p.lives);
                        for (let i = 0; i < currentLives; i++) heartsHtml += '❤️';
                        for (let i = currentLives; i < p.maxLives; i++) heartsHtml += '🖤';
                        heartsSpan.innerHTML = heartsHtml;
                    }
                }
                
                // Efectos visuales de estado
                if (p.state === 'nitro') {
                    horse.classList.add('nitro-active');
                    horse.classList.remove('tripped-shake');
                    horse.setAttribute('data-streak', 'x' + (p.streak || 3));
                } else if (p.state === 'tripped') {
                    horse.classList.add('tripped-shake');
                    horse.classList.remove('nitro-active');
                    horse.removeAttribute('data-streak');
                } else {
                    horse.classList.remove('nitro-active', 'tripped-shake');
                    horse.removeAttribute('data-streak');
                }
                
                if (p.disqualified) {
                    if (!horse.hasAttribute('data-dead')) {
                        horse.setAttribute('data-dead', 'true');
                        if (AudioEngine && AudioEngine.playGunshot) {
                            AudioEngine.playGunshot();
                        }
                    }
                    horse.textContent = '💥';
                    horse.style.filter = 'grayscale(1)';
                    horse.classList.remove('nitro-active', 'tripped-shake');
                    horse.removeAttribute('data-streak');
                } else if (p.finished) {
                    horse.textContent = '🏁';
                    horse.style.filter = 'none';
                    horse.classList.remove('nitro-active', 'tripped-shake');
                }
            }
            
            // Lógica de marcador de texto (bolita del contrincante)
            const isMe = (p.id === network.peer.id) || (network.isHost && p.id === 'host');
            if (!isMe && game && game.textDisplay) {
                const charElements = game.textDisplay.children;
                const index = p.currentIndex || 0;
                
                const oldMarker = document.getElementById('marker-' + p.id);
                if (oldMarker) {
                    oldMarker.remove();
                }
                
                if (index >= 0 && index < charElements.length && !p.disqualified && !p.finished) {
                    const marker = document.createElement('div');
                    marker.id = 'marker-' + p.id;
                    marker.className = 'opponent-marker';
                    marker.style.backgroundColor = network.colorMap[p.colorFilter] || '#fff';
                    charElements[index].appendChild(marker);
                }
            }
        });
    }

    function mostrarResultados(players, hasNextRound, currentRound, totalRounds) {
        if (AudioEngine) AudioEngine.stopMusic();
        if (game) game.stopTimer();
        
        cambiarPantalla(screenResults);
        resultsBody.innerHTML = '';
        
        if (autoNextInterval) clearInterval(autoNextInterval);
        
        // Ordenar primero por puntos totales, luego por tiempo si empatan
        const corredores = [...players].sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }
            return a.time - b.time; // Desempate por tiempo (menor es mejor)
        });
        
        corredores.forEach((p, i) => {
            const tr = document.createElement('tr');
            
            let posEmoji = (i + 1) + 'º';
            if (i === 0) posEmoji = '🥇 1º';
            if (i === 1) posEmoji = '🥈 2º';
            if (i === 2) posEmoji = '🥉 3º';
            
            let posChangeHtml = '';
            if (currentRound > 1) {
                const currentPos = i + 1;
                const prevPos = p.prevPos;
                if (currentPos < prevPos) {
                    posChangeHtml = '<span class="pos-change pos-up">🔺' + (prevPos - currentPos) + '</span>';
                } else if (currentPos > prevPos) {
                    posChangeHtml = '<span class="pos-change pos-down">🔻' + (currentPos - prevPos) + '</span>';
                } else {
                    posChangeHtml = '<span class="pos-change pos-same">➖</span>';
                }
            }

            let tiempoMostrado = p.disqualified ? 'DNF' : p.time.toFixed(1) + 's';
            let wpmMostrado = p.disqualified ? '-' : p.wpm;
            let erroresMostrados = p.errors !== undefined ? p.errors : 0;

            tr.innerHTML = `
                <td>${posEmoji} ${posChangeHtml}</td>
                <td><span style="display:inline-block; transform:scaleX(-1); filter:${p.colorFilter || 'none'}; margin-right:5px;">🏇</span>${p.nickname} ${p.isHost ? '👑' : ''}</td>
                <td>${wpmMostrado}</td>
                <td>${tiempoMostrado}</td>
                <td style="color: #e74c3c;">${erroresMostrados}</td>
                <td style="color: var(--success);">+${p.roundPoints}</td>
                <td style="font-weight: bold; color: var(--secondary);">${p.totalPoints} pts</td>
            `;
            resultsBody.appendChild(tr);
        });
        
        if (hasNextRound) {
            btnBackToLobby.style.display = 'none';
            nextRoundMsg.style.display = 'block';
            let timeLeft = 10;
            nextRoundTimer.textContent = timeLeft;
            
            autoNextInterval = setInterval(() => {
                timeLeft--;
                if (timeLeft > 0) {
                    nextRoundTimer.textContent = timeLeft;
                } else {
                    clearInterval(autoNextInterval);
                    if (network.isHost) {
                        const language = network.gameSettings.language || 'es';
                        const category = network.gameSettings.category || 'quotes';
                        const difficulty = network.gameSettings.difficulty || 'normal';
                        const randomText = getUniqueRandomText(language, category, difficulty);
                        network.iniciarCarrera(randomText);
                    }
                }
            }, 1000);
        } else {
            btnBackToLobby.style.display = 'inline-block';
            nextRoundMsg.style.display = 'none';
        }
    }
});
