function setEffect() {
    $(".crt-effect").css('height','1px');
    var body = document.body,
        html = document.documentElement;

    var height = Math.max(body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight);
    $(".crt-effect").css('height', height.toString() + "px");
}

