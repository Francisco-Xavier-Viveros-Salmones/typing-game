// app.js
// Maneja la UI y conecta con la red

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
    const settingTime = document.getElementById('setting-time');
    const settingCategory = document.getElementById('setting-category');
    const settingDifficulty = document.getElementById('setting-difficulty');
    const settingLanguage = document.getElementById('setting-language');
    const settingMode = document.getElementById('setting-mode');
    const gameSettingsPanel = document.getElementById('game-settings');

    // Base de datos de Textos (Múltiples idiomas y niveles)
    const textDatabase = {
        es: {
            quotes: {
                facil: [
                    "El sol brilla.", "La vida es bella.", "El agua fluye.", "Respira hondo.", "Sonríe siempre."
                ],
                normal: [
                    "No cuentes los días, haz que los días cuenten.",
                    "El único modo de hacer un gran trabajo es amar lo que haces.",
                    "La paciencia es amarga, pero su fruto es dulce.",
                    "Lo que no te mata te hace más fuerte.",
                    "El conocimiento es poder, pero la imaginación es más importante."
                ],
                dificil: [
                    "En la profundidad del invierno, finalmente aprendí que había en mí un verano invencible.",
                    "La verdadera sabiduría está en reconocer la propia ignorancia frente a la inmensidad del universo.",
                    "Aquellos que no pueden recordar el pasado están condenados a repetirlo constantemente.",
                    "No es la especie más fuerte la que sobrevive, sino la que mejor responde al cambio.",
                    "Si buscas resultados distintos, no hagas siempre lo mismo; la locura es hacer lo mismo esperando resultados diferentes."
                ]
            },
            jokes: {
                facil: [
                    "¿Qué hace un pez? Nada.", "¡Hola, soy yo!", "Tengo sueño.", "Me duele el pie.", "No me mires."
                ],
                normal: [
                    "¿Qué le dice un código a otro? No me hables que estoy comentando.",
                    "Había una vez un perro que se llamaba Pegamento. Se cayó y se pegó.",
                    "¿Por qué los pájaros no usan Facebook? Porque ya tienen Twitter.",
                    "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
                    "¿Cuál es el colmo de un electricista? Que su esposa se llame Luz."
                ],
                dificil: [
                    "¿Qué le dice un servidor web hiperactivo a su cliente? ¡Toma un Error 503: Servicio no disponible!",
                    "Un SQL entra a un bar, se acerca a dos mesas y pregunta: '¿Me puedo unir a ustedes?'",
                    "¿Por qué los programadores prefieren el modo oscuro? ¡Porque la luz atrae a los bugs (bichos)!",
                    "Hay 10 tipos de personas en este mundo: las que entienden binario y las que no.",
                    "Un programador tenía un problema, decidió usar expresiones regulares... ¡ahora tiene dos problemas!"
                ]
            },
            code: {
                facil: [
                    "let x = 5;", "const y = 10;", "var z = x + y;", "console.log(z);", "return true;"
                ],
                normal: [
                    "function isEven(n) { return n % 2 === 0; }",
                    "const array = [1, 2, 3].map(x => x * 2);",
                    "document.getElementById('btn').addEventListener('click', () => {});",
                    "while (true) { console.log('Bucle infinito'); }",
                    "let names = users.filter(u => u.active).map(u => u.name);"
                ],
                dificil: [
                    "const fibonacci = n => n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2);",
                    "export default class MyComponent extends React.PureComponent { render() { return <div />; } }",
                    "app.get('/api/users/:id', async (req, res, next) => { try { res.json(await User.findById(req.params.id)); } catch(e) { next(e); } });",
                    "document.querySelectorAll('.item').forEach((el, i) => el.style.transform = `translateY(${i * 20}px)`);",
                    "const regex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/i;"
                ]
            },
            tongue: {
                facil: [
                    "Pepe pecas pica papas.", "Tres tristes tigres.", "Pablito clavó un clavito.", "El cielo es azul.", "Gallo y grillo."
                ],
                normal: [
                    "Tres tristes tigres tragaban trigo en un trigal.",
                    "Cuando cuentes cuentos, cuenta cuántos cuentos cuentas.",
                    "Pablito clavó un clavito en la calva de un calvito.",
                    "El perro de San Roque no tiene rabo porque Ramón Ramírez se lo ha robado.",
                    "Me han dicho un dicho, que dicen que he dicho yo."
                ],
                dificil: [
                    "El cielo está encapotado, ¿quién lo desencapotará? El desencapotador que lo desencapote, buen desencapotador será.",
                    "El arzobispo de Constantinopla se quiere desconstantinopolizar, el desconstantinopolizador que lo desconstantinopolizare buen desconstantinopolizador será.",
                    "Parangaricutirimícuaro es un pueblo que me cuesta pronunciar, si lo pronuncio mal en Parangaricutirimícuaro me voy a quedar.",
                    "Si la col tuviera cara como tiene el caracol, fuera cara, fuera col, fuera cara de caracol con col.",
                    "Compró Paco pocas copas y, como pocas copas compró Paco, Paco pocas copas pagó."
                ]
            }
        },
        en: {
            quotes: {
                facil: [
                    "The sun is shining.", "Life is beautiful.", "Water flows.", "Take a deep breath.", "Always smile."
                ],
                normal: [
                    "Don't count the days, make the days count.",
                    "The only way to do great work is to love what you do.",
                    "Patience is bitter, but its fruit is sweet.",
                    "What doesn't kill you makes you stronger.",
                    "Knowledge is power, but imagination is more important."
                ],
                dificil: [
                    "In the depth of winter, I finally learned that within me there lay an invincible summer.",
                    "True wisdom is in knowing you know nothing when facing the vastness of the universe.",
                    "Those who cannot remember the past are condemned to repeat it constantly.",
                    "It is not the strongest of the species that survives, but the one most responsive to change.",
                    "If you want different results, do not do the same things; insanity is doing the same thing expecting different results."
                ]
            },
            jokes: {
                facil: [
                    "What does a fish do? Nothing.", "Hello, it's me!", "I am sleepy.", "My foot hurts.", "Don't look at me."
                ],
                normal: [
                    "Why do programmers prefer dark mode? Because light attracts bugs.",
                    "There are 10 types of people in the world: those who understand binary, and those who don't.",
                    "Why do birds not use Facebook? Because they already use Twitter.",
                    "What do you call a fake noodle? An impasta.",
                    "Why did the scarecrow win an award? Because he was outstanding in his field."
                ],
                dificil: [
                    "A SQL query goes into a bar, walks up to two tables and asks: 'Can I join you?'",
                    "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
                    "Some people, when confronted with a problem, think 'I know, I'll use regular expressions.' Now they have two problems.",
                    "Knock, knock. Race condition. Who's there?",
                    "A programmer had a problem, decided to use threads... now two they problems have."
                ]
            },
            code: {
                facil: [
                    "let a = 1;", "const b = 2;", "var c = a + b;", "console.log(c);", "return false;"
                ],
                normal: [
                    "function isOdd(n) { return n % 2 !== 0; }",
                    "const evens = [1, 2, 3, 4].filter(x => x % 2 === 0);",
                    "document.querySelector('.btn').addEventListener('click', e => e.preventDefault());",
                    "for (let i = 0; i < 10; i++) { console.log(i); }",
                    "const names = users.filter(u => !u.deleted).map(u => u.username);"
                ],
                dificil: [
                    "const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);",
                    "export default function App() { const [count, setCount] = useState(0); return <button onClick={() => setCount(c => c+1)}>{count}</button>; }",
                    "app.post('/api/auth/login', async (req, res) => { const user = await User.findOne({ email: req.body.email }); res.json({ token }); });",
                    "const observer = new IntersectionObserver((entries) => { entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')); });",
                    "const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*$/;"
                ]
            },
            tongue: {
                facil: [
                    "I scream, you scream.", "Red lorry, yellow lorry.", "She sells seashells.", "Six sticky skeletons.", "Good blood, bad blood."
                ],
                normal: [
                    "I scream, you scream, we all scream for ice cream.",
                    "She sells seashells by the seashore.",
                    "How much wood would a woodchuck chuck if a woodchuck could chuck wood?",
                    "Peter Piper picked a peck of pickled peppers.",
                    "Fuzzy Wuzzy was a bear, Fuzzy Wuzzy had no hair."
                ],
                dificil: [
                    "If a woodchuck could chuck wood, a woodchuck would chuck all the wood he could chuck.",
                    "The sixth sick sheik's sixth sheep's sick.",
                    "Pad kid poured curd pulled cod.",
                    "Betty Botter bought some butter but, said she, the butter's bitter.",
                    "If two witches would watch two watches, which witch would watch which watch?"
                ]
            }
        }
    };
    
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
            displayRoomCode.textContent = code;
            hostControls.style.display = 'block';
            clientControls.style.display = 'none';
            cambiarPantalla(screenLobby);
            
            gameSettingsPanel.style.display = 'block';
            settingRounds.disabled = false;
            settingTime.disabled = false;
            settingCategory.disabled = false;
            settingMode.disabled = false;
        },
        onJoinedRoom: (code) => {
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
            settingTime.disabled = true;
            settingCategory.disabled = true;
            settingMode.disabled = true;
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
            settingTime.value = settings.timeLimit;
            settingCategory.value = settings.category || 'quotes';
            settingMode.value = settings.mode || 'normal';
        },
        onRaceStart: (texto, currentRound, settings) => {
            prepararCarrera(texto, currentRound, settings);
        },
        onRaceUpdate: (players) => {
            actualizarCarrera(players);
        },
        onGameOver: (players, hasNextRound, currentRound, totalRounds) => {
            mostrarResultados(players, hasNextRound, currentRound, totalRounds);
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
        if (window.AudioEngine) {
            AudioEngine.setVolume(parseFloat(e.target.value));
        }
    });

    btnAbandon.addEventListener('click', () => {
        if (game && !game.isFinished) {
            game.finish(true); // Fuerza DNF
            gameOptionsPanel.style.display = 'none';
        }
    });

    // Lógica para enviar settings si soy Host
    function syncSettings() {
        if (network.isHost) {
            network.actualizarAjustes({
                totalRounds: parseInt(settingRounds.value),
                timeLimit: parseInt(settingTime.value),
                language: settingLanguage.value,
                category: settingCategory.value,
                difficulty: settingDifficulty.value,
                mode: settingMode.value
            });
        }
    }
    settingRounds.addEventListener('change', syncSettings);
    settingTime.addEventListener('change', syncSettings);
    settingLanguage.addEventListener('change', syncSettings);
    settingCategory.addEventListener('change', syncSettings);
    settingDifficulty.addEventListener('change', syncSettings);
    settingMode.addEventListener('change', syncSettings);

    let usedTextsHistory = [];
    function getUniqueRandomText(language, category, difficulty) {
        const langObj = textDatabase[language] || textDatabase.es;
        const categoryObj = langObj[category] || langObj.quotes;
        const pool = categoryObj[difficulty] || categoryObj.normal;
        
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
                timeLimit: parseInt(settingTime.value) || 0,
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
                onProgress: (percent, state) => {
                    network.enviarProgreso(percent, false, 0, 0, false, state);
                },
                onFinish: (wpm, time, disqualified) => {
                    network.enviarProgreso(100, true, wpm, time, disqualified, 'normal');
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
            const track = document.createElement('div');
            track.className = 'track';
            track.style.height = `${trackHeight}px`;
            
            const name = document.createElement('div');
            name.className = 'track-name';
            name.textContent = p.nickname + (p.isHost ? ' 👑' : '');
            name.style.fontSize = `${nameFontSize}px`;
            name.style.fontWeight = 'bold';
            name.style.color = '#c6784d'; // Color base similar al del emoji
            if (p.colorFilter !== undefined) {
                name.style.filter = p.colorFilter;
            }
            
            const horse = document.createElement('div');
            horse.className = 'horse';
            horse.id = 'horse-' + p.id;
            horse.textContent = (p.id === currentLeaderId) ? '👑🏇' : '🏇';
            horse.style.fontSize = `${horseFontSize}px`;
            if (p.colorFilter !== undefined) {
                horse.style.filter = p.colorFilter;
            }
            
            track.appendChild(name);
            track.appendChild(horse);
            raceTrackContainer.appendChild(track);
        });
        
        countdownContainer.style.display = 'block';
        game.textDisplay.style.opacity = '0.3';
        game.textDisplay.innerHTML = 'Prepara tus dedos...';
        
        let count = 3;
        countdownContainer.textContent = count;
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownContainer.textContent = count;
            } else if (count === 0) {
                countdownContainer.textContent = '¡YA!';
            } else {
                clearInterval(interval);
                countdownContainer.style.display = 'none';
                game.textDisplay.style.opacity = '1';
                if (window.AudioEngine) {
                    AudioEngine.playGo();
                    AudioEngine.playMusic();
                }
                game.start(texto, settings);
            }
        }, 1000);
    }

    function actualizarCarrera(corredores) {
        corredores.forEach((p) => {
            const horse = document.getElementById('horse-' + p.id);
            if (horse) {
                horse.style.left = p.progress + '%';
                
                // Efectos visuales de estado
                if (p.state === 'nitro') {
                    horse.classList.add('nitro-active');
                    horse.classList.remove('tripped-shake');
                } else if (p.state === 'tripped') {
                    horse.classList.add('tripped-shake');
                    horse.classList.remove('nitro-active');
                } else {
                    horse.classList.remove('nitro-active', 'tripped-shake');
                }
                
                if (p.disqualified) {
                    horse.textContent = '💀';
                    horse.style.filter = 'grayscale(1)';
                    horse.classList.remove('nitro-active', 'tripped-shake');
                } else if (p.finished) {
                    horse.textContent = '🏁';
                    horse.style.filter = 'none';
                    horse.classList.remove('nitro-active', 'tripped-shake');
                }
            }
        });
    }

    function mostrarResultados(players, hasNextRound, currentRound, totalRounds) {
        if (window.AudioEngine) AudioEngine.stopMusic();
        
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

            tr.innerHTML = `
                <td>${posEmoji} ${posChangeHtml}</td>
                <td><span style="display:inline-block; transform:scaleX(-1); filter:${p.colorFilter || 'none'}; margin-right:5px;">🏇</span>${p.nickname} ${p.isHost ? '👑' : ''}</td>
                <td>${wpmMostrado}</td>
                <td>${tiempoMostrado}</td>
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
