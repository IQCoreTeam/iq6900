(function($) {
    $.extend(true, window, {
        "code_in_section": codeInSection
    });

    function codeInSection() {
        let $codeInSectionElement;
        let $wWidth = screen.width;
        const $codeInSectionTemplateUrl = "./html/sections/code_in.html?ver=20250209";
        function init() {
            loadCodeInSectionTemplate();
        }

        function loadCodeInSectionTemplate() {
            $.ajax({
                url: $codeInSectionTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $codeInSectionElement = $(templateData);
                    renderCodeInSectionTemplate()
                }
            });
        };

        function renderCodeInSectionTemplate() {
            $("#menu_section").show();
            $("#menu_section").empty();
            $("#menu_section").append($codeInSectionElement);
            $('.nav_connect').attr('onclick',"nav_connect()");
            $('.nav_status_before_login').text("Connect")
        }

        $.extend(this, {
            'init': init
            ,'renderCodeInSectionTemplate': renderCodeInSectionTemplate
        });
    }

    $.codeInSection = new codeInSection();

}(jQuery));