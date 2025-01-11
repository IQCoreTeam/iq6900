
function getQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        txid: urlParams.get('txid')
    };
}


$(document).ready(function() {
    const { txid } = getQueryParams();
    if (txid) {
        $.onchainPage.init();
    }else {
        setEffect();
        // $.mainPage.init();
    }
});
