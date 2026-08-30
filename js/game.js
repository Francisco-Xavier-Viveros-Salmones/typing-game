import AudioEngine from './audio.js';

class TypingGame {
    constructor(uiCallbacks) {
        this.text = '';
        this.currentIndex = 0;
        this.startTime = null;
        this.endTime = null;
        this.isFinished = false;
        
        this.textDisplay = document.getElementById('text-display');
        this.hiddenInput = document.getElementById('hidden-input');
        
        this.ui = uiCallbacks; 
        
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
        this.totalErrors = 0;
        this.mistakeInCurrentWord = false;
        this.isTripped = false;
        this.state = 'normal'; 
        this.textDisplay.classList.remove('tripped-shake');
        
        this.timerElement = document.getElementById('game-timer');
        this.stopTimer();
        
        if (this.timeLimit > 0) {
            this.timerElement.style.display = 'inline';
            this.updateTimerDisplay(this.timeLimit);
            
            this.timerInterval = setInterval(() => {
                const elapsed = (Date.now() - this.startTime) / 1000;
                const remaining = Math.max(0, this.timeLimit - elapsed);
                this.updateTimerDisplay(remaining);
                
                if (remaining === 0) {
                    this.stopTimer();
                    if (!this.isFinished) {
                        this.finish(true);
                    }
                }
            }, 100);
        } else {
            this.timerElement.style.display = 'none';
        }
        
        this.renderText();
        
        this.textDisplay.addEventListener('click', this.handleInputClick);
        this.hiddenInput.addEventListener('input', this.handleInput.bind(this));
        this.hiddenInput.addEventListener('blur', () => this.textDisplay.classList.remove('focused'));
        this.hiddenInput.addEventListener('focus', () => this.textDisplay.classList.add('focused'));
        
        document.addEventListener('keydown', this.handleKeyDown);
        
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
        const val = this.hiddenInput.value;
        if (val.length > 0 && !this.isFinished) {
            for (let i = 0; i < val.length; i++) {
                if (this.isFinished) break;
                this.processChar(val[i]);
            }
            this.hiddenInput.value = ''; 
        }
    }

    handleKeyDown(e) {
        if (this.isFinished || this.isTripped) return;
        this.hiddenInput.focus();
        if (e.key === 'Backspace') {
            e.preventDefault();
            return;
        }
    }

    processChar(char) {
        const expectedChar = this.text[this.currentIndex];
        const charElements = this.textDisplay.querySelectorAll('.char');
        const currentSpan = charElements[this.currentIndex];

        if (char === expectedChar) {
            if (expectedChar === ' ' || this.currentIndex === this.text.length - 1) {
                this.errorsOnWord = 0;
                if (!this.mistakeInCurrentWord) {
                    this.streak++;
                    if (this.streak >= 3 && this.state !== 'nitro') {
                        this.setState('nitro');
                        if (AudioEngine) AudioEngine.playPowerUp();
                    }
                }
                this.mistakeInCurrentWord = false;
            }

            currentSpan.classList.remove('current', 'incorrect');
            currentSpan.classList.add('correct');
            if (AudioEngine) AudioEngine.playTypeSound();
            
            this.currentIndex++;
            
            if (this.currentIndex < this.text.length) {
                charElements[this.currentIndex].classList.add('current');
            }

            const progressPercent = (this.currentIndex / this.text.length) * 100;
            if (this.ui.onProgress) {
                this.ui.onProgress(progressPercent, this.state, this.streak);
            }

            if (this.currentIndex === this.text.length) {
                this.finish();
            }
        } else {
            if (this.mode === 'sudden_death') {
                if (AudioEngine) AudioEngine.playError();
                this.finish(true);
                return;
            }
            if (this.mode === 'vidas') {
                if (this.ui.onError) this.ui.onError();
            }
            
            this.streak = 0;
            this.mistakeInCurrentWord = true;
            this.errorsOnWord++;
            this.totalErrors++;
            if (this.state === 'nitro') {
                this.setState('normal');
                if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state, this.streak);
            }
            
            currentSpan.classList.add('incorrect');
            if (AudioEngine) AudioEngine.playError();
            
            if (this.mode !== 'vidas' && this.errorsOnWord >= 3 && !this.isTripped) {
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
        if (AudioEngine) AudioEngine.playTrip();
        
        if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state, this.streak);
        
        this.textDisplay.classList.add('tripped-shake');
        if (this.tripTimeout) clearTimeout(this.tripTimeout);
        this.tripTimeout = setTimeout(() => {
            if (this.isFinished) return;
            this.isTripped = false;
            this.errorsOnWord = 0;
            this.setState('normal');
            if (this.ui.onProgress) this.ui.onProgress((this.currentIndex / this.text.length) * 100, this.state, this.streak);
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
        if (this.isFinished) return;
        this.isFinished = true;
        this.endTime = Date.now();
        this.stop();
        if (AudioEngine && !disqualified) AudioEngine.playFinishSound();
        
        if (this.tripTimeout) clearTimeout(this.tripTimeout);
        this.textDisplay.classList.remove('tripped-shake');
        this.isTripped = false;
        
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
            this.ui.onFinish(wpm, timeInSeconds, disqualified, this.totalErrors);
        }
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}

export default TypingGame;
