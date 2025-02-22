(function($) {
    $.extend(true, window, {
        "main_page": mainPage
    });

    function mainPage() {
        let $mainPageElement;
        let $wWidth = screen.width;
        const $mainPageTemplateUrl = "./html/sections/main_page.html?ver=20250209";
        function init() {
            loadMainPageTemplate();
        }

        function loadMainPageTemplate() {
            $.ajax({
                url: $mainPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $mainPageElement = $(templateData);
                    renderMainPageTemplate()
                }
            });
        };

        function renderMainPageTemplate() {
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($mainPageElement);
            $('.nav_connect').attr('onclick',"nav_connect()");
            $('.nav_status_before_login').text("Connect");
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': renderMainPageTemplate
        });
    }

    $.mainPage = new mainPage();

}(jQuery));