// game.js
// Maneja la lógica local de mecanografía, validación y cálculos.

class TypingGame {
    constructor(uiCallbacks) {
        this.text = "";
        this.currentIndex = 0;
        this.startTime = null;
        this.endTime = null;
        this.isFinished = false;
        
        // Elementos UI
        this.textDisplay = document.getElementById('text-display');
        this.hiddenInput = document.getElementById('hidden-input');
        
        this.ui = uiCallbacks; // { onProgress, onFinish, onStateChange }
        
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleInputClick = this.handleInputClick.bind(this);
    }

    start(textToType, settings = { timeLimit: 0, mode: 'normal' }) {
        this.text = textToType;
        this.currentIndex = 0;
        this.startTime = Date.now();
        this.endTime = null;
        this.isFinished = false;
        this.timeLimit = settings.timeLimit || 0;
        this.mode = settings.mode || 'normal';
        this.streak = 0;
        this.errorsOnWord = 0;
        this.isTripped = false;
        this.state = 'normal'; // 'normal', 'nitro', 'tripped'
        
        this.timerElement = document.getElementById('game-timer');
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        if (this.timeLimit > 0) {
            this.timerElement.style.display = 'inline';
            this.updateTimerDisplay(this.timeLimit);
            
            this.timerInterval = setInterval(() => {
                if (this.isFinished) return;
                const elapsed = (Date.now() - this.startTime) / 1000;
                const remaining = Math.max(0, this.timeLimit - elapsed);
                this.updateTimerDisplay(remaining);
                
                if (remaining === 0) {
                    this.finish(true);
                }
            }, 100);
        } else {
            this.timerElement.style.display = 'none';
        }
        
        this.renderText();
        
        // Listeners para móviles/foco
        // Listeners
        this.textDisplay.addEventListener('click', this.handleInputClick);
        this.hiddenInput.addEventListener('input', this.handleInput.bind(this));
        this.hiddenInput.addEventListener('blur', () => this.textDisplay.classList.remove('focused'));
        this.hiddenInput.addEventListener('focus', () => this.textDisplay.classList.add('focused'));
        
        // Listener global de teclado (principalmente para PC para Backspace)
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Foco inicial
        this.handleInputClick();
    }

    stop() {
        document.removeEventListener('keydown', this.handleKeyDown);
        this.textDisplay.removeEventListener('click', this.handleInputClick);
    }

    handleInputClick() {
        if (!this.isFinished) {
            this.hiddenInput.focus();
        }
    }

    handleInput(e) {
        // En PC y móviles, el input hidden recibe el texto.
        // Tomamos todos los caracteres insertados.
        const val = this.hiddenInput.value;
        if (val.length > 0 && !this.isFinished) {
            for (let i = 0; i < val.length; i++) {
                if (this.isFinished) break;
                this.processChar(val[i]);
            }
            this.hiddenInput.value = ''; // limpiar
        }
    }

    handleKeyDown(e) {
        if (this.isFinished || this.isTripped) return;
        
        // Enfocar automáticamente el input oculto
        this.hiddenInput.focus();

        if (e.key === 'Backspace') {
            if (this.currentIndex > 0) {
                this.currentIndex--;
                const charElements = this.textDisplay.querySelectorAll('.char');
                charElements[this.currentIndex].className = 'char';
                if (charElements[this.currentIndex + 1]) {
                    charElements[this.currentIndex + 1].classList.remove('current');
                }
                charElements[this.currentIndex].classList.add('current');
            }
            return;
        }
    }

    processChar(char) {
        const expectedChar = this.text[this.currentIndex];
        
        const charElements = this.textDisplay.querySelectorAll('.char');
        const currentSpan = charElements[this.currentIndex];

        if (char === expectedChar) {
            // Correcto
            if (expectedChar === ' ') this.errorsOnWord = 0;
            
            this.streak++;
            if (this.streak >= 15 && this.state !== 'nitro') {
                this.setState('nitro');
                if (window.AudioEngine) AudioEngine.playPowerUp();
            }

            currentSpan.classList.remove('current', 'incorrect');
            currentSpan.classList.add('correct');
            
            this.currentIndex++;
            
            // Siguiente caracter
            if (this.currentIndex < this.text.length) {
                charElements[this.currentIndex].classList.add('current');
            }

            // Reportar progreso
            const progressPercent = (this.currentIndex / this.text.length) * 100;
            if (this.ui.onProgress) {
                this.ui.onProgress(progressPercent, this.state);
            }

            // Comprobar fin
            if (this.currentIndex === this.text.length) {
                this.finish();
            }
        } else {
            // Incorrecto
            if (this.mode === 'sudden_death') {
                if (window.AudioEngine) AudioEngine.playError();
                this.finish(true); // DNF instantáneo
                return;
            }
            
            this.streak = 0;
            this.errorsOnWord++;
            if (this.state === 'nitro') {
                this.setState('normal');
                if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state);
            }
            
            currentSpan.classList.add('incorrect');
            if (window.AudioEngine) AudioEngine.playError();
            
            if (this.errorsOnWord >= 3 && !this.isTripped) {
                this.triggerTrip();
            }
        }
    }
    
    setState(newState) {
        this.state = newState;
        if (this.ui.onStateChange) {
            this.ui.onStateChange(this.state);
        }
    }
    
    triggerTrip() {
        this.isTripped = true;
        this.setState('tripped');
        if (window.AudioEngine) AudioEngine.playTrip();
        
        if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state);
        
        this.textDisplay.classList.add('tripped-shake');
        setTimeout(() => {
            if (this.isFinished) return;
            this.isTripped = false;
            this.errorsOnWord = 0;
            this.setState('normal');
            if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state);
            this.textDisplay.classList.remove('tripped-shake');
        }, 1000);
    }

    renderText() {
        this.textDisplay.innerHTML = '';
        for (let i = 0; i < this.text.length; i++) {
            const span = document.createElement('span');
            span.classList.add('char');
            if (i === 0) span.classList.add('current');
            span.textContent = this.text[i];
            this.textDisplay.appendChild(span);
        }
    }

    updateTimerDisplay(seconds) {
        const secs = Math.ceil(seconds);
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        this.timerElement.textContent = `⏳ ${m}:${s}`;
    }

    finish(disqualified = false) {
        this.isFinished = true;
        this.endTime = Date.now();
        this.stop();
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        let wpm = 0;
        let timeInSeconds = (this.endTime - this.startTime) / 1000;
        
        if (!disqualified) {
            const timeInMinutes = timeInSeconds / 60;
            const totalWords = this.text.length / 5;
            wpm = Math.round(totalWords / timeInMinutes);
        } else {
            timeInSeconds = this.timeLimit || 0;
            wpm = 0;
        }
        
        if (this.ui.onFinish) {
            this.ui.onFinish(wpm, timeInSeconds, disqualified);
        }
    }
}
