document.getElementById("imageUpload").addEventListener("change", function () {
  var fileName = this.files[0].name;
  var fileNameElement = document.querySelector(
    ".custom-file-upload .file-name",
  );
  if (fileNameElement) {
    fileNameElement.textContent = fileName;
  }
});

function Generate_image() {
  const fileInput = document.getElementById("imageUpload");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select an image file.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

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
