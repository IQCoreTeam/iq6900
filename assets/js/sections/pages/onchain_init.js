function toggleClassForMenu(menu1, menu2, oldClass, newClass) {
    if ($(menu1).hasClass(oldClass)) {
        $(menu1).removeClass(oldClass)
        $(menu1).addClass(newClass);

        $(menu2).removeClass(newClass)
        $(menu2).addClass(oldClass);
    }
}

function goto_viewer() {
    toggleClassForMenu('#go_viewer', '#go_code_in', "img_button", "img_button_green");
    $.checkSection.init();
}

$(document).ready(async function () {
    const {txid} = getQueryParams();
    if (txid) {
        await goto_viewer();
        $(".bump").css("display", "none");
        const urlWithoutParams = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({}, '', urlWithoutParams);
        await seeTransaction(txid);
    }
});
