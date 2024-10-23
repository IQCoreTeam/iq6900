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
    if (num > 0 && num < 11) {
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

  if (sizeValue == -1 || distanceValue == -1) {
    alert("advanced options: Please enter each value between 1~10");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("font_size", sizeValue);
  formData.append("density", distanceValue);

  $(".game_image").attr("src", "./img/gameui.gif");
  $(".gen_btn").attr("disabled", true);

  fetch("https://iq.hoakhoithethao.com/convert", {
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

function openDiv() {
  if ($(".option_menu").css("display") === "none") {
    $(".option_menu").css("display", "block");
    $(".arrow").css("transform", "rotate(-135deg)");
    $(".arrow").css("margin-top", "0.8rem");
  } else {
    $(".option_menu").css("display", "none");
    $(".arrow").css("transform", "rotate(45deg)");
    $(".arrow").css("margin-top", "1rem");
  }
}
