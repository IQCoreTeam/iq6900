(function($) {
    $.extend(true, window, {
        "onchain_page": onchainPage
    });

    function onchainPage() {
        let $onchainPageElement;
        let $wWidth = screen.width;
        const $onchainPageTemplateUrl = "./html/sections/onchain_page.html?ver=20250211";
        function init() {
            loadOnchainPageTemplate();
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
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($onchainPageElement);
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': $onchainPageElement
        });
    }

    $.onchainPage = new onchainPage();

}(jQuery));