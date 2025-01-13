(function($) {
    $.extend(true, window, {
        "code_in_section": codeInSection
    });

    function codeInSection() {
        let $codeInSectionElement;
        let $wWidth = screen.width;
        const $codeInSectionTemplateUrl = "./html/sections/code_in.html?ver=20241222";
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
            $("#web3_section").show();
            $("#web3_section").empty();
            $("#web3_section").append($codeInSectionElement);
        }

        $.extend(this, {
            'init': init
            ,'renderCodeInSectionTemplate': renderCodeInSectionTemplate
        });
    }

    $.codeInSection = new codeInSection();

}(jQuery));