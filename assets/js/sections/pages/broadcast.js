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
        const labelTime = document.getElementById("crt_label_time");
        const labelCh = document.querySelector(".crt_label_tl");
        const staticEl = document.getElementById("crt_static");
        const creditEl = document.getElementById("crt_credit");
        if (!video || !knobsWrap) return;

        function showCredit(i) {
            if (!creditEl) return;
            const ch = CHANNELS[i];
            creditEl.classList.remove("show");
            setTimeout(() => {
                creditEl.innerHTML = ch.creditHtml || "&nbsp;";
                creditEl.classList.add("show");
            }, 200);
        }

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

        video.addEventListener("timeupdate", () => {
            if (labelTime) labelTime.textContent = fmt(video.currentTime);
        });
        video.addEventListener("pause", () => { playing = false; updateKnobStates(); });
        video.addEventListener("play", () => { playing = true; updateKnobStates(); });

        renderKnobs();
        loadChannel(0);
        updateKnobStates();
    }

    window.initBroadcast = init;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
