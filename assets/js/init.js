
function getQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        txid: urlParams.get('txid')
    };
}


$(document).ready(function() {
    const { txid } = getQueryParams();
    if (window.history.length === 1&&txid) {
        $.onchainPage.init();
    }else {
        $.mainPage.init();
    }
});
