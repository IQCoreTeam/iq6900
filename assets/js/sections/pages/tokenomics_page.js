
(function($) {
    $.extend(true, window, {
        "tokenomics_page": tokenomicsPage
    });

    function tokenomicsPage() {
        let $tokenomicsPageElement;
        const $tokenomicsPageTemplateUrl = "./html/sections/tokenomics_page.html?ver=20260801a";

        function init() {
            loadTokenomicsPageTemplate();
        }

        function loadTokenomicsPageTemplate() {
            $.ajax({
                url: $tokenomicsPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $tokenomicsPageElement = $(templateData);
                    renderTokenomicsPageTemplate();
                }
            });
        }

        function renderTokenomicsPageTemplate() {
            // The redesigned tokenomics page carries its own sticky nav.
            $(".pc_menu").css("display", "none");
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($tokenomicsPageElement);
            $(window).scrollTop(0);
            if (window.initRdReveal) { window.initRdReveal('#main_section'); }
            if (window.initRdScrollSpy) { window.initRdScrollSpy('#rd_nav_links a[href^="#"], #rd_rail_links a[href^="#"]'); }
            if (window.iqLang) { window.iqLang.applySaved(); }
        }

        $.extend(this, {
            'init': init
        });
    }

    $.tokenomicsPage = new tokenomicsPage();

}(jQuery));
