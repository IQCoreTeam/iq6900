
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
        goto_viewer();
        seeTransaction(txid);
    }
    init_connect()
});
