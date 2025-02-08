document.getElementById("imageUpload").addEventListener("change", function () {
    Generate_image()
});

function Check_input(x) {
    if (x === null || x === undefined || x.trim() === "") {
        return null;
    }

    const num = Number(x);

    if (isNaN(num)) {
        return null;
    }

    if (num >= -50 && num <= 50) {
        return num;
    } else {
        return null;
    }
}

function Generate_image() {
    const fileInput = document.getElementById("imageUpload");
    const file = fileInput.files[0];

    $(".file-name").text("Loading...");
    // 텍스트 박스 readonly 처리
    $("#imageUpload").attr("disabled",true);


    if (!file) {
        alert("Please select an image file.");
        return;
    }
    const sizeValue = Check_input($("#font_input").val());
    const distanceValue = Check_input($("#distance_input").val());

    if (sizeValue === null || distanceValue === null) {
        alert("Please enter valid numeric values between -50 and 50.");
        return;
    }
    if (sizeValue < 0 ) {
        alert("Font size is can't be less than 0");
        return;
    }


    const formData = new FormData();
    formData.append("file", file);
    formData.append("font_size", sizeValue);
    formData.append("density", distanceValue);
    if ($('#checkbox').is(':checked')) {
        formData.append("watermark", true);
    } else {
        formData.append("watermark", false);
    }

    fetch("https://iq.newjeans.cloud/convert", {
        method: "POST",
        body: formData,
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.blob();
        })
        .then((blob) => {
            const url = URL.createObjectURL(blob);
            $(".generate_result_img").attr("src", url);
            $(".img_download").attr('href' , url);
            $(".img_download").attr('download' , 'IQ_Coded');
        })
        .catch((error) => {
            console.error("Error:", error);
            alert("An error occurred. Please try again.");
        })
        .finally(() => {
            $(".retry_txt").text("Back");
            $(".retry_img").attr("src","img/left_green.svg");
            $(".retry").attr("onclick","retry()");
            $(".contents_input").css("display", "none");
            $(".file-name").text("Select Image");
            $("#imageUpload").removeAttr("disabled");
            $(".generate_result").css("display", "block");

            $('.after_gen_png').css('display', 'flex');
        });
}

function retry(){
    $(".retry_img").attr("src","img/img_logo.svg");
    $(".retry").attr("onclick","");
    $(".retry_txt").text("Art Generator");

    $(".contents_input").css("display", "flex");
    $(".generate_result").css("display", "none");
    $('.after_gen_png').css('display', 'none');
}