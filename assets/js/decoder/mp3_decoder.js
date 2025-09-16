const MUSIC_TX = "HgRSeeQs9jfdED6vA5x3swhvrWsJAdi2Pmk6eRMBQmpJQH2B1qvdwcovXegGsHSJ83hGvcSVBCYnqu2puDXgxiH";
const MAX_CONCURRENT_FETCHERS = 6;
const FRAME_HEIGHT = 113;            // Line count bring once
const SKIP_LINES = 4;

let frameQueue = [];
let fetchIndex = 0;
let completedFetchers = 0;
let isDone = false;
const skipTime = 11.8;
class Controller {
    constructor() {
        this.pause = false;
        this.start = true;

    }

    init() {
        const btn = document.getElementById('playbtn');
        btn.innerText = "Start";
    }

    async stateChange() {
        const mp3Player = document.getElementById('mp3');
        const btn = document.getElementById('playbtn');

        if (btn.innerText === "Loading") {
            return;
        }
        if (this.start == true) {
            this.start = false;
            console.log('start playing video')
            startVideo();
            await startSound();
            btn.innerText = 'Playing'
        } else {

            if (this.pause) {
                this.pause = false;
                mp3Player.play();
                btn.innerText = 'Playing'
            } else {
                this.pause = true;
                mp3Player.pause();
                btn.innerText = 'Paused'
            }

        }
    }
}

const videoCtrl = new Controller();


// window.addEventListener("DOMContentLoaded", function () {
//     console.log("dom loaded")
//     fetchMusicFromBlockchain();
// }, false);


async function fetchMusicFromBlockchain() {
    try {
        const $div = $('.mv_console_div');

        const $p = $('<p>')
            .addClass('music_tx_display')
            .text(`Bringing Music base64..\n ${MUSIC_TX}`);
        $div.append($p);

        const data = await bringCode(MUSIC_TX);

        const $success_p = $('<p>')
            .addClass('music_tx_display')
            .text(`Music is ready!`)
        const $a = $('<a>')
            .attr('href', `https://solscan.io/tx/${MUSIC_TX}`)
            .attr('target', '_blank')
            .text('[solscan]');
        $success_p.append('<br>').append($a);

        $div.append($success_p);
        decode(data.base64Str);

        //startVideo(); // to turn on the music and video at the same time,  we need to manage the async.
    } catch (error) {
        console.log('error', error);
    } finally {
        videoCtrl.init();
    }
}


function decode(t) {
    //base64 to binary
    const binaryString = atob(t);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    //Convert binary string to byte array
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    //Create blob from byte array
    const blob = new Blob([bytes], {type: 'audio/mp3'});

    //Create URL Object
    const url = window.URL.createObjectURL(blob);
    audioPlayer(url);

}

function audioPlayer(url) {
    const mp3Player = document.getElementById('mp3');
    const source = document.createElement('source');
    source.src = url;
    source.type = 'audio/aac';
    mp3Player.appendChild(source);

}

async function startSound() {

    while (!frameQueue[0]) {
        console.log("music waiting frames...");
        await new Promise(res => setTimeout(res, 50));
    }
    const mp3Player = document.getElementById('mp3');
    mp3Player.currentTime = skipTime;
    mp3Player.volume = 0.1;
    mp3Player.play();
}

function playBtn() {
    videoCtrl.stateChange();
}

