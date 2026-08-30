const AudioEngine = (() => {
    let audioCtx = null;
    let masterVolume = 1.0;
    let musicPlaying = false;
    let musicInterval = null;

    function init() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playTone(freq, type, duration, vol = 0.1) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(vol * masterVolume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    return {
        init: () => {
            init();
            playTone(200, 'sine', 0.01, 0); // Para desbloquear audio en navegadores
        },
        setVolume: (val) => {
            masterVolume = Math.max(0, Math.min(1, val));
        },
        playBeep: () => {
            playTone(600, 'sine', 0.1, 0.1);
        },
        playGo: () => {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.4 * masterVolume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        },
        playError: () => {
            playTone(150, 'sawtooth', 0.2, 0.1);
        },
        playGunshot: () => {
            if (!audioCtx) return;
            const bufferSize = audioCtx.sampleRate * 0.5; 
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5);

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(1 * masterVolume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            noise.start();
        },
        playPowerUp: () => {
            playTone(400, 'sine', 0.1, 0.1);
            setTimeout(() => playTone(600, 'sine', 0.1, 0.1), 100);
            setTimeout(() => playTone(800, 'sine', 0.2, 0.1), 200);
        },
        playTrip: () => {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.2 * masterVolume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        },
        playMusic: () => {
            if (!audioCtx) return;
            if (musicPlaying) return;
            musicPlaying = true;
            
            const melody = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // Loop arpegio
            let step = 0;
            musicInterval = setInterval(() => {
                if (!musicPlaying) {
                    clearInterval(musicInterval);
                    return;
                }
                if (masterVolume > 0) {
                    playTone(melody[step % melody.length], 'square', 0.1, 0.02);
                }
                step++;
            }, 200);
        },
        playLobbyMusic: () => {
            if (!audioCtx) return;
            if (musicPlaying) return;
            musicPlaying = true;
            
            const melody = [220.00, 277.18, 329.63, 277.18]; // A major relaxed
            let step = 0;
            musicInterval = setInterval(() => {
                if (!musicPlaying) {
                    clearInterval(musicInterval);
                    return;
                }
                if (masterVolume > 0) {
                    playTone(melody[step % melody.length], 'sine', 0.3, 0.015);
                }
                step++;
            }, 400);
        },
        playResultsMusic: () => {
            if (!audioCtx) return;
            if (musicPlaying) return;
            musicPlaying = true;
            
            const melody = [523.25, 659.25, 783.99, 1046.50]; // C major fanfare
            let step = 0;
            musicInterval = setInterval(() => {
                if (!musicPlaying) {
                    clearInterval(musicInterval);
                    return;
                }
                if (masterVolume > 0) {
                    // pattern: 1 2 3 4 4 4
                    let idx = step % 6;
                    if (idx > 3) idx = 3;
                    playTone(melody[idx], 'triangle', 0.15, 0.025);
                }
                step++;
            }, 150);
        },
        stopMusic: () => {
            musicPlaying = false;
            if (musicInterval) clearInterval(musicInterval);
        },
        playCountdownTick: () => {
            playTone(440, 'square', 0.1, 0.05);
        },
        playCountdownGo: () => {
            playTone(880, 'square', 0.4, 0.05);
        },
        playTypeSound: () => {
            playTone(600, 'sine', 0.02, 0.01);
        },
        playFinishSound: () => {
            playTone(523.25, 'square', 0.1, 0.05);
            setTimeout(() => playTone(659.25, 'square', 0.1, 0.05), 100);
            setTimeout(() => playTone(783.99, 'square', 0.1, 0.05), 200);
            setTimeout(() => playTone(1046.50, 'square', 0.4, 0.05), 300);
        }
    };
})();

export default AudioEngine;
