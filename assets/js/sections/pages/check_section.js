(function($) {
    $.extend(true, window, {
        "check_section": checkSection
    });

    function checkSection() {
        let $checkSectionElement;
        let $wWidth = screen.width;
        const $checkSectionTemplateUrl = "./html/sections/check_code.html?ver=20241238";
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

        function renderCheckSectionTemplate(txid) {
            $("#web3_section").show();
            $("#web3_section").empty();
            $("#web3_section").append($checkSectionElement);
            if (txid != ''){
                transactionButton(txid)
            }
        }

        $.extend(this, {
            'init': init
            ,'renderCheckSectionTemplate': renderCheckSectionTemplate
        });
    }

    $.checkSection = new checkSection();

}(jQuery));