// async function renderFrames() {
//     let queueIndex = 0;
//     while (!isDone ) {
//         console.log("started")
//         if (queueIndex < frameQueue.length) {
//             try {
//                 const rawStr = frameQueue[queueIndex];
//
//                 queueIndex++;
//
//                 const lines = rawStr.split("\n");
//                 let lineIndex = 0;
//
//                 const $preElement = $('.mv_display');
//
//                 while (lineIndex + FRAME_HEIGHT <= lines.length) {
//                     if (videoCtrl.pause == true) {
//                         console.log('waiting')
//                         await new Promise(res => setTimeout(res, 33.333));
//                     } else {
//                         const frameLines = lines.slice(lineIndex, lineIndex + FRAME_HEIGHT);
//                         $preElement.text(frameLines.join("\n"));
//
//                         await new Promise(res => setTimeout(res, 33.333));
//                         lineIndex += FRAME_HEIGHT + SKIP_LINES;
//                     }
//
//                 }
//
//             }catch (e){
//                 console.log('no frames')
//             }
//         } else {
//             console.log('await')
//             await new Promise(res => setTimeout(res, 100));
//         }
//     }
// }

async function renderFrames() {
    const mp3Player = document.getElementById('mp3');
    const $preElement = $('.mv_display');
    const framesPerSecond = 30;
    const linesPerFrame = FRAME_HEIGHT + SKIP_LINES;

    const flatFrames = [];


    let lastProcessed = 0;
    while (!frameQueue[0]) {
        console.log("music waiting frames...");
        await new Promise(res => setTimeout(res, 50));
    }


    setInterval(() => {
        while (frameQueue[lastProcessed] !== undefined) {
            const raw = frameQueue[lastProcessed];
            if (!raw) {
                break;
            }
            const lines = raw.split("\n");
            for (let i = 0; i + FRAME_HEIGHT <= lines.length; i += linesPerFrame) {
                const frame = lines.slice(i, i + FRAME_HEIGHT).join("\n");
                flatFrames.push(frame);
            }
            lastProcessed++;
        }
    }, 200);


    function renderLoop() {
        if (!videoCtrl.pause) {
            const currentTime = mp3Player.currentTime-skipTime;
            const frameIndex = Math.floor(currentTime * framesPerSecond);
            const frame = flatFrames[frameIndex];

            if (frame) {
                $preElement.text(frame);
            }
        }

        requestAnimationFrame(renderLoop);
    }

    renderLoop();
}

async function startFetcher(txList) {

    $('.mv_right_status_text').text('[STATUS] Streaming..');
    while (true) {

        try {
            const i = fetchIndex++;
            if (i >= txList.length) {
                $('.mv_right_status_text').text('[STATUS] Complete!');
                break;
            }

            const txId = txList[i];
            const $div = $('.mv_console_div');

            const $p = $('<p>')
                .addClass('music_tx_display')
                .text(`bringing tx..\nFrame [0${i}]: ${txId}...`);

            const $a = $('<a>')
                .attr('href', `https://solscan.io/tx/${txId}`)
                .attr('target', '_blank')
                .text('[solscan]');

            $p.append('<br>').append($a);
            $div.append($p);
            $div.scrollTop($div[0].scrollHeight);
            const result = await bringCode(txId);
            frameQueue[i] = typeof result?.base64Str === "string" ? result.base64Str : fallbackFrame();

        } catch (err) {
            console.warn(`⚠️ Error fetching tx ${txId}:`, err);
            frameQueue[i] = fallbackFrame();
        }
    }
    completedFetchers++;
    if (completedFetchers === MAX_CONCURRENT_FETCHERS) {
        isDone = true;
    }
}

function fallbackFrame() {
    return Array(FRAME_HEIGHT + SKIP_LINES).fill(" ".repeat(80)).join("\n");
}

async function startVideo() {
    let content;

    try {
        const fileUrl = "js/decoder/mv_tx_list.txt";
        content = await fetch(fileUrl).then(r => r.text())

    } catch (err) {
        console.error("ascii_video_output.txt 읽기 오류:", err);
        return;
    }

    const txList = content.trim().split("\n").map(line => line.trim());

    // Bring frames from blockchain,
    for (let i = 0; i < MAX_CONCURRENT_FETCHERS; i++) {
        startFetcher(txList);
    }
    // startFetcher(txList);

    // start render
    await new Promise(res => setTimeout(res, 200));
    await renderFrames();
}