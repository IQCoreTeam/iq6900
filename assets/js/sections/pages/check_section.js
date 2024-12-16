(function($) {
    $.extend(true, window, {
        "check_section": checkSection
    });

    function checkSection() {
        let $checkSectionElement;
        let $wWidth = screen.width;
        const $checkSectionTemplateUrl = "./html/sections/check_code.html?ver20241204";
        function init() {
            loadCheckSectionTemplate();
        }

        function loadCheckSectionTemplate() {
            $.ajax({
                url: $checkSectionTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $checkSectionElement = $(templateData);
                    renderCheckSectionTemplate()
                }
            });
        };

        function renderCheckSectionTemplate() {
            $("#web3_section").show();
            $("#web3_section").empty();
            $("#web3_section").append($checkSectionElement);
         
        }

        $.extend(this, {
            'init': init
            ,'renderCheckSectionTemplate': renderCheckSectionTemplate
        });
    }

    $.checkSection = new checkSection();

}(jQuery));