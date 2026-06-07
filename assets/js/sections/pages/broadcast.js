(function () {
    const CHANNELS = [
        {
            id: 1,
            title: "IQ SDK TRAILER",
            src: "https://r2.iqlabs.dev/IQ%20Labs%20SDK%20Trailer.mp4",
            creditHtml: 'video made by <a href="https://x.com/Lopez_Editz" target="_blank" rel="noopener">@Lopez_Editz</a>'
        },
        {
            id: 2,
            title: "CODE-IN-Q V2",
            src: "https://r2.iqlabs.dev/Code-%20IN-Q%20v2.mp4",
            creditHtml: 'video made by <a href="https://x.com/Lopez_Editz" target="_blank" rel="noopener">@Lopez_Editz</a>'
        },
        {
            id: 3,
            title: "IQ/MUSIC VIDEO",
            src: "https://r2.iqlabs.dev/iqmusicvideo.mp4",
            creditHtml: 'video made by <a href="https://x.com/Im_zo_sol" target="_blank" rel="noopener">@Im_zo_sol</a>'
        }
    ];

    const clickSound = new Audio("audio/click.mp3");
    clickSound.preload = "auto";
    function playClick() {
        try {
            clickSound.currentTime = 0;
            clickSound.play().catch(() => {});
        } catch (e) {}
    }

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function fmt(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);
    }

    function init() {
        const video = document.getElementById("crt_video");
        const knobsWrap = document.getElementById("crt_knobs");
        const labelTitle = document.getElementById("crt_label_title");
        const labelCh = document.querySelector(".crt_label_tl");
        const staticEl = document.getElementById("crt_static");
        const creditEl = document.getElementById("crt_credit");
        const screenEl = video && video.closest(".crt_screen");
        const playOverlay = document.getElementById("crt_play_overlay");
        const btnPlay = document.getElementById("crt_btn_play");
        const btnMute = document.getElementById("crt_btn_mute");
        const btnFs = document.getElementById("crt_btn_fs");
        const seek = document.getElementById("crt_seek");
        const seekFill = document.getElementById("crt_seek_fill");
        const timeEl = document.getElementById("crt_time");
        if (!video || !knobsWrap) return;

        const BASE_TEXT = "Tune in. Adjust your antenna. Big brain signals incoming.";

        function setCreditText(html) {
            if (!creditEl) return;
            creditEl.innerHTML = "<span>" + html + "</span><span>" + html + "</span>";
        }

        function showCredit(i) {
            const ch = CHANNELS[i];
            setCreditText(ch.creditHtml || BASE_TEXT);
        }

        setCreditText(BASE_TEXT);

        let current = 0;
        let playing = false;

        function loadChannel(i) {
            const ch = CHANNELS[i];
            video.src = ch.src;
            video.muted = false;
            video.volume = 1;
            video.load();
            if (labelTitle) labelTitle.textContent = ch.title;
            if (labelCh) labelCh.textContent = "CH " + pad(ch.id);
        }

        function updateKnobStates() {
            knobsWrap.querySelectorAll(".crt_knob").forEach((k, i) => {
                k.classList.toggle("active", i === current && playing);
                k.classList.toggle("selected", i === current);
            });
        }

        function handleKnob(i) {
            playClick();
            showCredit(i);
            if (i === current) {
                if (playing) {
                    video.pause();
                    playing = false;
                } else {
                    video.play().catch(() => {});
                    playing = true;
                }
            } else {
                current = i;
                staticEl && staticEl.classList.add("on");
                setTimeout(() => {
                    loadChannel(i);
                    video.play().catch(() => {});
                    playing = true;
                    updateKnobStates();
                    setTimeout(() => staticEl && staticEl.classList.remove("on"), 250);
                }, 180);
                return;
            }
            updateKnobStates();
        }

        function renderKnobs() {
            knobsWrap.innerHTML = "";
            CHANNELS.forEach((ch, i) => {
                const k = document.createElement("div");
                k.className = "crt_knob";
                k.setAttribute("role", "button");
                k.setAttribute("title", "CH " + pad(ch.id));
                const label = document.createElement("span");
                label.className = "crt_knob_label";
                label.textContent = pad(ch.id);
                k.appendChild(label);
                k.addEventListener("click", () => handleKnob(i));
                knobsWrap.appendChild(k);
            });
        }

        function togglePlay() {
            playClick();
            showCredit(current);
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }

        function syncScreenState() {
            if (!screenEl) return;
            screenEl.classList.toggle("playing", !video.paused);
            screenEl.classList.toggle("muted", video.muted || video.volume === 0);
        }

        video.addEventListener("timeupdate", () => {
            if (timeEl) timeEl.textContent = fmt(video.currentTime) + " / " + fmt(video.duration);
            if (seekFill && video.duration) {
                seekFill.style.width = (video.currentTime / video.duration) * 100 + "%";
            }
        });
        video.addEventListener("loadedmetadata", () => {
            if (timeEl) timeEl.textContent = "00:00 / " + fmt(video.duration);
        });
        video.addEventListener("pause", () => { playing = false; updateKnobStates(); syncScreenState(); });
        video.addEventListener("play", () => { playing = true; updateKnobStates(); syncScreenState(); });
        video.addEventListener("volumechange", syncScreenState);

        if (playOverlay) playOverlay.addEventListener("click", togglePlay);
        if (btnPlay) btnPlay.addEventListener("click", togglePlay);
        if (btnMute) btnMute.addEventListener("click", () => {
            playClick();
            video.muted = !video.muted;
        });
        if (btnFs) btnFs.addEventListener("click", () => {
            playClick();
            const target = screenEl || video;
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (target.requestFullscreen) {
                target.requestFullscreen();
            } else if (video.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }
        });
        if (seek) seek.addEventListener("click", (e) => {
            if (!video.duration) return;
            const rect = seek.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            video.currentTime = ratio * video.duration;
        });

        renderKnobs();
        loadChannel(0);
        updateKnobStates();
        syncScreenState();
    }

    window.initBroadcast = init;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
