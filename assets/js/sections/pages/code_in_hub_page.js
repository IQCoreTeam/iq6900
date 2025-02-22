(function($) {
    $.extend(true, window, {
        "code_in_hub_page": CodeInHubPage
    });

    function CodeInHubPage() {
        let $codeInHubPageElement;
        let $wWidth = screen.width;
        const $codeInHubPageTemplateUrl = "./html/sections/code_in_hub_page.html?ver=20250211";

        function init() {
            loadCodeInHubPageTemplate();
        }
        function loadCodeInHubPageTemplate() {
            $.ajax({
                url: $codeInHubPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $codeInHubPageElement = $(templateData);
                    renderCodeInHubPageTemplate()
                }
            });
        };

        function renderCodeInHubPageTemplate() {
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($codeInHubPageElement);
            $(".nav_connect").attr("onclick", "$.onchainPage.init()");
            $(".nav_status_before_login").text("Code-In");
        }

        $.extend(this, {
            'init': init
            ,'renderCodeInHubPageTemplate': renderCodeInHubPageTemplate
        });
    }

    $.codeInHubPage = new CodeInHubPage();

}(jQuery));