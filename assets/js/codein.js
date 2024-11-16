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
