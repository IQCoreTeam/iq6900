(function($) {
    $.extend(true, window, {
        "generate_page": generatePage
    });

    function generatePage() {
        let $generatePageElement;
        let $wWidth = screen.width;
        const $generatePageTemplateUrl = "./html/sections/generate_page.html?ver=20260801e";
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
            // The ticker redesign carries its own sticky nav, so hide the shell
            // top bar while the generator is mounted (like the landing page).
            $(".pc_menu").css("display", "none");
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($generatePageElement);
            $("#imageUpload").on("change", function () {
                Generate_image();
            });
            if (window.initRdReveal) { window.initRdReveal('#main_section'); }
            if (window.iqLang) { window.iqLang.applySaved(); }
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': $generatePageElement
        });
    }

    $.generatePage = new generatePage();

}(jQuery));