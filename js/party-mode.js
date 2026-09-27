/*
 * ============================================================
 * party-mode.js
 * ============================================================
 *
 * AGA-KÊ COMICS — MODO FESTA
 *
 * Versão consolidada e mais ousada.
 *
 * PRINCÍPIO:
 * O PartyMode ESCUTA o treino. Ele não altera score, pitch,
 * cents, MIDI, piano roll, microfone ou resultado musical.
 *
 * ETAPAS INCLUÍDAS:
 * 1. Botão e disponibilidade desktop
 * 2. Comunicação por CustomEvent com melody-mode.js
 * 3. Meme Stage grande na lateral ESQUERDA
 * 4. Efeitos sonoros por categoria
 * 5. Overlay visual por estado
 * 6. Partículas / confete / fogos no lado DIREITO
 * 7. Eventos festivos por CHECKPOINTS da música
 * 8. Vídeo de fundo opcional por música
 * ============================================================
 */

const PARTY_CONFIG = {
    minViewportWidth: 1100,
    minSideSpace: 120,
    viewportMargin: 14,
    appGap: 14,
    buttonId: "partyModeToggle",
    storageKey: "aga-ke-party-mode-enabled",

    bodyAvailableClass: "party-mode-available",
    bodyEnabledClass: "party-mode-enabled",
    bodyDisabledClass: "party-mode-disabled",
    bodyReducedMotionClass: "party-mode-reduced-motion",

    performance: {
        recentWindowSize: 10,
        historyLimit: 90,
        minimumNotesForDiagnosis: 4,
        greatScore: 88,
        goodScore: 70,
        strugglingScore: 45,
        trendThreshold: 12
    },

    /*
     * EVENTOS GRANDES DA FESTA
     * ------------------------
     * Em vez de reagir a cada mudança de estado, o modo faz
     * uma avaliação aproximadamente a cada 22% da música.
     *
     * Exemplo:
     * 200 notas -> ~44 notas por checkpoint.
     * 224 notas -> ~49 notas por checkpoint.
     *
     * O intervalo fica limitado entre 35 e 55 notas.
     */
    checkpoints: {
        ratio: 0.22,
        minNotes: 35,
        maxNotes: 55,
        fallbackNotes: 45,
        comebackImprovement: 14,
        greatAverage: 84,
        goodAverage: 62,
        strugglingAverage: 50
    },

    memes: {
        manifestUrl: "./assets/party/party-manifest.json",
        stageId: "partyMemeStage",
        displayDurationMs: 3800,
        exitDurationMs: 520,
        avoidRecentCount: 2,

        /*
         * Palco grande: ocupa a faixa da borda esquerda até
         * pouco antes do canvas principal. Pode cobrir o menu.
         */
        minWidth: 390,
        maxWidth: 680,
        top: 135,
        canvasGap: 16
    },

    sounds: {
        volume: 0.30,
        maximumDurationMs: 6500,
        avoidRecentCount: 2,

        /*
         * Som agora acompanha os checkpoints.
         * Cooldown é apenas uma trava de segurança contra
         * chamadas manuais ou eventos duplicados.
         */
        cooldownMs: 2200,

        duckingEnabled: true,
        duckingFactor: 0.84,
        duckingFadeMs: 140,
        duckingRestoreMs: 420
    },

    visuals: {
        overlayId: "partyVisualOverlay",
        flashDurationMs: 720,
        flashCooldownMs: 2600
    },

    /*
     * VÍDEO DE FUNDO POR MÚSICA
     * -------------------------
     * Opcional. Recebido via karaoke:session-started
     * (event.detail.backgroundVideo).
     *
     * Não é sincronizado com o MP3: apenas toca em loop,
     * sempre muted, enquanto treino + Modo Festa estiverem
     * ativos. Qualquer falha volta ao background CSS.
     */
    backgroundVideo: {
        elementId: "partyBackgroundVideo",
        bodyClass: "party-mode-has-background-video",
        visibleClass: "is-visible",
        fadeMs: 700
    },

    particles: {

        stageId:
            "partyParticleStage",

        maxAlive:
            120,

        goodCount:
            32,

        greatCount:
            72,

        comebackCount:
            90,

        strugglingCount:
            22
    },

    karaokeEvents: {
        sessionStarted: "karaoke:session-started",
        noteFinalized: "karaoke:note-finalized",
        comboUpdated: "karaoke:combo-updated",
        sessionEnded: "karaoke:session-ended",
        sessionStopped: "karaoke:session-stopped"
    },

    events: {
        ready: "agake:party-ready",
        enabled: "agake:party-enabled",
        disabled: "agake:party-disabled",
        availabilityChanged: "agake:party-availability-changed",
        performanceChanged: "agake:party-performance-changed",
        checkpoint: "agake:party-checkpoint",
        memeShown: "agake:party-meme-shown",
        memeHidden: "agake:party-meme-hidden",
        soundPlayed: "agake:party-sound-played",
        particles: "agake:party-particles"
    }
};

export class PartyModeController {
    constructor(config = {}) {
        this.config = {
            ...PARTY_CONFIG,
            ...config,

            performance: {
                ...PARTY_CONFIG.performance,
                ...(config.performance || {})
            },

            checkpoints: {
                ...PARTY_CONFIG.checkpoints,
                ...(config.checkpoints || {})
            },

            memes: {
                ...PARTY_CONFIG.memes,
                ...(config.memes || {})
            },

            sounds: {
                ...PARTY_CONFIG.sounds,
                ...(config.sounds || {})
            },

            visuals: {
                ...PARTY_CONFIG.visuals,
                ...(config.visuals || {})
            },

            backgroundVideo: {
                ...PARTY_CONFIG.backgroundVideo,
                ...(config.backgroundVideo || {})
            },

            particles: {
                ...PARTY_CONFIG.particles,
                ...(config.particles || {})
            },

            karaokeEvents: {
                ...PARTY_CONFIG.karaokeEvents,
                ...(config.karaokeEvents || {})
            },

            events: {
                ...PARTY_CONFIG.events,
                ...(config.events || {})
            }
        };

        this.initialized = false;
        this.available = false;
        this.enabled = false;
        this.reducedMotion = false;
        this.preferredSide = "left";
        this.savedPreference = null;

        this.appElement = null;
        this.button = null;
        this.visualOverlay = null;
        this.memeStage = null;
        this.memeCard = null;
        this.memeMediaContainer = null;
        this.particleStage = null;
        this.memeStageAvailable = false;

        this.pointerMediaQuery = null;
        this.reducedMotionMediaQuery = null;
        this.resizeFrame = null;

        this.sessionActive = false;
        this.sessionInfo = null;
        this.lastSessionSummary = null;

        this.performanceHistory = [];
        this.currentCombo = 0;
        this.bestCombo = 0;
        this.performanceDiagnosis = this.createEmptyDiagnosis();

        /*
         * Estatísticas acumuladas da sessão desde que
         * o PartyMode foi ativado.
         */
        this.sessionStats = this.createEmptySessionStats();

        this.checkpointSize =
            this.config.checkpoints.fallbackNotes;

        this.nextCheckpointAt =
            this.checkpointSize;

        this.checkpointIndex = 0;

        this.lastCheckpointAverage = null;
        this.lastCheckpointCategory = null;
        this.lastCheckpointFinalized = 0;

        this.partyManifest = null;
        this.manifestPromise = null;

        this.memeActive = false;
        this.activeMemeUrl = null;
        this.recentMemeUrls = [];
        this.memeHideTimer = null;
        this.memeRemoveTimer = null;
        this.memeAnimation = null;

        this.soundActive = false;
        this.activeSound = null;
        this.activeSoundUrl = null;
        this.lastSoundAt = 0;
        this.recentSoundUrls = [];
        this.soundStopTimer = null;
        this.backingOriginalVolume = null;
        this.duckingAnimationFrame = null;

        this.currentVisualState = "idle";
        this.lastVisualFlashAt = 0;
        this.visualFlashTimer = null;

        this.liveParticles = new Set();

        /*
         * Vídeo de fundo opcional por música.
         *
         * playToken invalida resultados atrasados de play()
         * quando o vídeo é pausado/parado antes de resolver.
         */
        this.backgroundVideoElement = null;
        this.backgroundVideoUrl = null;
        this.backgroundVideoReady = false;
        this.backgroundVideoFailed = false;
        this.backgroundVideoVisible = false;
        this.backgroundVideoPlayToken = 0;

        this.boundHandleBackgroundVideoLoaded =
            this.handleBackgroundVideoLoaded.bind(this);

        this.boundHandleBackgroundVideoError =
            this.handleBackgroundVideoError.bind(this);

        this.boundHandleResize =
            this.handleResize.bind(this);

        this.boundHandleCapabilityChange =
            this.handleCapabilityChange.bind(this);

        this.boundToggle =
            this.toggle.bind(this);

        this.boundHandleSessionStarted =
            this.handleSessionStarted.bind(this);

        this.boundHandleNoteFinalized =
            this.handleNoteFinalized.bind(this);

        this.boundHandleComboUpdated =
            this.handleComboUpdated.bind(this);

        this.boundHandleSessionEnded =
            this.handleSessionEnded.bind(this);

        this.boundHandleSessionStopped =
            this.handleSessionStopped.bind(this);
    }

    /*
     * ========================================================
     * INICIALIZAÇÃO
     * ========================================================
     */

    init() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;

        this.appElement =
            document.querySelector(".app");

        this.pointerMediaQuery =
            window.matchMedia("(pointer: fine)");

        this.reducedMotionMediaQuery =
            window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            );

        this.reducedMotion =
            this.reducedMotionMediaQuery.matches;

        this.savedPreference =
            this.loadPreference();

        this.createToggleButton();
        this.createBackgroundVideo();
        this.createVisualOverlay();
        this.createMemeStage();
        this.createParticleStage();

        this.refreshCapability();

        window.addEventListener(
            "resize",
            this.boundHandleResize,
            {
                passive: true
            }
        );

        this.addMediaQueryListener(
            this.pointerMediaQuery,
            this.boundHandleCapabilityChange
        );

        this.addMediaQueryListener(
            this.reducedMotionMediaQuery,
            this.boundHandleCapabilityChange
        );

        document.addEventListener(
            this.config.karaokeEvents.sessionStarted,
            this.boundHandleSessionStarted
        );

        document.addEventListener(
            this.config.karaokeEvents.noteFinalized,
            this.boundHandleNoteFinalized
        );

        document.addEventListener(
            this.config.karaokeEvents.comboUpdated,
            this.boundHandleComboUpdated
        );

        document.addEventListener(
            this.config.karaokeEvents.sessionEnded,
            this.boundHandleSessionEnded
        );

        document.addEventListener(
            this.config.karaokeEvents.sessionStopped,
            this.boundHandleSessionStopped
        );

        window.PartyMode =
            this;

        this.dispatch(
            this.config.events.ready,
            this.getState()
        );

        console.info(
            "🎉 PartyMode ousado inicializado.",
            this.getState()
        );
    }

    /*
     * ========================================================
     * DOM
     * ========================================================
     */

    createToggleButton() {
        const existing =
            document.getElementById(
                this.config.buttonId
            );

        if (existing) {
            this.button =
                existing;

            this.button.removeEventListener(
                "click",
                this.boundToggle
            );

            this.button.addEventListener(
                "click",
                this.boundToggle
            );

            this.updateButton();

            return;
        }

        const button =
            document.createElement(
                "button"
            );

        button.id =
            this.config.buttonId;

        button.type =
            "button";

        button.className =
            "party-mode-toggle";

        button.setAttribute(
            "aria-pressed",
            "false"
        );

        button.setAttribute(
            "aria-label",
            "Ativar Modo Festa"
        );

        button.innerHTML = `
            <span
                class="party-mode-toggle-icon"
                aria-hidden="true"
            >
                🎉
            </span>

            <span
                class="party-mode-toggle-content"
            >
                <span
                    class="party-mode-toggle-title"
                >
                    MODO FESTA
                </span>

                <span
                    class="party-mode-toggle-state"
                >
                    OFF
                </span>
            </span>
        `;

        button.hidden =
            true;

        button.addEventListener(
            "click",
            this.boundToggle
        );

        document.body.appendChild(
            button
        );

        this.button =
            button;

        this.updateButton();
    }

    createVisualOverlay() {
        const existing =
            document.getElementById(
                this.config.visuals.overlayId
            );

        if (existing) {
            this.visualOverlay =
                existing;

            return;
        }

        const overlay =
            document.createElement(
                "div"
            );

        overlay.id =
            this.config.visuals.overlayId;

        overlay.className =
            "party-visual-overlay";

        overlay.dataset.state =
            "idle";

        overlay.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.appendChild(
            overlay
        );

        this.visualOverlay =
            overlay;
    }

    createMemeStage() {
        const existing =
            document.getElementById(
                this.config.memes.stageId
            );

        if (existing) {
            this.memeStage =
                existing;

            this.memeCard =
                existing.querySelector(
                    ".party-meme-card"
                );

            this.memeMediaContainer =
                existing.querySelector(
                    ".party-meme-media"
                );

            this.applyMemeStageRuntimeStyle();

            return;
        }

        const stage =
            document.createElement(
                "div"
            );

        stage.id =
            this.config.memes.stageId;

        stage.className =
            "party-meme-stage";

        stage.setAttribute(
            "aria-hidden",
            "true"
        );

        stage.innerHTML = `
            <div
                class="party-meme-card"
            >
                <span
                    class="
                        party-meme-tape
                        party-meme-tape-left
                    "
                    aria-hidden="true"
                ></span>

                <span
                    class="
                        party-meme-tape
                        party-meme-tape-right
                    "
                    aria-hidden="true"
                ></span>

                <div
                    class="party-meme-media"
                ></div>
            </div>
        `;

        document.body.appendChild(
            stage
        );

        this.memeStage =
            stage;

        this.memeCard =
            stage.querySelector(
                ".party-meme-card"
            );

        this.memeMediaContainer =
            stage.querySelector(
                ".party-meme-media"
            );

        this.applyMemeStageRuntimeStyle();
        this.positionMemeStage();
    }

