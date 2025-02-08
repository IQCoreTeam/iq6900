(function($) {
    $.extend(true, window, {
        "generate_page": generatePage
    });

    function generatePage() {
        let $generatePageElement;
        let $wWidth = screen.width;
        const $generatePageTemplateUrl = "./html/sections/generate_page.html?ver=20250209";
        function init() {
            loadGeneratePageTemplate();
        }

        function loadGeneratePageTemplate() {
            $.ajax({
                url: $generatePageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $generatePageElement = $(templateData);
                    renderGeneratePageTemplate()
                }
            });
        };

        function renderGeneratePageTemplate() {
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($generatePageElement);
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': $generatePageElement
        });
    }

    $.generatePage = new generatePage();

}(jQuery));