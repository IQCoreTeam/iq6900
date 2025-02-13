(function($) {
    $.extend(true, window, {
        "check_section": checkSection
    });

    function checkSection() {
        let $checkSectionElement;
        let $wWidth = screen.width;
        const $checkSectionTemplateUrl = "./html/sections/check_code.html?ver=20250213";
        function init(txid = '') {
            loadCheckSectionTemplate(txid);
        }

        function loadCheckSectionTemplate(txid) {
            $.ajax({
                url: $checkSectionTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $checkSectionElement = $(templateData);
                    renderCheckSectionTemplate(txid)
                }
            });
        };

        function renderCheckSectionTemplate(txid='') {
            $("#menu_section").show();
            $("#menu_section").empty();
            $("#menu_section").append($checkSectionElement);
            if (txid !== ''){
                // transactionButton(txid)
            }
        }

        $.extend(this, {
            'init': init
            ,'renderCheckSectionTemplate': renderCheckSectionTemplate
        });
    }

    $.checkSection = new checkSection();

}(jQuery));