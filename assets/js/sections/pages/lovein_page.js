(function($) {
    $.extend(true, window, {
        "loveInPage": LoveInPage
    });

    function LoveInPage() {
        let $loveInPageElement;
        let $wWidth = screen.width;
        const $loveInPageTemplateUrl = "./html/sections/love_in.html?ver=20250210";
        function init() {
            loadLoveInPagePageTemplate();
        }

        function loadLoveInPagePageTemplate() {
            $.ajax({
                url: $loveInPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $loveInPageElement = $(templateData);
                    renderLoveInPageTemplate()
                }
            });
        };

        function renderLoveInPageTemplate() {
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($loveInPageElement);
            $('.nav_connect').attr('onclick',"nav_connect()");
            $('.nav_status_before_login').text("Connect")

        }

        $.extend(this, {
            'init': init
            ,'renderLoveInPageTemplate': $loveInPageElement
        });
    }

    $.loveInPage = new LoveInPage();

}(jQuery));