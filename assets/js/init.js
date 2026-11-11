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
        }else if(menu == "nft" || menu == "nft-create"){
            // The NFT launchpad moved to inscribe.codes. Old links are in the
            // wild and inside on-chain metadata, so this redirect stays.
            const p = new URLSearchParams(window.location.search);
            const q = new URLSearchParams({ view: "nft" });
            if (p.get("single")) q.set("single", p.get("single"));
            else if (p.get("asset")) q.set("asset", p.get("asset"));
            else if (p.get("nft")) q.set("c", p.get("nft"));
            window.location.replace("https://inscribe.codes/?" + q.toString());
        }else if(menu == "hoodin"){
            $.code_in_v2.init(post, "evm"); // same page, robinhood adapter + hood theme
        }
    }else{
        $.mainPage.init();
    }

});
