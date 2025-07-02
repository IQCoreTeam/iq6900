(function($) {
    $.extend(true, window, {
        "about_page": aboutPage
    });

    function aboutPage() {
        let $aboutPageElement;
        let $wWidth = screen.width;
        const $aboutPageTemplateUrl = "./html/sections/about_page.html?ver=20250209";
        function init(txid = '') {
            loadAboutPageTemplate(txid);
        }

        function loadAboutPageTemplate(txid) {
            $.ajax({
                url: $aboutPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $aboutPageElement = $(templateData);
                    renderAboutPageTemplate(txid)
                }
            });
        };

        function renderAboutPageTemplate() {
            $(".pc_menu").css("display","none");

            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($aboutPageElement);

        }

        $.extend(this, {
            'init': init
            ,'renderAboutPageTemplate': renderAboutPageTemplate
        });
    }

    $.aboutPage = new aboutPage();

}(jQuery));