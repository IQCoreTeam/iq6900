document.getElementById("imageUpload").addEventListener("change", function () {
  var fileName = this.files[0].name;
  var fileNameElement = document.querySelector(
    ".custom-file-upload .file-name",
  );
  if (fileNameElement) {
    fileNameElement.textContent = fileName;
  }
});
function Check_input(x) {
  var result = -1;

  if (!isNaN(x)) {
    const num = parseInt(x);
    if (num > -31 && num < 31) {
      result = num;
    }
  }
  return result;
}

function Generate_image() {
  const fileInput = document.getElementById("imageUpload");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select an image file.");
    return;
  }

  const sizeValue = Check_input($("#font_input").val());
  const distanceValue = Check_input($("#distance_input").val());

  if (sizeValue -1  || distanceValue == -1) {
    alert("Please enter each value between -30~30");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("font_size", sizeValue);
  formData.append("density", distanceValue);
  // $(".prograss").style("display", "flex"); 추가함
  // 여기서 프로그래스 진행 progress-bar 의 width 을 프로그래스에 맞게 조절하면됨.
  $(".game_image").attr("src", "./img/gameui.gif");
  $(".gen_btn").attr("disabled", true);

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
      $(".game_image").attr("src", url);
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    })
    .finally(() => {
      $(".gen_btn").attr("disabled", false);
    });
}


