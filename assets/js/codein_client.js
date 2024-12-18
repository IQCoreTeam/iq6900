async function imgToAsciiArt(imageSrc, fontSize = 10, outputHeight = 300) {
    try {
        const image = await loadImage(imageSrc);


        // Create a canvas and get its context
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate aspect ratio and resize canvas
        const aspectRatio = image.width / image.height;
        const outputWidth = Math.floor(outputHeight * aspectRatio);
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        // Draw the resized image on the canvas
        ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
        const result = [];
        for (let y = 0; y < canvas.height; y += fontSize) {
            let line = '';

            for (let x = 0; x < canvas.width; x += fontSize) {
                const pixelData = ctx.getImageData(x, y, 1, 1).data; // Get RGBA values
                const [r, g, b, a] = pixelData;
                let char;
                if (a > 0) {
                    const brightness = (r + g + b) / 3;
                    // Map brightness to characters
                    if (brightness < 51) {
                        char = ' ';
                    } else if (brightness < 102) {
                        char = "'";
                    } else if (brightness < 140) {
                        char = ':';
                    } else if (brightness < 170) {
                        char = 'i';
                    } else if (brightness < 200) {
                        char = 'I';
                    } else if (brightness < 210) {
                        char = 'J';
                    } else {
                        char = '$';
                    }
                }else{
                    char = ' ';
                }
                line += char;
            }
            result.push(line);
        }
        let result_string = result.join('\n');
        const resultObj = {
            relult: result_string,
            width: result[0].length.toString(),
        }
        return resultObj;
    } catch (error) {
        console.error('Error loading image:', error);
        throw new Error('Image loading failed.');
    }
}

// Helper function to load an image
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // Handle cross-origin issues if needed
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}


// Convert RGB to Saturation
function rgbToSaturation(r, g, b) {
    const rScaled = r / 255;
    const gScaled = g / 255;
    const bScaled = b / 255;

    // Convert RGB to HSV
    const max = Math.max(rScaled, gScaled, bScaled);
    const min = Math.min(rScaled, gScaled, bScaled);
    const delta = max - min;

    return max === 0 ? 0 : delta / max; // Saturation formula
}

function Check_input(x) {
    if (x === null || x === undefined || x.trim() === "") {
        return null;
    }

    const num = Number(x);

    if (isNaN(num)) {
        return null;
    }

    if (num > 4 && num <= 50) {
        return num;
    } else {
        return null;
    }
}
async function move_type_section() {
    $(".gen_setting").css("display", "none");
    $(".type_in_setting").css("display", "flex");
}
async function type_done() {
    $("#text_input").attr("readonly", true);
    $("#text_in_button").css("display", "none");
    $(".code-in-div").css("display", "flex");
    
}

async function Generate_image_client() {
    const outputHeight = 800;
    const fileInput = document.getElementById("imageUpload");

    const file = fileInput.files[0];
    if (!file) {
        alert("Please select an image file.");
        return;
    }

    const sizeValue = Check_input($("#font_input").val());

    if (sizeValue === null) {
        alert("Please enter valid numeric values between 5 and 50.");
        return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);

    // 이미지 파일을 Data URL 형식으로 읽어옴
    reader.onload = function () {
        const img = new Image();
        img.src = reader.result; // Data URL을 이미지 소스로 설정

        img.onload = function () {
            imgToAsciiArt(img.src, sizeValue, outputHeight).then((result) => {
                const fontsize = $(".asciidiv").width()/parseInt(result.width);
                $("#asciiWidth").text(result.width);
                $(".on_chain_ascii").css("font-size", fontsize.toString()+"px");
                $(".on_chain_ascii").text(result.relult);
                $(".gen_setting").css("display", "none");
                $(".code_in_setting").css("display", "flex");

            }).catch((error) => {
                console.error('Error processing image:', error);
            });
        };

        img.onerror = function () {
            console.error("Image failed to load.");
        };
    };

}