/*
 * ========================================================
 * CRIAR PALCO DE PARTÍCULAS
 * ========================================================
 */

    createParticleStage() {

        const existing =
            document.getElementById(
                this.config.particles.stageId
            );


        if (
            existing
        ) {

            this.particleStage =
                existing;


            /*
            * Em caso de reload durante desenvolvimento,
            * removemos resíduos antigos.
            */
            this.particleStage
                .replaceChildren();


            this.liveParticles.clear();


            this.applyParticleStageRuntimeStyle();


            return;
        }


        const stage =
            document.createElement(
                "div"
            );


        stage.id =
            this.config.particles.stageId;


        stage.className =
            "party-particle-stage";


        stage.setAttribute(
            "aria-hidden",
            "true"
        );


        document.body.appendChild(
            stage
        );


        this.particleStage =
            stage;


        this.applyParticleStageRuntimeStyle();


        console.info(
            "🎉 Palco de partículas criado.",
            {
                id:
                    stage.id,

                connected:
                    stage.isConnected
            }
        );
    }

    applyMemeStageRuntimeStyle() {
        if (!this.memeStage) {
            return;
        }

        /*
         * O CSS antigo posicionava o palco à direita e animava
         * via transition. Nesta versão, o JS assume a posição
         * e usa Web Animations API para entrar pela ESQUERDA.
         */

        Object.assign(
            this.memeStage.style,
            {
                position:
                    "fixed",

                left:
                    `${this.config.viewportMargin}px`,

                right:
                    "auto",

                top:
                    `${this.config.memes.top}px`,

                zIndex:
                    "8700",

                pointerEvents:
                    "none",

                transition:
                    "none",

                visibility:
                    "hidden",

                opacity:
                    "0"
            }
        );
    }

    /*
    * ========================================================
    * ESTILO DE SEGURANÇA DO PALCO DE PARTÍCULAS
    * ========================================================
    */

    applyParticleStageRuntimeStyle() {

        if (
            !this.particleStage
        ) {

            return;
        }


        Object.assign(
            this.particleStage.style,
            {
                position:
                    "fixed",

                inset:
                    "0",

                width:
                    "100vw",

                height:
                    "100vh",

                overflow:
                    "hidden",

                pointerEvents:
                    "none",

                zIndex:
                    "8950",

                display:
                    "block",

                visibility:
                    "visible",

                background:
                    "transparent",

                isolation:
                    "isolate"
            }
        );
    }

    /*
     * ========================================================
     * DISPONIBILIDADE E POSICIONAMENTO
     * ========================================================
     */

    refreshCapability() {
        const previousAvailability =
            this.available;

        const capability =
            this.calculateCapability();

        this.available =
            capability.available;

        /*
         * Preferência explícita desta versão:
         * botão e Meme Stage partem sempre da esquerda.
         */
        this.preferredSide =
            "left";

        this.reducedMotion =
            capability.reducedMotion;

        document.body.classList.toggle(
            this.config.bodyAvailableClass,
            this.available
        );

        document.body.classList.toggle(
            this.config.bodyReducedMotionClass,
            this.reducedMotion
        );

        if (this.button) {
            this.button.hidden =
                !this.available;

            if (this.available) {
                this.positionButton();
            }
        }

        this.positionMemeStage();
        this.applyParticleStageRuntimeStyle();

        if (!this.available) {
            this.setEnabledInternal(
                false,
                {
                    persist:
                        false,

                    emitEvent:
                        true
                }
            );
        } else {
            this.setEnabledInternal(
                this.savedPreference === true,
                {
                    persist:
                        false,

                    emitEvent:
                        false
                }
            );
        }

        this.updateButton();

        if (
            previousAvailability !==
            this.available
        ) {
            this.dispatch(
                this.config.events.availabilityChanged,
                this.getState()
            );
        }
    }

    calculateCapability() {
        const viewportWidth =
            window.innerWidth ||
            document.documentElement.clientWidth ||
            0;

        const finePointer =
            this.pointerMediaQuery
                ? this.pointerMediaQuery.matches
                : true;

        const reducedMotion =
            this.reducedMotionMediaQuery
                ? this.reducedMotionMediaQuery.matches
                : false;

        if (
            viewportWidth <
            this.config.minViewportWidth
        ) {
            return {
                available:
                    false,

                side:
                    "left",

                reducedMotion,

                reason:
                    "viewport-too-small"
            };
        }

        if (!finePointer) {
            return {
                available:
                    false,

                side:
                    "left",

                reducedMotion,

                reason:
                    "no-fine-pointer"
            };
        }

        if (!this.appElement) {
            return {
                available:
                    true,

                side:
                    "left",

                reducedMotion,

                reason:
                    "fallback-no-app"
            };
        }

        const rect =
            this.appElement
                .getBoundingClientRect();

        const leftSpace =
            Math.max(
                0,
                rect.left
            );

        const rightSpace =
            Math.max(
                0,
                viewportWidth -
                    rect.right
            );

        const available =
            Math.max(
                leftSpace,
                rightSpace
            ) >=
            this.config.minSideSpace;

        return {
            available,

            side:
                "left",

            reducedMotion,

            leftSpace,

            rightSpace,

            reason:
                available
                    ? "desktop-ready"
                    : "insufficient-side-space"
        };
    }

    positionButton() {
        if (
            !this.button ||
            !this.available
        ) {
            return;
        }

        /*
         * Preferência explícita:
         * canto superior esquerdo.
         */

        this.button.style.left =
            `${this.config.viewportMargin}px`;

        this.button.style.right =
            "auto";

        this.button.dataset.side =
            "left";
    }

    findPrimaryCanvasRect() {
        const canvases =
            Array.from(
                document.querySelectorAll(
                    "canvas"
                )
            );

        let best =
            null;

        let bestArea =
            0;

        for (
            const canvas
            of canvases
        ) {
            const rect =
                canvas.getBoundingClientRect();

            const area =
                Math.max(
                    0,
                    rect.width
                ) *
                Math.max(
                    0,
                    rect.height
                );

            const visible =
                rect.width >
                    120 &&
                rect.height >
                    80 &&
                rect.bottom >
                    0 &&
                rect.top <
                    window.innerHeight;

            if (
                visible &&
                area >
                    bestArea
            ) {
                best =
                    rect;

                bestArea =
                    area;
            }
        }

        return best;
    }

    positionMemeStage() {
        if (!this.memeStage) {
            return;
        }

        const viewportWidth =
            window.innerWidth ||
            document.documentElement.clientWidth ||
            0;

        const margin =
            this.config.viewportMargin;

        const canvasRect =
            this.findPrimaryCanvasRect();

        let rightLimit;

        /*
         * Quando encontramos o canvas principal,
         * usamos sua borda esquerda como limite visual.
         *
         * Isso permite que o meme cubra a coluna/menu,
         * mas não invada o piano roll.
         */
        if (canvasRect) {
            rightLimit =
                canvasRect.left -
                this.config.memes.canvasGap;

        } else if (
            this.appElement
        ) {
            const appRect =
                this.appElement
                    .getBoundingClientRect();

            /*
             * Sem canvas detectável,
             * permitimos cobrir parte da coluna/menu esquerdo.
             */
            rightLimit =
                appRect.left +
                Math.min(
                    280,
                    appRect.width *
                        0.28
                );

        } else {
            rightLimit =
                Math.min(
                    viewportWidth *
                        0.42,
                    this.config.memes.maxWidth +
                        margin
                );
        }

        const availableWidth =
            Math.max(
                0,
                rightLimit -
                    margin
            );

        const width =
            Math.min(
                this.config.memes.maxWidth,
                availableWidth
            );

        this.memeStageAvailable =
            this.available &&
            width >=
                this.config.memes.minWidth;

        this.memeStage.dataset.available =
            this.memeStageAvailable
                ? "true"
                : "false";

        this.memeStage.style.left =
            `${margin}px`;

        this.memeStage.style.right =
            "auto";

        this.memeStage.style.top =
            `${this.config.memes.top}px`;

        this.memeStage.style.width =
            `${Math.round(
                Math.max(
                    this.config.memes.minWidth,
                    width
                )
            )}px`;

        if (
            this.memeMediaContainer
        ) {
            this.memeMediaContainer.style.minHeight =
                "250px";
        }

        if (
            this.memeStageAvailable &&
            this.memeCard
        ) {
            this.memeCard.style.width =
                "100%";
        }

        if (
            !this.memeStageAvailable &&
            this.memeActive
        ) {
            this.hideMeme(
                true
            );
        }
    }

    /*
     * ========================================================
     * ON / OFF
     * ========================================================
     */

    toggle() {
        if (!this.available) {
            return;
        }

        this.setEnabled(
            !this.enabled
        );
    }

    enable() {
        this.setEnabled(
            true
        );
    }

    disable() {
        this.setEnabled(
            false
        );
    }

    setEnabled(value) {
        const requested =
            Boolean(
                value
            );

        if (
            requested &&
            !this.available
        ) {
            console.warn(
                "🎉 PartyMode: ambiente atual não compatível.",
                this.getState()
            );

            return;
        }

        this.setEnabledInternal(
            requested,
            {
                persist:
                    true,

                emitEvent:
                    true
            }
        );
    }

    setEnabledInternal(
        value,
        options = {}
    ) {
        const {
            persist = false,
            emitEvent = false
        } = options;

        const nextEnabled =
            Boolean(
                value
            ) &&
            this.available;

        const changed =
            this.enabled !==
            nextEnabled;

        this.enabled =
            nextEnabled;

        document.body.classList.toggle(
            this.config.bodyEnabledClass,
            this.enabled
        );

        document.body.classList.toggle(
            this.config.bodyDisabledClass,
            !this.enabled
        );

        if (
            changed &&
            this.enabled
        ) {
            this.resetPartySessionTracking();

            this.setVisualState(
                "warming-up"
            );

            void this.ensureManifestLoaded();

            /*
             * Ativado no meio da música:
             * o vídeo já foi preparado no session-started.
             */
            if (this.sessionActive) {
                this.playBackgroundVideo();
            }
        }

        if (
            changed &&
            !this.enabled
        ) {
            this.hideMeme(
                true
            );

            this.stopPartySound(
                true
            );

            this.clearParticles();

            this.resetVisualEnvironment();

            /*
             * Mantém src/URL para permitir retomada
             * se o Modo Festa for reativado.
             */
            this.pauseBackgroundVideo();
        }

        if (persist) {
            this.savedPreference =
                this.enabled;

            this.savePreference(
                this.enabled
            );
        }

        this.updateButton();

        if (
            !changed ||
            !emitEvent
        ) {
            return;
        }

        if (this.enabled) {
            this.dispatch(
                this.config.events.enabled,
                this.getState()
            );

            console.info(
                "🎉 Modo Festa ativado."
            );

        } else {
            this.dispatch(
                this.config.events.disabled,
                this.getState()
            );

            console.info(
                "🎉 Modo Festa desativado."
            );
        }
    }

    updateButton() {
        if (!this.button) {
            return;
        }

        const stateElement =
            this.button.querySelector(
                ".party-mode-toggle-state"
            );

        this.button.classList.toggle(
            "is-active",
            this.enabled
        );

        this.button.setAttribute(
            "aria-pressed",
            this.enabled
                ? "true"
                : "false"
        );

        this.button.setAttribute(
            "aria-label",
            this.enabled
                ? "Desativar Modo Festa"
                : "Ativar Modo Festa"
        );

        if (stateElement) {
            stateElement.textContent =
                this.enabled
                    ? "ON"
                    : "OFF";
        }

        this.button.dataset.enabled =
            this.enabled
                ? "true"
                : "false";

        this.button.dataset.available =
            this.available
                ? "true"
                : "false";

        this.button.dataset.reducedMotion =
            this.reducedMotion
                ? "true"
                : "false";

        this.button.dataset.side =
            "left";
    }

    loadPreference() {
        try {
            const value =
                window.localStorage.getItem(
                    this.config.storageKey
                );

            if (
                value ===
                "true"
            ) {
                return true;
            }

            if (
                value ===
                "false"
            ) {
                return false;
            }

            return null;

        } catch (error) {
            console.debug(
                "PartyMode: preferência não pôde ser lida.",
                error
            );

            return null;
        }
    }

    savePreference(enabled) {
        try {
            window.localStorage.setItem(
                this.config.storageKey,
                enabled
                    ? "true"
                    : "false"
            );

        } catch (error) {
            console.debug(
                "PartyMode: preferência não pôde ser salva.",
                error
            );
        }
    }

    /*
     * ========================================================
     * MANIFEST
     * ========================================================
     */

    async ensureManifestLoaded() {
        if (this.partyManifest) {
            return this.partyManifest;
        }

        if (this.manifestPromise) {
            return this.manifestPromise;
        }

        this.manifestPromise =
            this.loadPartyManifest();

        try {
            this.partyManifest =
                await this.manifestPromise;

            console.info(
                "🎉 Party manifest carregado.",
                this.partyManifest
            );

            return this.partyManifest;

        } finally {
            this.manifestPromise =
                null;
        }
    }

    async loadPartyManifest() {
        const response =
            await fetch(
                this.config.memes.manifestUrl,
                {
                    cache:
                        "no-cache"
                }
            );

        if (!response.ok) {
            throw new Error(
                `Não foi possível carregar ${this.config.memes.manifestUrl} (${response.status}).`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            typeof data !==
                "object"
        ) {
            throw new Error(
                "party-manifest.json possui formato inválido."
            );
        }

        if (
            !data.memes ||
            typeof data.memes !==
                "object"
        ) {
            throw new Error(
                'party-manifest.json precisa possuir o objeto "memes".'
            );
        }

        /*
         * sounds é opcional para não quebrar
         * instalações antigas.
         */
        if (
            !data.sounds ||
            typeof data.sounds !==
                "object"
        ) {
            data.sounds = {};
        }

        return data;
    }

    resolveManifestAssetUrl(value) {
        if (!value) {
            return null;
        }

        try {
            const manifestAbsoluteUrl =
                new URL(
                    this.config.memes.manifestUrl,
                    window.location.href
                );

            return new URL(
                value,
                manifestAbsoluteUrl
            ).href;

        } catch {
            return value;
        }
    }

    /*
     * ========================================================
     * SESSÃO / EVENTOS DO TREINO
     * ========================================================
     */

    handleSessionStarted(event) {
        this.resetPartySessionTracking();

        this.resetVisualEnvironment();

        this.hideMeme(
            true
        );

        this.stopPartySound(
            true
        );

        this.clearParticles();

        this.sessionActive =
            true;

        this.lastSessionSummary =
            null;

        this.sessionInfo =
            event?.detail
                ? {
                    ...event.detail
                }
                : null;

        this.configureCheckpoints(
            this.sessionInfo?.totalNotes
        );

        /*
         * Preparado mesmo com o Modo Festa desligado,
         * para permitir ativação no meio da música.
         */
        this.prepareBackgroundVideo(
            this.sessionInfo?.backgroundVideo
        );

        if (this.isActive()) {
            this.setVisualState(
                "warming-up"
            );

            void this.ensureManifestLoaded();

            this.playBackgroundVideo();
        }

        console.info(
            "🎉 PartyMode: sessão iniciada.",
            {
                ...this.sessionInfo,

                checkpointSize:
                    this.checkpointSize,

                nextCheckpointAt:
                    this.nextCheckpointAt
            }
        );
    }

    handleNoteFinalized(event) {
        if (!this.isActive()) {
            return;
        }

        const detail =
            event?.detail;

        if (!detail) {
            return;
        }

        const score =
            Number(
                detail.score
            );

        if (
            !Number.isFinite(
                score
            )
        ) {
            return;
        }

        const entry = {
            noteIndex:
                detail.noteIndex ??
                null,

            score,

            pitchScore:
                this.toFiniteNumberOrNull(
                    detail.pitchScore
                ),

            status:
                detail.status ??
                null,

            visualStatus:
                detail.visualStatus ??
                null,

            classification:
                detail.classification ??
                null,

            classificationRatio:
                this.toFiniteNumberOrNull(
                    detail.classificationRatio
                ),

            expectedMidi:
                this.toFiniteNumberOrNull(
                    detail.expectedMidi
                ),

            sungMidi:
                this.toFiniteNumberOrNull(
                    detail.sungMidi
                ),

            combo:
                this.toFiniteNumberOrFallback(
                    detail.combo,
                    this.currentCombo
                ),

            songTime:
                this.toFiniteNumberOrFallback(
                    detail.songTime,
                    0
                ),

            timestamp:
                Date.now()
        };

        this.performanceHistory.push(
            entry
        );

        const historyLimit =
            Math.max(
                1,
                Number(
                    this.config.performance.historyLimit
                ) ||
                90
            );

        if (
            this.performanceHistory.length >
            historyLimit
        ) {
            this.performanceHistory.splice(
                0,
                this.performanceHistory.length -
                    historyLimit
            );
        }

        this.registerSessionStat(
            entry
        );

        this.updatePerformanceDiagnosis();

        this.maybeRunCheckpoint();
    }

    handleComboUpdated(event) {
        if (!this.isActive()) {
            return;
        }

        const detail =
            event?.detail ||
            {};

        this.currentCombo =
            Math.max(
                0,
                Number(
                    detail.combo
                ) ||
                0
            );

        this.bestCombo =
            Math.max(
                this.bestCombo,
                Number(
                    detail.bestCombo
                ) ||
                0
            );
    }

    handleSessionEnded(event) {
        this.sessionActive =
            false;

        this.stopBackgroundVideo();

        this.lastSessionSummary = {
            ...(
                event?.detail ||
                {}
            )
        };

        if (this.isActive()) {
            /*
             * Se restou um bloco significativo que ainda
             * não foi avaliado, fazemos um último evento.
             */
            const remaining =
                this.sessionStats.finalized -
                this.lastCheckpointFinalized;

            if (
                remaining >=
                Math.max(
                    10,
                    Math.floor(
                        this.checkpointSize *
                        0.45
                    )
                )
            ) {
                void this.runCheckpoint(
                    true
                );

            } else {
                this.triggerVisualFlash(
                    "great",
                    true
                );

                this.spawnPartyParticles(
                    "great",
                    24
                );
            }

            console.info(
                "🎉 PartyMode: sessão concluída.",
                {
                    summary:
                        this.lastSessionSummary,

                    performance:
                        this.getPerformanceState()
                }
            );
        }
    }

    handleSessionStopped() {
        this.sessionActive =
            false;

        this.stopBackgroundVideo();

        this.hideMeme(
            true
        );

        this.stopPartySound(
            true
        );

        this.clearParticles();

        this.resetVisualEnvironment();

        if (this.isActive()) {
            console.info(
                "🎉 PartyMode: sessão interrompida."
            );
        }
    }

    /*
     * ========================================================
     * ESTATÍSTICAS / CHECKPOINTS
     * ========================================================
     */

    createEmptySessionStats() {
        return {
            finalized:
                0,

            scoreSum:
                0,

            excellent:
                0,

            partial:
                0,

            error:
                0,

            missed:
                0,

            melody:
                0,

            alternative:
                0,

            outOfKey:
                0
        };
    }

    createEmptyDiagnosis() {
        return {
            state:
                "idle",

            recentAverage:
                null,

            positiveRatio:
                0,

            errorRatio:
                0,

            trend:
                "stable",

            sampleSize:
                0
        };
    }

    resetPartySessionTracking() {
        this.performanceHistory =
            [];

        this.currentCombo =
            0;

        this.bestCombo =
            0;

        this.performanceDiagnosis =
            this.createEmptyDiagnosis();

        this.sessionStats =
            this.createEmptySessionStats();

        this.checkpointIndex =
            0;

        this.lastCheckpointAverage =
            null;

        this.lastCheckpointCategory =
            null;

        this.lastCheckpointFinalized =
            0;

        this.configureCheckpoints(
            this.sessionInfo?.totalNotes
        );
    }

    configureCheckpoints(totalNotesValue) {
        const totalNotes =
            Number(
                totalNotesValue
            );

        const cfg =
            this.config.checkpoints;

        let size =
            Number(
                cfg.fallbackNotes
            ) ||
            45;

        if (
            Number.isFinite(
                totalNotes
            ) &&
            totalNotes >
                0
        ) {
            size =
                Math.round(
                    totalNotes *
                    Number(
                        cfg.ratio ||
                        0.22
                    )
                );
        }

        size =
            Math.max(
                Number(
                    cfg.minNotes
                ) ||
                35,
                size
            );

        size =
            Math.min(
                Number(
                    cfg.maxNotes
                ) ||
                55,
                size
            );

        this.checkpointSize =
            Math.max(
                1,
                Math.round(
                    size
                )
            );

        this.nextCheckpointAt =
            this.checkpointSize;
    }

    registerSessionStat(entry) {
        this.sessionStats.finalized +=
            1;

        this.sessionStats.scoreSum +=
            Number(
                entry.score
            ) ||
            0;

        if (
            entry.status ===
            "excellent"
        ) {
            this.sessionStats.excellent +=
                1;

        } else if (
            entry.status ===
            "partial"
        ) {
            this.sessionStats.partial +=
                1;

        } else if (
            entry.status ===
            "error"
        ) {
            this.sessionStats.error +=
                1;

        } else if (
            entry.status ===
            "missed"
        ) {
            this.sessionStats.missed +=
                1;
        }

        if (
            entry.classification ===
                "exactMelody" ||
            entry.classification ===
                "octaveMelody"
        ) {
            this.sessionStats.melody +=
                1;

        } else if (
            entry.classification ===
            "scaleAlternative"
        ) {
            this.sessionStats.alternative +=
                1;

        } else if (
            entry.classification ===
            "outOfKey"
        ) {
            this.sessionStats.outOfKey +=
                1;
        }
    }

    maybeRunCheckpoint() {
        if (
            !this.isActive() ||
            !this.sessionActive
        ) {
            return;
        }

        if (
            this.sessionStats.finalized <
            this.nextCheckpointAt
        ) {
            return;
        }

        void this.runCheckpoint(
            false
        );

        /*
         * Avança diretamente para o próximo marco,
         * mesmo se eventos chegarem em lote.
         */
        while (
            this.nextCheckpointAt <=
            this.sessionStats.finalized
        ) {
            this.nextCheckpointAt +=
                this.checkpointSize;
        }
    }

    async runCheckpoint(
        isFinal = false
    ) {
        if (!this.isActive()) {
            return null;
        }

        const finalized =
            this.sessionStats.finalized;

        if (
            finalized <=
            0
        ) {
            return null;
        }

        const cumulativeAverage =
            this.sessionStats.scoreSum /
            finalized;

        /*
         * O histórico pode ter sido aparado.
         *
         * Pegamos o bloco recente equivalente à quantidade
         * de notas desde o checkpoint anterior.
         */
        const notesSincePrevious =
            Math.max(
                1,
                finalized -
                this.lastCheckpointFinalized
            );

        const segmentEntries =
            this.performanceHistory.slice(
                -notesSincePrevious
            );

        const segmentAverage =
            segmentEntries.length >
                0
                ? this.averageScores(
                    segmentEntries
                )
                : cumulativeAverage;

        const previousAverage =
            this.lastCheckpointAverage;

        const category =
            this.classifyCheckpointCategory(
                {
                    cumulativeAverage,
                    segmentAverage,
                    previousAverage,
                    isFinal
                }
            );

        this.checkpointIndex +=
            1;

        this.lastCheckpointAverage =
            segmentAverage;

        this.lastCheckpointCategory =
            category;

        this.lastCheckpointFinalized =
            finalized;

        const payload = {
            checkpointIndex:
                this.checkpointIndex,

            finalizedNotes:
                finalized,

            totalNotes:
                Number(
                    this.sessionInfo?.totalNotes
                ) ||
                null,

            checkpointSize:
                this.checkpointSize,

            cumulativeAverage:
                Math.round(
                    cumulativeAverage
                ),

            segmentAverage:
                Math.round(
                    segmentAverage
                ),

            previousAverage:
                previousAverage ===
                    null
                    ? null
                    : Math.round(
                        previousAverage
                    ),

            category,

            isFinal,

            combo:
                this.currentCombo,

            bestCombo:
                this.bestCombo
        };

        console.info(
            "🎉 CHECKPOINT DA FESTA",
            payload
        );

        this.dispatch(
            this.config.events.checkpoint,
            payload
        );

        /*
         * Um checkpoint é um ACONTECIMENTO.
         *
         * Meme, som, partículas e flash partem
         * da mesma decisão, sem reagir a cada nota.
         */

        this.applyCheckpointVisual(
            category
        );

        const tasks =
            [];

        if (
            this.memeStageAvailable
        ) {
            tasks.push(
                this.showRandomMeme(
                    category
                )
            );
        }

        /*
         * forceEvent = true:
         * checkpoint real sempre pode disparar seu som.
         */
        tasks.push(
            this.showRandomSound(
                category,
                {
                    forceEvent:
                        true
                }
            )
        );

        await Promise.allSettled(
            tasks
        );

        return payload;
    }

    classifyCheckpointCategory({
        cumulativeAverage,
        segmentAverage,
        previousAverage
    }) {
        const cfg =
            this.config.checkpoints;

        const improvedEnough =
            Number.isFinite(
                previousAverage
            ) &&
            (
                segmentAverage -
                previousAverage
            ) >=
            cfg.comebackImprovement;

        const previousWasWeak =
            this.lastCheckpointCategory ===
                "struggling" ||
            (
                Number.isFinite(
                    previousAverage
                ) &&
                previousAverage <
                cfg.goodAverage
            );

        /*
         * Recuperação recebe prioridade.
         */
        if (
            previousWasWeak &&
            improvedEnough &&
            segmentAverage >=
                cfg.goodAverage
        ) {
            return "comeback";
        }

        /*
         * O bloco atual pesa mais, mas a média acumulada
         * impede classificações exageradas por poucas notas.
         */
        const weighted =
            segmentAverage *
                0.68 +
            cumulativeAverage *
                0.32;

        if (
            weighted >=
            cfg.greatAverage
        ) {
            return "great";
        }

        if (
            weighted >=
            cfg.goodAverage
        ) {
            return "good";
        }

        return "struggling";
    }

    applyCheckpointVisual(category) {
        if (
            category ===
            "comeback"
        ) {
            this.triggerVisualFlash(
                "comeback",
                true
            );

            this.spawnPartyParticles(
                "comeback"
            );

            return;
        }

        if (
            category ===
            "great"
        ) {
            this.triggerVisualFlash(
                "great",
                true
            );

            this.spawnPartyParticles(
                "great"
            );

            return;
        }

        if (
            category ===
            "good"
        ) {
            this.spawnPartyParticles(
                "good"
            );

            return;
        }

        this.spawnPartyParticles(
            "struggling"
        );
    }

    /*
     * ========================================================
     * DIAGNÓSTICO CONTÍNUO
     *
     * Serve apenas ao ambiente visual.
     *
     * NÃO dispara memes e sons.
     * ========================================================
     */

    updatePerformanceDiagnosis() {
        const cfg =
            this.config.performance;

        const windowSize =
            Math.max(
                1,
                Number(
                    cfg.recentWindowSize
                ) ||
                10
            );

        const recent =
            this.performanceHistory.slice(
                -windowSize
            );

        const sampleSize =
            recent.length;

        if (
            sampleSize ===
            0
        ) {
            this.performanceDiagnosis =
                this.createEmptyDiagnosis();

            return;
        }

        const recentAverage =
            this.averageScores(
                recent
            );

        const positiveCount =
            recent.filter(
                item =>
                    item.status ===
                    "excellent"
            ).length;

        const errorCount =
            recent.filter(
                item =>
                    item.status ===
                        "error" ||
                    item.status ===
                        "missed"
            ).length;

        const positiveRatio =
            positiveCount /
            sampleSize;

        const errorRatio =
            errorCount /
            sampleSize;

        let trend =
            "stable";

        if (
            sampleSize >=
            4
        ) {
            const midpoint =
                Math.floor(
                    sampleSize /
                    2
                );

            const firstAverage =
                this.averageScores(
                    recent.slice(
                        0,
                        midpoint
                    )
                );

            const secondAverage =
                this.averageScores(
                    recent.slice(
                        midpoint
                    )
                );

            const difference =
                secondAverage -
                firstAverage;

            if (
                difference >=
                cfg.trendThreshold
            ) {
                trend =
                    "rising";

            } else if (
                difference <=
                -cfg.trendThreshold
            ) {
                trend =
                    "falling";
            }
        }

        let state =
            "neutral";

        if (
            sampleSize <
            cfg.minimumNotesForDiagnosis
        ) {
            state =
                "warming-up";

        } else if (
            recentAverage >=
                cfg.greatScore &&
            positiveRatio >=
                0.65
        ) {
            state =
                "great";

        } else if (
            recentAverage >=
            cfg.goodScore
        ) {
            state =
                "good";

        } else if (
            recentAverage <
                cfg.strugglingScore ||
            errorRatio >=
                0.60
        ) {
            state =
                "struggling";
        }

        const previousDiagnosis = {
            ...this.performanceDiagnosis
        };

        this.performanceDiagnosis = {
            state,

            recentAverage:
                Math.round(
                    recentAverage
                ),

            positiveRatio,

            errorRatio,

            trend,

            sampleSize
        };

        /*
         * Ambiente muda continuamente.
         *
         * MEMES/SOM NÃO.
         */
        this.updateVisualEnvironment(
            previousDiagnosis,
            this.performanceDiagnosis
        );

        this.dispatch(
            this.config.events.performanceChanged,
            this.getPerformanceState()
        );
    }

    /*
     * ========================================================
     * MEMES
     * ========================================================
     */

    async showRandomMeme(category) {
        if (
            !this.isActive() ||
            !this.memeStageAvailable ||
            this.memeActive
        ) {
            return false;
        }

        let manifest;

        try {
            manifest =
                await this.ensureManifestLoaded();

        } catch (error) {
            console.warn(
                "🎉 Não foi possível carregar os memes:",
                error
            );

            return false;
        }

        const rawPool =
            manifest?.memes?.[
                category
            ];

        if (
            !Array.isArray(
                rawPool
            ) ||
            rawPool.length ===
                0
        ) {
            console.debug(
                `🎉 PartyMode: nenhum meme cadastrado para "${category}".`
            );

            return false;
        }

        const pool =
            rawPool
                .map(
                    value =>
                        this.resolveManifestAssetUrl(
                            value
                        )
                )
                .filter(
                    Boolean
                );

        const selectedUrl =
            this.chooseNonRepeatingAsset(
                pool,
                this.recentMemeUrls,
                this.config.memes.avoidRecentCount
            );

        if (!selectedUrl) {
            return false;
        }

        return this.showMeme(
            selectedUrl,
            category
        );
    }

    chooseNonRepeatingAsset(
        pool,
        recentHistory,
        avoidRecentCount = 2
    ) {
        if (
            !Array.isArray(
                pool
            ) ||
            pool.length ===
                0
        ) {
            return null;
        }

        /*
         * REGRA CRÍTICA:
         *
         * se existe apenas UM asset,
         * ele SEMPRE pode ser reutilizado.
         *
         * Isso vale tanto para meme quanto para áudio.
         */
        if (
            pool.length ===
            1
        ) {
            return pool[0];
        }

        const avoidCount =
            Math.max(
                0,
                Number(
                    avoidRecentCount
                ) ||
                0
            );

        const recent =
            recentHistory.slice(
                -avoidCount
            );

        let candidates =
            pool.filter(
                url =>
                    !recent.includes(
                        url
                    )
            );

        if (
            candidates.length ===
            0
        ) {
            const last =
                recentHistory[
                    recentHistory.length -
                    1
                ];

            candidates =
                pool.filter(
                    url =>
                        url !==
                        last
                );
        }

        if (
            candidates.length ===
            0
        ) {
            candidates = [
                ...pool
            ];
        }

        return candidates[
            Math.floor(
                Math.random() *
                candidates.length
            )
        ];
    }

    async showMeme(
        url,
        category
    ) {
        if (
            !url ||
            !this.memeStage ||
            !this.memeMediaContainer ||
            this.memeActive
        ) {
            return false;
        }

        this.clearMemeTimers();

        this.positionMemeStage();

        const media =
            await this.createMemeMedia(
                url
            );

        if (!media) {
            return false;
        }

        this.memeMediaContainer
            .replaceChildren(
                media
            );

        /*
         * Meme propositalmente maior.
         */
        Object.assign(
            media.style,
            {
                width:
                    "100%",

                maxWidth:
                    "100%",

                maxHeight:
                    "64vh",

                objectFit:
                    "contain"
            }
        );

        const rotation =
            this.randomPhotoRotation();

        this.memeStage.style.setProperty(
            "--party-meme-rotation",
            `${rotation}deg`
        );

        this.memeStage.dataset.category =
            category;

        this.memeStage.classList.remove(
            "is-leaving"
        );

        this.memeStage.classList.add(
            "is-visible"
        );

        this.memeActive =
            true;

        this.activeMemeUrl =
            url;

        this.memeStage.style.visibility =
            "visible";

        this.memeStage.style.opacity =
            "1";

        this.memeStage.style.display =
            "block";

        this.memeStage.style.transform =
            `translateX(0) rotate(${rotation}deg) scale(1)`;

        if (this.memeAnimation) {
            try {
                this.memeAnimation.cancel();
            } catch {
                // Nada.
            }
        }

        /*
         * Entrada dramática pela esquerda.
         */
        if (
            !this.reducedMotion &&
            typeof this.memeStage.animate ===
                "function"
        ) {
            this.memeAnimation =
                this.memeStage.animate(
                    [
                        {
                            transform:
                                `translateX(-118%) rotate(${rotation - 5}deg) scale(0.88)`,

                            opacity:
                                0
                        },

                        {
                            transform:
                                `translateX(5%) rotate(${rotation + 1.5}deg) scale(1.03)`,

                            opacity:
                                1,

                            offset:
                                0.82
                        },

                        {
                            transform:
                                `translateX(0) rotate(${rotation}deg) scale(1)`,

                            opacity:
                                1
                        }
                    ],
                    {
                        duration:
                            620,

                        easing:
                            "cubic-bezier(.16,.84,.25,1.16)",

                        fill:
                            "both"
                    }
                );
        }

        if (
            media.tagName ===
            "VIDEO"
        ) {
            try {
                media.currentTime =
                    0;

                await media.play();

            } catch (error) {
                console.debug(
                    "PartyMode: autoplay do meme não iniciou imediatamente.",
                    error
                );
            }
        }

        this.recentMemeUrls.push(
            url
        );

        const maxRecent =
            Math.max(
                4,
                Number(
                    this.config.memes.avoidRecentCount
                ) +
                    3
            );

        if (
            this.recentMemeUrls.length >
            maxRecent
        ) {
            this.recentMemeUrls.splice(
                0,
                this.recentMemeUrls.length -
                    maxRecent
            );
        }

        this.dispatch(
            this.config.events.memeShown,
            {
                category,
                url
            }
        );

        console.info(
            `🎉 Meme EVENTO: ${category}`,
            url
        );

        this.memeHideTimer =
            window.setTimeout(
                () =>
                    this.hideMeme(),
                this.config.memes.displayDurationMs
            );

        return true;
    }

    async createMemeMedia(url) {
        const type =
            this.detectMediaType(
                url
            );

        if (
            type ===
            "image"
        ) {
            const image =
                document.createElement(
                    "img"
                );

            image.className =
                "party-meme-content";

            image.alt =
                "";

            image.decoding =
                "async";

            image.src =
                url;

            try {
                await this.waitForImage(
                    image
                );

                return image;

            } catch (error) {
                console.warn(
                    "🎉 Falha ao carregar meme:",
                    url,
                    error
                );

                return null;
            }
        }

        const video =
            document.createElement(
                "video"
            );

        video.className =
            "party-meme-content";

        video.src =
            url;

        video.muted =
            true;

        video.defaultMuted =
            true;

        video.volume =
            0;

        video.playsInline =
            true;

        video.preload =
            "auto";

        video.loop =
            true;

        video.controls =
            false;

        video.disablePictureInPicture =
            true;

        try {
            await this.waitForVideo(
                video
            );

            return video;

        } catch (error) {
            console.warn(
                "🎉 Falha ao carregar vídeo de meme:",
                url,
                error
            );

            return null;
        }
    }

    hideMeme(
        immediate = false
    ) {
        if (!this.memeStage) {
            return;
        }

        this.clearMemeTimers();

        const previousUrl =
            this.activeMemeUrl;

        if (
            this.memeAnimation
        ) {
            try {
                this.memeAnimation.cancel();
            } catch {
                // Nada.
            }

            this.memeAnimation =
                null;
        }

        if (immediate) {
            this.memeStage.classList.remove(
                "is-visible",
                "is-leaving"
            );

            this.memeStage.style.visibility =
                "hidden";

            this.memeStage.style.opacity =
                "0";

            this.removeCurrentMemeMedia();

            this.memeActive =
                false;

            this.activeMemeUrl =
                null;

            return;
        }

        if (!this.memeActive) {
            return;
        }

        this.memeStage.classList.remove(
            "is-visible"
        );

        this.memeStage.classList.add(
            "is-leaving"
        );

        const rotation =
            Number.parseFloat(
                this.memeStage.style
                    .getPropertyValue(
                        "--party-meme-rotation"
                    )
            ) ||
            0;

        if (
            !this.reducedMotion &&
            typeof this.memeStage.animate ===
                "function"
        ) {
            this.memeAnimation =
                this.memeStage.animate(
                    [
                        {
                            transform:
                                `translateX(0) rotate(${rotation}deg) scale(1)`,

                            opacity:
                                1
                        },

                        {
                            transform:
                                `translateX(-118%) rotate(${rotation - 5}deg) scale(0.94)`,

                            opacity:
                                0
                        }
                    ],
                    {
                        duration:
                            this.config.memes.exitDurationMs,

                        easing:
                            "cubic-bezier(.55,.02,.75,.35)",

                        fill:
                            "both"
                    }
                );
        }

        this.memeRemoveTimer =
            window.setTimeout(
                () => {
                    if (!this.memeStage) {
                        return;
                    }

                    this.memeStage.classList.remove(
                        "is-leaving"
                    );

                    this.memeStage.style.visibility =
                        "hidden";

                    this.memeStage.style.opacity =
                        "0";

                    this.removeCurrentMemeMedia();

                    this.memeActive =
                        false;

                    this.activeMemeUrl =
                        null;

                    this.memeAnimation =
                        null;

                    this.dispatch(
                        this.config.events.memeHidden,
                        {
                            url:
                                previousUrl
                        }
                    );
                },
                this.config.memes.exitDurationMs +
                    30
            );
    }

    removeCurrentMemeMedia() {
        if (
            !this.memeMediaContainer
        ) {
            return;
        }

        const video =
            this.memeMediaContainer.querySelector(
                "video"
            );

        if (video) {
            video.pause();

            video.removeAttribute(
                "src"
            );

            video.load();
        }

        this.memeMediaContainer
            .replaceChildren();
    }

    clearMemeTimers() {
        if (
            this.memeHideTimer !==
            null
        ) {
            window.clearTimeout(
                this.memeHideTimer
            );

            this.memeHideTimer =
                null;
        }

        if (
            this.memeRemoveTimer !==
            null
        ) {
            window.clearTimeout(
                this.memeRemoveTimer
            );

            this.memeRemoveTimer =
                null;
        }
    }

    detectMediaType(url) {
        const clean =
            String(
                url
            )
                .split("?")[0]
                .split("#")[0]
                .toLowerCase();

        const imageExtensions = [
            ".gif",
            ".webp",
            ".png",
            ".jpg",
            ".jpeg",
            ".avif"
        ];

        return imageExtensions.some(
            ext =>
                clean.endsWith(
                    ext
                )
        )
            ? "image"
            : "video";
    }

    waitForImage(image) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                if (
                    image.complete &&
                    image.naturalWidth >
                        0
                ) {
                    resolve();

                    return;
                }

                const timeout =
                    window.setTimeout(
                        () => {
                            cleanup();

                            reject(
                                new Error(
                                    "Timeout ao carregar imagem."
                                )
                            );
                        },
                        5000
                    );

                const onLoad =
                    () => {
                        cleanup();
                        resolve();
                    };

                const onError =
                    () => {
                        cleanup();

                        reject(
                            new Error(
                                "Erro ao carregar imagem."
                            )
                        );
                    };

                const cleanup =
                    () => {
                        window.clearTimeout(
                            timeout
                        );

                        image.removeEventListener(
                            "load",
                            onLoad
                        );

                        image.removeEventListener(
                            "error",
                            onError
                        );
                    };

                image.addEventListener(
                    "load",
                    onLoad
                );

                image.addEventListener(
                    "error",
                    onError
                );
            }
        );
    }

    waitForVideo(video) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                if (
                    video.readyState >=
                    2
                ) {
                    resolve();

                    return;
                }

                const timeout =
                    window.setTimeout(
                        () => {
                            cleanup();

                            reject(
                                new Error(
                                    "Timeout ao carregar vídeo."
                                )
                            );
                        },
                        6000
                    );

                const onReady =
                    () => {
                        cleanup();
                        resolve();
                    };

                const onError =
                    () => {
                        cleanup();

                        reject(
                            new Error(
                                "Erro ao carregar vídeo."
                            )
                        );
                    };

                const cleanup =
                    () => {
                        window.clearTimeout(
                            timeout
                        );

                        video.removeEventListener(
                            "loadeddata",
                            onReady
                        );

                        video.removeEventListener(
                            "error",
                            onError
                        );
                    };

                video.addEventListener(
                    "loadeddata",
                    onReady
                );

                video.addEventListener(
                    "error",
                    onError
                );

                video.load();
            }
        );
    }

    randomPhotoRotation() {
        let value =
            Math.random() *
                9 -
            4.5;

        if (
            Math.abs(
                value
            ) <
            1.2
        ) {
            value =
                value <
                    0
                    ? -2.2
                    : 2.2;
        }

        return Number(
            value.toFixed(
                2
            )
        );
    }

    /*
     * ========================================================
     * SOM
     * ========================================================
     */

    async showRandomSound(
        category,
        options = {}
    ) {
        if (!this.isActive()) {
            return false;
        }

        let manifest;

        try {
            manifest =
                await this.ensureManifestLoaded();

        } catch (error) {
            console.warn(
                "🎉 Não foi possível carregar efeitos sonoros:",
                error
            );

            return false;
        }

        const rawPool =
            manifest?.sounds?.[
                category
            ];

        if (
            !Array.isArray(
                rawPool
            ) ||
            rawPool.length ===
                0
        ) {
            console.debug(
                `🎉 PartyMode: nenhum som cadastrado para "${category}".`
            );

            return false;
        }

        const pool =
            rawPool
                .map(
                    value =>
                        this.resolveManifestAssetUrl(
                            value
                        )
                )
                .filter(
                    Boolean
                );

        if (
            pool.length ===
            0
        ) {
            return false;
        }

        /*
         * Um único áudio é SEMPRE reutilizável.
         */
        const selectedUrl =
            pool.length ===
                1
                ? pool[0]
                : this.chooseNonRepeatingAsset(
                    pool,
                    this.recentSoundUrls,
                    this.config.sounds.avoidRecentCount
                );

        if (!selectedUrl) {
            return false;
        }

        return this.playPartySound(
            selectedUrl,
            category,
            options
        );
    }

    async playPartySound(
        url,
        category,
        options = {}
    ) {
        const {
            forceEvent = false
        } = options;

        if (
            !url ||
            !this.isActive()
        ) {
            return false;
        }

        const now =
            Date.now();

        const elapsed =
            now -
            this.lastSoundAt;

        if (
            !forceEvent &&
            this.lastSoundAt >
                0 &&
            elapsed <
                this.config.sounds.cooldownMs
        ) {
            return false;
        }

        /*
         * Nunca acumulamos sons.
         *
         * Um novo evento substitui o anterior.
         *
         * Isso mantém a reação festiva sem poluição sonora.
         */
        if (
            this.soundActive ||
            this.activeSound
        ) {
            this.stopPartySound(
                true
            );
        }

        const audio =
            new Audio();

        audio.src =
            url;

        audio.preload =
            "auto";

        audio.volume =
            this.clampVolume(
                this.config.sounds.volume
            );

        audio.loop =
            false;

        this.soundActive =
            true;

        this.activeSound =
            audio;

        this.activeSoundUrl =
            url;

        audio.addEventListener(
            "ended",
            () =>
                this.finishPartySound(),
            {
                once:
                    true
            }
        );

        audio.addEventListener(
            "error",
            () => {
                console.warn(
                    "🎉 Erro ao reproduzir efeito:",
                    url
                );

                this.finishPartySound();
            },
            {
                once:
                    true
            }
        );

        this.applyBackingDucking();

        try {
            await audio.play();

        } catch (error) {
            console.warn(
                "🎉 Não foi possível iniciar o efeito sonoro:",
                url,
                error
            );

            this.finishPartySound();

            return false;
        }

        this.lastSoundAt =
            Date.now();

        this.recentSoundUrls.push(
            url
        );

        const maxRecent =
            Math.max(
                4,
                Number(
                    this.config.sounds.avoidRecentCount
                ) +
                    3
            );

        if (
            this.recentSoundUrls.length >
            maxRecent
        ) {
            this.recentSoundUrls.splice(
                0,
                this.recentSoundUrls.length -
                    maxRecent
            );
        }

        this.soundStopTimer =
            window.setTimeout(
                () =>
                    this.stopPartySound(),
                this.config.sounds.maximumDurationMs
            );

        this.dispatch(
            this.config.events.soundPlayed,
            {
                category,
                url
            }
        );

        console.info(
            `🔊 Efeito EVENTO: ${category}`,
            url
        );

        return true;
    }

    finishPartySound() {
        this.clearSoundTimer();

        this.restoreBackingVolume();

        if (
            this.activeSound
        ) {
            try {
                this.activeSound.pause();
            } catch {
                // Nada.
            }

            this.activeSound.removeAttribute(
                "src"
            );

            try {
                this.activeSound.load();
            } catch {
                // Nada.
            }
        }

        this.activeSound =
            null;

        this.activeSoundUrl =
            null;

        this.soundActive =
            false;
    }

    stopPartySound(
        immediate = false
    ) {
        this.clearSoundTimer();

        if (
            this.activeSound
        ) {
            try {
                this.activeSound.pause();

                this.activeSound.currentTime =
                    0;
            } catch {
                // Nada.
            }

            this.activeSound.removeAttribute(
                "src"
            );

            try {
                this.activeSound.load();
            } catch {
                // Nada.
            }
        }

        this.activeSound =
            null;

        this.activeSoundUrl =
            null;

        this.soundActive =
            false;

        if (immediate) {
            this.restoreBackingVolume(
                true
            );

        } else {
            this.restoreBackingVolume();
        }
    }

    clearSoundTimer() {
        if (
            this.soundStopTimer !==
            null
        ) {
            window.clearTimeout(
                this.soundStopTimer
            );

            this.soundStopTimer =
                null;
        }
    }

    findBackingAudio() {
        return (
            document.getElementById(
                "backingTrackAudio"
            ) ||
            document.getElementById(
                "backingAudio"
            ) ||
            document.querySelector(
                'audio[data-role="backing"]'
            ) ||
            null
        );
    }

    applyBackingDucking() {
        if (
            !this.config.sounds.duckingEnabled
        ) {
            return;
        }

        const backingAudio =
            this.findBackingAudio();

        if (!backingAudio) {
            return;
        }

        if (
            this.backingOriginalVolume ===
            null
        ) {
            this.backingOriginalVolume =
                this.clampVolume(
                    backingAudio.volume
                );
        }

        const target =
            this.clampVolume(
                this.backingOriginalVolume *
                this.config.sounds.duckingFactor
            );

        this.animateAudioVolume(
            backingAudio,
            target,
            this.config.sounds.duckingFadeMs
        );
    }

    restoreBackingVolume(
        immediate = false
    ) {
        if (
            this.backingOriginalVolume ===
            null
        ) {
            return;
        }

        const backingAudio =
            this.findBackingAudio();

        const target =
            this.backingOriginalVolume;

        this.backingOriginalVolume =
            null;

        if (!backingAudio) {
            return;
        }

        if (immediate) {
            this.cancelDuckingAnimation();

            backingAudio.volume =
                target;

            return;
        }

        this.animateAudioVolume(
            backingAudio,
            target,
            this.config.sounds.duckingRestoreMs
        );
    }

    animateAudioVolume(
        audio,
        targetVolume,
        durationMs
    ) {
        if (!audio) {
            return;
        }

        this.cancelDuckingAnimation();

        const startVolume =
            this.clampVolume(
                audio.volume
            );

        const finalVolume =
            this.clampVolume(
                targetVolume
            );

        const duration =
            Math.max(
                0,
                Number(
                    durationMs
                ) ||
                0
            );

        if (
            duration ===
                0 ||
            Math.abs(
                finalVolume -
                startVolume
            ) <
                0.001
        ) {
            audio.volume =
                finalVolume;

            return;
        }

        const startTime =
            performance.now();

        const step =
            now => {
                const progress =
                    Math.min(
                        1,
                        (
                            now -
                            startTime
                        ) /
                        duration
                    );

                audio.volume =
                    this.clampVolume(
                        startVolume +
                        (
                            finalVolume -
                            startVolume
                        ) *
                        progress
                    );

                if (
                    progress <
                    1
                ) {
                    this.duckingAnimationFrame =
                        requestAnimationFrame(
                            step
                        );

                } else {
                    this.duckingAnimationFrame =
                        null;
                }
            };

        this.duckingAnimationFrame =
            requestAnimationFrame(
                step
            );
    }

    cancelDuckingAnimation() {
        if (
            this.duckingAnimationFrame !==
            null
        ) {
            cancelAnimationFrame(
                this.duckingAnimationFrame
            );

            this.duckingAnimationFrame =
                null;
        }
    }

    clampVolume(value) {
        const numeric =
            Number(
                value
            );

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(
                1,
                numeric
            )
        );
    }

    /*
     * ========================================================
     * PARTÍCULAS / CONFETE / FOGOS
     * ========================================================
     */


    spawnPartyParticles(
        category,
        overrideCount =
            null
    ) {

        if (
            !this.isActive()
        ) {

            console.warn(
                "🎉 Partículas ignoradas: PartyMode inativo."
            );


            return false;
        }


        if (
            !this.particleStage
        ) {

            console.error(
                "🎉 Partículas ignoradas: particleStage ausente."
            );


            return false;
        }


        if (
            this.reducedMotion
        ) {

            console.info(
                "🎉 Partículas ignoradas: preferência por movimento reduzido."
            );


            return false;
        }


        /*
        * Se sobraram objetos de um evento anterior,
        * eliminamos antes da nova celebração.
        */
        if (
            this.liveParticles.size >
            0
        ) {

            this.clearParticles();
        }


        let count;


        switch (
            category
        ) {

            case "great":

                count =
                    this.config.particles.greatCount;

                break;


            case "comeback":

                count =
                    this.config.particles.comebackCount;

                break;


            case "struggling":

                count =
                    this.config.particles.strugglingCount;

                break;


            case "good":
            default:

                count =
                    this.config.particles.goodCount;

                break;
        }


        if (
            overrideCount !==
                null &&
            Number.isFinite(
                Number(
                    overrideCount
                )
            )
        ) {

            count =
                Number(
                    overrideCount
                );
        }


        count =
            Math.max(
                1,
                Math.min(
                    Number(
                        count
                    ) ||
                        1,
                    this.config.particles.maxAlive
                )
            );


        console.info(
            "🎉 Criando efeito de partículas:",
            {
                category,
                count,

                stageRect:
                    this.particleStage
                        .getBoundingClientRect()
            }
        );


        if (
            category ===
                "great" ||
            category ===
                "comeback"
        ) {

            const fireworks =
                Math.max(
                    18,
                    Math.floor(
                        count *
                        0.62
                    )
                );


            this.spawnFireworkBurst(
                fireworks,
                category
            );


            const confetti =
                Math.max(
                    10,
                    count -
                        fireworks
                );


            this.spawnConfetti(
                confetti,
                category
            );


        } else if (
            category ===
            "good"
        ) {

            this.spawnConfetti(
                count,
                category
            );


        } else {

            this.spawnComicSparkles(
                count
            );
        }


        this.dispatch(
            this.config.events.particles,
            {
                category,
                count
            }
        );


        return true;
    }

    spawnConfetti(
        count,
        category = "good"
    ) {
        const colors =
            category ===
                "comeback"
                ? [
                    "#c084fc",
                    "#fff018",
                    "#3ad077",
                    "#10abe1",
                    "#ffffff"
                ]
                : [
                    "#fff018",
                    "#10abe1",
                    "#f33138",
                    "#c084fc",
                    "#3ad077",
                    "#ffffff"
                ];

        for (
            let i = 0;
            i < count;
            i += 1
        ) {
            const particle =
                document.createElement(
                    "span"
                );

            const size =
                7 +
                Math.random() *
                9;

            const startX =
                8 +
                Math.random() *
                84;

            const startY =
                -8 -
                Math.random() *
                16;

            const drift =
                -70 +
                Math.random() *
                140;

            const rotation =
                Math.random() *
                    720 -
                360;

            const duration =
                1200 +
                Math.random() *
                1300;

            Object.assign(
                particle.style,
                {
                    position:
                        "absolute",

                    left:
                        `${startX}%`,

                    top:
                        `${startY}%`,

                    width:
                        `${size}px`,

                    height:
                        `${size * (
                            0.45 +
                            Math.random() *
                            0.8
                        )}px`,

                    background:
                        colors[
                            Math.floor(
                                Math.random() *
                                colors.length
                            )
                        ],

                    border:
                        "1px solid rgba(0,0,0,.35)",

                    borderRadius:
                        Math.random() >
                            0.6
                            ? "50%"
                            : "2px",

                    boxShadow:
                        "0 2px 5px rgba(0,0,0,.25)",

                    transform:
                        "translate3d(0,0,0)",

                    willChange:
                        "transform, opacity"
                }
            );

            this.particleStage
                .appendChild(
                    particle
                );

            this.trackParticle(
                particle
            );

            const animation =
                particle.animate(
                    [
                        {
                            transform:
                                "translate3d(0,0,0) rotate(0deg)",

                            opacity:
                                0
                        },

                        {
                            opacity:
                                1,

                            offset:
                                0.10
                        },

                        {
                            transform:
                                `translate3d(${drift}px, ${window.innerHeight * 0.72}px, 0) rotate(${rotation}deg)`,

                            opacity:
                                0.9,

                            offset:
                                0.82
                        },

                        {
                            transform:
                                `translate3d(${drift * 1.15}px, ${window.innerHeight * 0.92}px, 0) rotate(${rotation * 1.25}deg)`,

                            opacity:
                                0
                        }
                    ],
                    {
                        duration,

                        easing:
                            "cubic-bezier(.18,.65,.35,1)",

                        fill:
                            "forwards"
                    }
                );

            animation.finished
                .catch(
                    () => {}
                )
                .finally(
                    () =>
                        this.removeParticle(
                            particle
                        )
                );
        }
    }

    spawnFireworkBurst(
        count,
        category =
            "great"
    ) {

        if (
            !this.particleStage
        ) {

            return;
        }


        const colors =
            category ===
                "comeback"
                ? [
                    "#c084fc",
                    "#fff018",
                    "#3ad077",
                    "#10abe1",
                    "#ffffff",
                    "#ff4fd8"
                ]
                : [
                    "#fff018",
                    "#10abe1",
                    "#f33138",
                    "#c084fc",
                    "#3ad077",
                    "#ffffff",
                    "#ff4fd8"
                ];


        /*
        * Criamos vários centros de explosão.
        *
        * Concentrados especialmente do meio para
        * a direita da tela.
        */

        const burstCount =
            category ===
                "comeback"
                ? 4
                : 3;


        const particlesPerBurst =
            Math.max(
                10,
                Math.floor(
                    count /
                    burstCount
                )
            );


        for (
            let burst =
                0;
            burst <
                burstCount;
            burst +=
                1
        ) {

            const originX =
                58 +
                Math.random() *
                34;


            const originY =
                18 +
                Math.random() *
                48;


            for (
                let i =
                    0;
                i <
                    particlesPerBurst;
                i +=
                    1
            ) {

                const particle =
                    document.createElement(
                        "span"
                    );


                const angle =
                    (
                        Math.PI *
                        2 *
                        i
                    ) /
                    particlesPerBurst +
                    (
                        Math.random() -
                        0.5
                    ) *
                    0.20;


                const distance =
                    90 +
                    Math.random() *
                    180;


                const dx =
                    Math.cos(
                        angle
                    ) *
                    distance;


                const dy =
                    Math.sin(
                        angle
                    ) *
                    distance;


                const size =
                    6 +
                    Math.random() *
                    8;


                const color =
                    colors[
                        Math.floor(
                            Math.random() *
                            colors.length
                        )
                    ];


                Object.assign(
                    particle.style,
                    {
                        position:
                            "absolute",

                        left:
                            `${originX}%`,

                        top:
                            `${originY}%`,

                        width:
                            `${size}px`,

                        height:
                            `${size}px`,

                        borderRadius:
                            "50%",

                        background:
                            color,

                        color:
                            color,

                        border:
                            "1px solid rgba(255,255,255,.55)",

                        boxShadow:
                            `0 0 8px ${color},
                            0 0 18px ${color},
                            0 0 30px rgba(255,255,255,.55)`,

                        opacity:
                            "1",

                        transform:
                            "translate(-50%, -50%) scale(.2)",

                        willChange:
                            "transform, opacity"
                    }
                );


                this.particleStage.appendChild(
                    particle
                );


                this.trackParticle(
                    particle
                );


                const animation =
                    particle.animate(
                        [
                            {
                                transform:
                                    "translate(-50%, -50%) scale(.1)",

                                opacity:
                                    0
                            },

                            {
                                transform:
                                    "translate(-50%, -50%) scale(1.5)",

                                opacity:
                                    1,

                                offset:
                                    0.12
                            },

                            {
                                transform:
                                    `translate(
                                        calc(-50% + ${dx}px),
                                        calc(-50% + ${dy}px)
                                    )
                                    scale(1)`,

                                opacity:
                                    1,

                                offset:
                                    0.68
                            },

                            {
                                transform:
                                    `translate(
                                        calc(-50% + ${dx * 1.12}px),
                                        calc(-50% + ${dy * 1.12 + 45}px)
                                    )
                                    scale(.2)`,

                                opacity:
                                    0
                            }
                        ],
                        {
                            duration:
                                1200 +
                                Math.random() *
                                650,

                            delay:
                                burst *
                                    190,

                            easing:
                                "cubic-bezier(.12,.66,.22,1)",

                            fill:
                                "forwards"
                        }
                    );


                animation.finished
                    .catch(
                        () => {}
                    )
                    .finally(
                        () => {

                            this.removeParticle(
                                particle
                            );
                        }
                    );
            }
        }
    }

    spawnComicSparkles(count) {
        const glyphs = [
            "★",
            "✦",
            "✧",
            "!",
            "?",
            "✹"
        ];

        const colors = [
            "#c084fc",
            "#ac4d8a",
            "#10abe1",
            "#fff018",
            "#ffffff"
        ];

        for (
            let i = 0;
            i < count;
            i += 1
        ) {
            const particle =
                document.createElement(
                    "span"
                );

            particle.textContent =
                glyphs[
                    Math.floor(
                        Math.random() *
                        glyphs.length
                    )
                ];

            Object.assign(
                particle.style,
                {
                    position:
                        "absolute",

                    left:
                        `${15 + Math.random() * 75}%`,

                    top:
                        `${20 + Math.random() * 60}%`,

                    color:
                        colors[
                            Math.floor(
                                Math.random() *
                                colors.length
                            )
                        ],

                    fontSize:
                        `${18 + Math.random() * 26}px`,

                    fontWeight:
                        "900",

                    WebkitTextStroke:
                        "1px #111",

                    textShadow:
                        "2px 2px 0 #111",

                    willChange:
                        "transform, opacity"
                }
            );

            this.particleStage
                .appendChild(
                    particle
                );

            this.trackParticle(
                particle
            );

            const dx =
                -35 +
                Math.random() *
                70;

            const dy =
                -45 -
                Math.random() *
                90;

            const animation =
                particle.animate(
                    [
                        {
                            transform:
                                "translate(0,0) scale(.2) rotate(-20deg)",

                            opacity:
                                0
                        },

                        {
                            transform:
                                "translate(0,0) scale(1.25) rotate(5deg)",

                            opacity:
                                1,

                            offset:
                                0.28
                        },

                        {
                            transform:
                                `translate(${dx}px, ${dy}px) scale(.85) rotate(20deg)`,

                            opacity:
                                0
                        }
                    ],
                    {
                        duration:
                            850 +
                            Math.random() *
                            500,

                        easing:
                            "cubic-bezier(.18,.75,.25,1)",

                        fill:
                            "forwards"
                    }
                );

            animation.finished
                .catch(
                    () => {}
                )
                .finally(
                    () =>
                        this.removeParticle(
                            particle
                        )
                );
        }
    }

    trackParticle(node) {
        this.liveParticles.add(
            node
        );
    }

    removeParticle(node) {
        this.liveParticles.delete(
            node
        );

        if (
            node?.isConnected
        ) {
            node.remove();
        }
    }

    clearParticles() {
        for (
            const node
            of this.liveParticles
        ) {
            if (
                node?.isConnected
            ) {
                node.remove();
            }
        }

        this.liveParticles.clear();

        if (
            this.particleStage
        ) {
            this.particleStage
                .replaceChildren();
        }
    }

    /*
     * ========================================================
     * OVERLAY / AMBIENTE
     * ========================================================
     */

    updateVisualEnvironment(
        previousDiagnosis,
        currentDiagnosis
    ) {
        if (
            !this.visualOverlay
        ) {
            return;
        }

        if (
            !this.isActive()
        ) {
            this.setVisualState(
                "idle"
            );

            return;
        }

        const state =
            currentDiagnosis?.state ||
            "neutral";

        this.setVisualState(
            state
        );

        /*
         * Flash contínuo é raro:
         * apenas quando existe uma mudança REAL para great.
         *
         * Os grandes flashes continuam reservados
         * aos checkpoints.
         */
        if (
            state ===
                "great" &&
            previousDiagnosis?.state !==
                "great"
        ) {
            this.triggerVisualFlash(
                "great"
            );
        }
    }

    setVisualState(state) {
        if (
            !this.visualOverlay
        ) {
            return;
        }

        const allowedStates = [
            "idle",
            "warming-up",
            "neutral",
            "good",
            "great",
            "struggling",
            "comeback"
        ];

        const safeState =
            allowedStates.includes(
                state
            )
                ? state
                : "neutral";

        this.currentVisualState =
            safeState;

        this.visualOverlay.dataset.state =
            safeState;
    }

    triggerVisualFlash(
        type = "great",
        force = false
    ) {
        if (
            !this.visualOverlay ||
            !this.isActive()
        ) {
            return;
        }

        const now =
            Date.now();

        if (
            !force &&
            now -
                this.lastVisualFlashAt <
                this.config.visuals.flashCooldownMs
        ) {
            return;
        }

        this.lastVisualFlashAt =
            now;

        if (
            this.visualFlashTimer !==
            null
        ) {
            window.clearTimeout(
                this.visualFlashTimer
            );

            this.visualFlashTimer =
                null;
        }

        this.visualOverlay.classList.remove(
            "party-visual-flash"
        );

        this.visualOverlay.dataset.flash =
            type;

        /*
         * Reflow proposital para reiniciar
         * a animação CSS.
         */
        void this.visualOverlay.offsetWidth;

        this.visualOverlay.classList.add(
            "party-visual-flash"
        );

        this.visualFlashTimer =
            window.setTimeout(
                () => {
                    if (
                        !this.visualOverlay
                    ) {
                        return;
                    }

                    this.visualOverlay.classList.remove(
                        "party-visual-flash"
                    );

                    delete this.visualOverlay.dataset.flash;

                    this.visualFlashTimer =
                        null;
                },
                this.config.visuals.flashDurationMs
            );
    }

    resetVisualEnvironment() {
        if (
            this.visualFlashTimer !==
            null
        ) {
            window.clearTimeout(
                this.visualFlashTimer
            );

            this.visualFlashTimer =
                null;
        }

        this.currentVisualState =
            "idle";

        this.lastVisualFlashAt =
            0;

        if (
            this.visualOverlay
        ) {
            this.visualOverlay.classList.remove(
                "party-visual-flash"
            );

            this.visualOverlay.dataset.state =
                "idle";

            delete this.visualOverlay.dataset.flash;
        }
    }

    /*
     * ========================================================
     * VÍDEO DE FUNDO POR MÚSICA
     * ========================================================
     *
     * Camada opcional abaixo do party-visual-overlay.
     *
     * - não sincroniza com o MP3;
     * - sempre muted / loop / playsinline;
     * - nunca é requisito para o treino;
     * - qualquer falha volta ao background CSS.
     * ========================================================
     */

    createBackgroundVideo() {
        const settings =
            this.config.backgroundVideo;

        const existing =
            document.getElementById(
                settings.elementId
            );

        const video =
            existing ||
            document.createElement(
                "video"
            );

        video.id =
            settings.elementId;

        video.classList.add(
            "party-background-video"
        );

        video.muted =
            true;

        video.defaultMuted =
            true;

        video.loop =
            true;

        video.playsInline =
            true;

        video.controls =
            false;

        video.preload =
            "metadata";

        video.disablePictureInPicture =
            true;

        video.disableRemotePlayback =
            true;

        video.tabIndex =
            -1;

        video.setAttribute(
            "muted",
            ""
        );

        video.setAttribute(
            "playsinline",
            ""
        );

        video.setAttribute(
            "webkit-playsinline",
            ""
        );

        video.setAttribute(
            "aria-hidden",
            "true"
        );

        video.style.setProperty(
            "--party-background-video-fade",
            `${Math.max(0, Number(settings.fadeMs) || 0)}ms`
        );

        video.addEventListener(
            "loadeddata",
            this.boundHandleBackgroundVideoLoaded
        );

        video.addEventListener(
            "error",
            this.boundHandleBackgroundVideoError
        );

        if (!existing) {
            document.body.appendChild(
                video
            );
        }

        this.backgroundVideoElement =
            video;
    }

    prepareBackgroundVideo(url) {
        const video =
            this.backgroundVideoElement;

        const normalizedUrl =
            typeof url ===
            "string"
                ? url.trim()
                : "";

        if (
            !video ||
            !normalizedUrl
        ) {
            this.clearBackgroundVideo();

            return false;
        }

        /*
         * Mesma música: não recarrega.
         * Se falhou antes, tentamos novamente nesta sessão.
         */
        if (
            normalizedUrl ===
                this.backgroundVideoUrl &&
            !this.backgroundVideoFailed
        ) {
            return true;
        }

        this.backgroundVideoPlayToken += 1;

        this.setBackgroundVideoVisible(
            false
        );

        video.pause();

        this.backgroundVideoUrl =
            normalizedUrl;

        this.backgroundVideoReady =
            false;

        this.backgroundVideoFailed =
            false;

        video.src =
            normalizedUrl;

        video.load();

        return true;
    }

    playBackgroundVideo() {
        const video =
            this.backgroundVideoElement;

        if (
            !video ||
            !this.backgroundVideoUrl ||
            this.backgroundVideoFailed ||
            !this.sessionActive ||
            !this.isActive()
        ) {
            return false;
        }

        video.muted =
            true;

        video.defaultMuted =
            true;

        video.loop =
            true;

        video.playsInline =
            true;

        this.backgroundVideoPlayToken += 1;

        const playToken =
            this.backgroundVideoPlayToken;

        let playResult;

        try {
            playResult =
                video.play();

        } catch (error) {
            this.handleBackgroundVideoError(
                error
            );

            return false;
        }

        if (
            !playResult ||
            typeof playResult.then !==
            "function"
        ) {
            this.setBackgroundVideoVisible(
                true
            );

            return true;
        }

        playResult
            .then(
                () => {
                    if (
                        playToken !==
                        this.backgroundVideoPlayToken
                    ) {
                        return;
                    }

                    if (
                        !this.sessionActive ||
                        !this.isActive()
                    ) {
                        video.pause();

                        return;
                    }

                    this.backgroundVideoReady =
                        true;

                    this.setBackgroundVideoVisible(
                        true
                    );
                }
            )
            .catch(
                error => {
                    if (
                        playToken !==
                        this.backgroundVideoPlayToken
                    ) {
                        return;
                    }

                    /*
                     * AbortError = play() interrompido por
                     * pause()/troca de src. Não é falha do asset.
                     */
                    if (
                        error?.name ===
                        "AbortError"
                    ) {
                        return;
                    }

                    this.handleBackgroundVideoError(
                        error
                    );
                }
            );

        return true;
    }

    pauseBackgroundVideo() {
        this.backgroundVideoPlayToken += 1;

        this.setBackgroundVideoVisible(
            false
        );

        const video =
            this.backgroundVideoElement;

        if (
            video &&
            !video.paused
        ) {
            video.pause();
        }
    }

    stopBackgroundVideo() {
        this.pauseBackgroundVideo();

        const video =
            this.backgroundVideoElement;

        if (!video) {
            return;
        }

        try {
            video.currentTime =
                0;

        } catch (error) {
            /*
             * Sem metadata ainda: nada a resetar.
             */
        }
    }

    clearBackgroundVideo() {
        this.pauseBackgroundVideo();

        const video =
            this.backgroundVideoElement;

        if (video) {
            /*
             * removeAttribute em vez de src = "",
             * que dispararia um evento de erro.
             */
            video.removeAttribute(
                "src"
            );

            try {
                video.load();

            } catch (error) {
                /*
                 * Defensivo: alguns navegadores podem
                 * rejeitar load() sem fonte.
                 */
            }
        }

        this.backgroundVideoUrl =
            null;

        this.backgroundVideoReady =
            false;

        this.backgroundVideoFailed =
            false;
    }

    handleBackgroundVideoLoaded() {
        if (!this.backgroundVideoUrl) {
            return;
        }

        this.backgroundVideoReady =
            true;
    }

    handleBackgroundVideoError(error) {
        /*
         * Sem URL = elemento vazio (clear/destroy).
         * Já falhou = evita avisos duplicados.
         */
        if (
            !this.backgroundVideoUrl ||
            this.backgroundVideoFailed
        ) {
            return;
        }

        const mediaError =
            this.backgroundVideoElement?.error ||
            null;

        console.warn(
            "🎉 PartyMode: vídeo de fundo indisponível. Usando background CSS.",
            {
                url:
                    this.backgroundVideoUrl,

                error:
                    error?.name ||
                    error?.message ||
                    error?.type ||
                    error,

                mediaErrorCode:
                    mediaError?.code ??
                    null
            }
        );

        this.backgroundVideoFailed =
            true;

        this.backgroundVideoReady =
            false;

        this.pauseBackgroundVideo();
    }

    /*
     * A classe do body só é aplicada quando o vídeo está
     * realmente tocando e visível. Assim o overlay só fica
     * translúcido quando existe vídeo por trás dele.
     */
    setBackgroundVideoVisible(visible) {
        const settings =
            this.config.backgroundVideo;

        const video =
            this.backgroundVideoElement;

        const shouldShow =
            Boolean(
                visible
            ) &&
            Boolean(
                video
            ) &&
            !this.backgroundVideoFailed;

        this.backgroundVideoVisible =
            shouldShow;

        if (video) {
            video.classList.toggle(
                settings.visibleClass,
                shouldShow
            );
        }

        document.body.classList.toggle(
            settings.bodyClass,
            shouldShow
        );
    }

    /*
     * ========================================================
     * ESTADO PÚBLICO / TESTES
     * ========================================================
     */

    getPerformanceState() {
        const windowSize =
            Math.max(
                1,
                Number(
                    this.config.performance.recentWindowSize
                ) ||
                10
            );

        return {
            sessionActive:
                this.sessionActive,

            sessionInfo:
                this.sessionInfo
                    ? {
                        ...this.sessionInfo
                    }
                    : null,

            combo:
                this.currentCombo,

            bestCombo:
                this.bestCombo,

            historySize:
                this.performanceHistory.length,

            diagnosis: {
                ...this.performanceDiagnosis
            },

            recentNotes:
                this.performanceHistory
                    .slice(
                        -windowSize
                    )
                    .map(
                        item => ({
                            ...item
                        })
                    ),

            sessionStats: {
                ...this.sessionStats
            },

            checkpoint: {
                size:
                    this.checkpointSize,

                nextAt:
                    this.nextCheckpointAt,

                index:
                    this.checkpointIndex,

                lastAverage:
                    this.lastCheckpointAverage,

                lastCategory:
                    this.lastCheckpointCategory
            },

            lastSessionSummary:
                this.lastSessionSummary
                    ? {
                        ...this.lastSessionSummary
                    }
                    : null
        };
    }

    getState() {
        return {
            initialized:
                this.initialized,

            available:
                this.available,

            enabled:
                this.enabled,

            reducedMotion:
                this.reducedMotion,

            side:
                "left",

            savedPreference:
                this.savedPreference,

            memeStageAvailable:
                this.memeStageAvailable,

            memeActive:
                this.memeActive,

            activeMemeUrl:
                this.activeMemeUrl,

            soundActive:
                this.soundActive,

            activeSoundUrl:
                this.activeSoundUrl,

            visualState:
                this.currentVisualState,

            visualOverlayReady:
                Boolean(
                    this.visualOverlay
                ),

            particlesAlive:
                this.liveParticles.size,

            manifestLoaded:
                Boolean(
                    this.partyManifest
                ),

            backgroundVideo: {
                url:
                    this.backgroundVideoUrl,

                ready:
                    this.backgroundVideoReady,

                failed:
                    this.backgroundVideoFailed,

                visible:
                    this.backgroundVideoVisible
            },

            performance:
                this.getPerformanceState()
        };
    }

    /*
     * ========================================================
     * TESTES MANUAIS
     * ========================================================
     */

    async testMeme(
        category = "good"
    ) {
        if (
            !this.isActive()
        ) {
            console.warn(
                "🎉 Ative o Modo Festa antes de testar memes."
            );

            return false;
        }

        return this.showRandomMeme(
            category
        );
    }

    async testSound(
        category = "good"
    ) {
        if (
            !this.isActive()
        ) {
            console.warn(
                "🎉 Ative o Modo Festa antes de testar sons."
            );

            return false;
        }

        return this.showRandomSound(
            category,
            {
                forceEvent:
                    true
            }
        );
    }

    /*
    * ========================================================
    * TESTE MANUAL DE PARTÍCULAS
    * ========================================================
    */

    testParticles(
        category =
            "great"
    ) {

        if (
            !this.isActive()
        ) {

            console.warn(
                "🎉 Teste cancelado: Modo Festa não está ativo."
            );


            return false;
        }


        if (
            !this.particleStage
        ) {

            console.error(
                "🎉 Teste cancelado: particleStage não existe."
            );


            return false;
        }


        if (
            this.reducedMotion
        ) {

            console.warn(
                "🎉 Teste cancelado: reducedMotion está ativo."
            );


            return false;
        }


        /*
        * Limpamos qualquer efeito antigo antes do teste.
        */
        this.clearParticles();


        console.info(
            "🎉 Teste de partículas iniciado.",
            {
                category,

                stage:
                    this.particleStage,

                rect:
                    this.particleStage
                        .getBoundingClientRect(),

                zIndex:
                    getComputedStyle(
                        this.particleStage
                    ).zIndex
            }
        );


        this.spawnPartyParticles(
            category
        );


        return true;
    }


    /*
    * ========================================================
    * TESTE VISUAL BRUTO DO PALCO
    * ========================================================
    *
    * Não usa Element.animate().
    *
    * Serve exclusivamente para confirmar:
    *
    * - criação do stage;
    * - posicionamento;
    * - z-index;
    * - visibilidade.
    *
    * PartyMode.testParticleStage()
    * ========================================================
    */

    testParticleStage() {

        if (
            !this.isActive()
        ) {

            console.warn(
                "🎉 Ative o Modo Festa primeiro."
            );


            return false;
        }


        if (
            !this.particleStage
        ) {

            console.error(
                "🎉 particleStage não existe."
            );


            return false;
        }


        this.clearParticles();


        const test =
            document.createElement(
                "div"
            );


        test.textContent =
            "🎉";


        Object.assign(
            test.style,
            {
                position:
                    "absolute",

                right:
                    "120px",

                top:
                    "220px",

                width:
                    "140px",

                height:
                    "140px",

                display:
                    "flex",

                alignItems:
                    "center",

                justifyContent:
                    "center",

                background:
                    "#fff018",

                color:
                    "#111",

                border:
                    "8px solid #111",

                borderRadius:
                    "50%",

                boxShadow:
                    "12px 12px 0 #f33138",

                fontSize:
                    "72px",

                fontWeight:
                    "900",

                zIndex:
                    "10"
            }
        );


        this.particleStage.appendChild(
            test
        );


        window.setTimeout(
            () => {

                if (
                    test.isConnected
                ) {

                    test.remove();
                }

            },
            4000
        );


        console.info(
            "🎉 TESTE BRUTO DO PALCO:",
            {
                stage:
                    this.particleStage,

                stageRect:
                    this.particleStage
                        .getBoundingClientRect(),

                computedDisplay:
                    getComputedStyle(
                        this.particleStage
                    ).display,

                computedVisibility:
                    getComputedStyle(
                        this.particleStage
                    ).visibility,

                computedZIndex:
                    getComputedStyle(
                        this.particleStage
                    ).zIndex
            }
        );


        return true;
    }


    async testCheckpoint(
        category = null
    ) {
        if (
            !this.isActive()
        ) {
            console.warn(
                "🎉 Ative o Modo Festa antes de testar checkpoint."
            );

            return false;
        }

        /*
         * Com categoria fornecida,
         * simulamos diretamente um grande evento.
         */
        if (category) {
            this.applyCheckpointVisual(
                category
            );

            await Promise.allSettled(
                [
                    this.showRandomMeme(
                        category
                    ),

                    this.showRandomSound(
                        category,
                        {
                            forceEvent:
                                true
                        }
                    )
                ]
            );

            return true;
        }

        /*
         * Sem categoria, roda a avaliação real
         * dos dados acumulados.
         */
        return this.runCheckpoint(
            false
        );
    }

    /*
     * ========================================================
     * HELPERS
     * ========================================================
     */

    averageScores(items) {
        if (
            !Array.isArray(
                items
            ) ||
            items.length ===
                0
        ) {
            return 0;
        }

        return (
            items.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    Number(
                        item.score ||
                        0
                    ),
                0
            ) /
            items.length
        );
    }

    toFiniteNumberOrNull(value) {
        const numeric =
            Number(
                value
            );

        return Number.isFinite(
            numeric
        )
            ? numeric
            : null;
    }

    toFiniteNumberOrFallback(
        value,
        fallback = 0
    ) {
        const numeric =
            Number(
                value
            );

        return Number.isFinite(
            numeric
        )
            ? numeric
            : fallback;
    }

    handleResize() {
        if (
            this.resizeFrame !==
            null
        ) {
            cancelAnimationFrame(
                this.resizeFrame
            );
        }

        this.resizeFrame =
            requestAnimationFrame(
                () => {
                    this.resizeFrame =
                        null;

                    this.refreshCapability();
                }
            );
    }

    handleCapabilityChange() {
        this.refreshCapability();
    }

    addMediaQueryListener(
        mediaQuery,
        callback
    ) {
        if (!mediaQuery) {
            return;
        }

        if (
            typeof mediaQuery.addEventListener ===
            "function"
        ) {
            mediaQuery.addEventListener(
                "change",
                callback
            );

        } else if (
            typeof mediaQuery.addListener ===
            "function"
        ) {
            mediaQuery.addListener(
                callback
            );
        }
    }

    removeMediaQueryListener(
        mediaQuery,
        callback
    ) {
        if (!mediaQuery) {
            return;
        }

        if (
            typeof mediaQuery.removeEventListener ===
            "function"
        ) {
            mediaQuery.removeEventListener(
                "change",
                callback
            );

        } else if (
            typeof mediaQuery.removeListener ===
            "function"
        ) {
            mediaQuery.removeListener(
                callback
            );
        }
    }

    dispatch(
        eventName,
        detail = {}
    ) {
        if (!eventName) {
            return;
        }

        document.dispatchEvent(
            new CustomEvent(
                eventName,
                {
                    detail
                }
            )
        );
    }

    isActive() {
        return (
            this.initialized &&
            this.available &&
            this.enabled
        );
    }

    isAvailable() {
        return (
            this.initialized &&
            this.available
        );
    }

    /*
     * ========================================================
     * DESTRUIR
     * ========================================================
     */

    destroy() {
        if (
            !this.initialized
        ) {
            return;
        }

        window.removeEventListener(
            "resize",
            this.boundHandleResize
        );

        this.removeMediaQueryListener(
            this.pointerMediaQuery,
            this.boundHandleCapabilityChange
        );

        this.removeMediaQueryListener(
            this.reducedMotionMediaQuery,
            this.boundHandleCapabilityChange
        );

        document.removeEventListener(
            this.config.karaokeEvents.sessionStarted,
            this.boundHandleSessionStarted
        );

        document.removeEventListener(
            this.config.karaokeEvents.noteFinalized,
            this.boundHandleNoteFinalized
        );

        document.removeEventListener(
            this.config.karaokeEvents.comboUpdated,
            this.boundHandleComboUpdated
        );

        document.removeEventListener(
            this.config.karaokeEvents.sessionEnded,
            this.boundHandleSessionEnded
        );

        document.removeEventListener(
            this.config.karaokeEvents.sessionStopped,
            this.boundHandleSessionStopped
        );

        if (
            this.resizeFrame !==
            null
        ) {
            cancelAnimationFrame(
                this.resizeFrame
            );

            this.resizeFrame =
                null;
        }

        this.hideMeme(
            true
        );

        this.stopPartySound(
            true
        );

        this.cancelDuckingAnimation();

        this.clearParticles();

        this.resetVisualEnvironment();

        this.clearBackgroundVideo();

        if (
            this.backgroundVideoElement
        ) {
            this.backgroundVideoElement.removeEventListener(
                "loadeddata",
                this.boundHandleBackgroundVideoLoaded
            );

            this.backgroundVideoElement.removeEventListener(
                "error",
                this.boundHandleBackgroundVideoError
            );

            this.backgroundVideoElement.remove();
        }

        if (
            this.visualOverlay
        ) {
            this.visualOverlay.remove();
        }

        if (
            this.memeStage
        ) {
            this.memeStage.remove();
        }

        if (
            this.particleStage
        ) {
            this.particleStage.remove();
        }

        if (
            this.button
        ) {
            this.button.removeEventListener(
                "click",
                this.boundToggle
            );

            this.button.remove();
        }

        this.backgroundVideoElement =
            null;

        this.visualOverlay =
            null;

        this.memeStage =
            null;

        this.memeCard =
            null;

        this.memeMediaContainer =
            null;

        this.particleStage =
            null;

        this.button =
            null;

        document.body.classList.remove(
            this.config.bodyAvailableClass,
            this.config.bodyEnabledClass,
            this.config.bodyDisabledClass,
            this.config.bodyReducedMotionClass,
            this.config.backgroundVideo.bodyClass
        );

        if (
            window.PartyMode ===
            this
        ) {
            delete window.PartyMode;
        }

        this.available =
            false;

        this.enabled =
            false;

        this.sessionActive =
            false;

        this.initialized =
            false;

        this.resetPartySessionTracking();
    }
}


/*
 * ============================================================
 * INSTÂNCIA ÚNICA
 * ============================================================
 */

export const partyMode =
    new PartyModeController();


/*
 * ============================================================
 * INICIALIZAÇÃO AUTOMÁTICA
 * ============================================================
 */

function initializePartyMode() {
    partyMode.init();
}


if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializePartyMode,
        {
            once:
                true
        }
    );

} else {
    initializePartyMode();
}