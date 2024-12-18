(function($) {
    $.extend(true, window, {
        "onchain_page": onchainPage
    });

    function onchainPage() {
        let $onchainPageElement;
        let $wWidth = screen.width;
        const $onchainPageTemplateUrl = "./html/sections/onchain_page.html?ver=20241219";
        function init() {
            loadOnchainPageTemplate();
            alert("This is an on-chain testing version for Devnet.");
            alert("For testing, you need to set your Phantom to Devnet. \n" +
                "\n" +
                "1. set the testnet\n" +
                "https://hello-17.gitbook.io/crema-devnet-test-guide/switch-your-solana-wallet-to-devnet\n" +
                "\n" +
                "2. get the testnet solana \n" +
                "https://faucet.solana.com/");
        }

        function loadOnchainPageTemplate() {
            $.ajax({
                url: $onchainPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $onchainPageElement = $(templateData);
                    renderOnchainPageTemplate()
                }
            });
        };

        function renderOnchainPageTemplate() {
            $("#section").show();
            $("#section").empty();
            $("#section").append($onchainPageElement);
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': $onchainPageElement
        });
    }

    $.onchainPage = new onchainPage();

}(jQuery));