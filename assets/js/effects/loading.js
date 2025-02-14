
async function loadingScreenStart() {
    if (loadOff !==1) {
        $(".full_div").css("display", "none");
        $(".loading-screen").css("display", "block");
        const text = "< Welcome to SolWeb />";
        for (let index = 0; index <= text.length; index++) {
            if (loadOff === 1){
                return;
            }
            $(".typing-text").text(text.substring(0, index) + "|");
            await sleep(100)
            if (index === text.length) {
                await sleep(500);
                for (let _index = text.length; _index > 0; _index--) {
                    $(".typing-text").text(text.substring(0, _index) + "|");
                    await sleep(100);
                }
                index = -1;
            }
        }
    }
}

async function loadingScreenEnd() {
    $(".loading-screen").fadeOut(200, function() { // 로딩 화면을 0.5초 동안 페이드아웃
        $(".full_div").css("display", "flex"); // 부드럽게 나타나게 설정
    });
}


async function startProcess() {
    loadOff = 0;
    loadingScreenStart();

    await publicSearch();
    loadOff = 1;
    await loadingScreenEnd();
}
async function startLoveProcess() {
    loadOff = 0;
    loadingScreenStart();

    await initLoveLetter();
    loadOff = 1;
    await loadingScreenEnd();
}