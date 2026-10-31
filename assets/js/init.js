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
        }else if(menu == "nft"){
            $.nft_launch.init(post); // inscription NFT launchpad (?nft=<slug>)
        }else if(menu == "packs"){
            if (!document.getElementById("nft_packs_style")) {
                const style = document.createElement("link");
                style.id = "nft_packs_style";
                style.rel = "stylesheet";
                style.href = "css/nft_packs.css?ver=1";
                document.head.appendChild(style);
            }
            import("./sections/pages/nft_packs.js?ver=1")
                .then(({ mountPacks }) => mountPacks())
                .catch(() => $("#main_section").text("Packs are unavailable. Refresh to try again."));
        }else if(menu == "nft-create"){
            $.nft_studio.init(); // creator wizard: launch a collection
        }else if(menu == "hoodin"){
            $.code_in_v2.init(post, "evm"); // same page, robinhood adapter + hood theme
        }
    }else{
        $.mainPage.init();
    }

});
