let loadOff = 1;
function getQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        txid: urlParams.get('txid'),
        menu: urlParams.get('menu')
    };
}


$(document).ready(function() {
    const { txid,menu } = getQueryParams();
    if (txid) {
        $.onchainPage.init();
        $('.bump').css('display', 'none');
    }else if(menu){
        if(menu == "about"){
            $.aboutPage.init();

        }
    }

});
