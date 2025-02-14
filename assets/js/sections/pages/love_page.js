(function($) {
    $.extend(true, window, {
        "love_page": LovePage
    });

    function LovePage() {
        let $lovePageElement;
        let $wWidth = screen.width;
        const $lovePageTemplateUrl = "./html/sections/love_page.html?ver=20250210";
        function init() {
            loadLovePageTemplate();
        }

        function loadLovePageTemplate() {
            $.ajax({
                url: $lovePageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $lovePageElement = $(templateData);
                    renderLovePageTemplate()
                }
            });
        };

        function renderLovePageTemplate() {
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($lovePageElement);

        }

        $.extend(this, {
            'init': init
            ,'renderLovePageTemplate': renderLovePageTemplate
        });
    }

    $.lovePage = new LovePage();

}(jQuery));