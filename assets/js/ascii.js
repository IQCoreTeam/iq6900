let currentFileIndex = 2;  // 현재 읽고 있는 텍스트 파일의 인덱스
let currentFrameIndex = 0;  // 현재 프레임의 인덱스
const framesPerFile = 100;  // 한 텍스트 파일에 포함될 프레임 수
const totalFiles = 57;  // 텍스트 파일의 총 개수, 필요에 따라 수정
const asciiArtContainer = document.getElementById("asciiArtContainer");
const start =  document.getElementById("start");

// 텍스트 파일을 읽어오는 함수
async function loadTextFile(fileIndex) {
    try {
        const response = await fetch(`./output_txt/ascii_frames_${fileIndex}.txt`);
        const data = await response.text();
        // 빈 줄을 기준으로 프레임 분리
        return data.split("\n\n");
    } catch (error) {
        console.error("텍스트 파일을 읽는 중 오류 발생:", error);
        return [];
    }
}

// 파일의 프레임을 순차적으로 출력하는 함수
async function displayFrames() {
    // 첫 번째 파일을 로드하고 프레임을 출력

    var audio = new Audio("./music/miku.mp3");
    audio.load();
    audio.loop = false;
    audio.volume = 0.3;
    audio.play();
    while (currentFileIndex < totalFiles) {
        const frames = await loadTextFile(currentFileIndex);

        // 파일을 다 읽었으면 더 이상 처리하지 않음
        if (frames.length === 0) {
            console.log("파일을 모두 다 읽었습니다.");
            return;
        }

        // 각 프레임을 순차적으로 출력
        for (let i = currentFrameIndex; i < frames.length; i++) {
            const ascii = document.getElementById("ascii");

            // 하나의 프레임을 다 읽고 출력 (줄바꿈을 <br>로 변환하여 출력)
            ascii.innerHTML = frames[i].replace(/ /g, "&nbsp;").replace(/\n/g, "<br>");

            // 프레임 출력 후 잠시 기다리기 (1초마다 출력)
            await new Promise(resolve => setTimeout(resolve, 80.6));
        }

        // 현재 파일의 프레임을 다 출력한 후, 다음 파일로 넘어감
        currentFileIndex++;
        currentFrameIndex = 0;  // 파일을 새로 시작하면 프레임 인덱스를 0으로 초기화
    }
    start.style.display= "block";
}

start.addEventListener('click', function () {
    start.style.display= "none";
    displayFrames();

});

