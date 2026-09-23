let loadOff = 1;
function getQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        txid: urlParams.get('txid'),
        menu: urlParams.get('menu'),
        post: urlParams.get('post')
    };
}


$(document).ready(function() {
    const { txid,menu,post } = getQueryParams();
    if (txid) {
        $.onchainPage.init();
        $('.bump').css('display', 'none');
    }else if(menu){
        if(menu == "about"){
            $.aboutPage.init();
        }else if(menu == "tokenomics"){
            $.tokenomicsPage.init();
        }else if(menu == "ascii-maker"){
            $.generatePage.init();
        }else if(menu == "codein"){
            $.code_in_v2.init(post);
        }else if(menu == "hoodin"){
            $.code_in_v2.init(post, "evm"); // same page, robinhood adapter + hood theme
        }
    }else{
        $.mainPage.init();
    }

});
