(function($) {
    $.extend(true, window, {
        "main_page": mainPage
    });

    function mainPage() {
        let $mainPageElement;
        let $wWidth = screen.width;
        const $mainPageTemplateUrl = "./html/sections/main_page.html?ver=20260801b";
        function init() {
            loadMainPageTemplate();
        }

        function loadMainPageTemplate() {
            $.ajax({
                url: $mainPageTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $mainPageElement = $(templateData);
                    renderMainPageTemplate()
                }
            });
        };

        function renderMainPageTemplate() {
            // The ticker redesign carries its own sticky nav, so hide the shell
            // top bar while the landing is mounted. Other pages re-show it.
            $(".pc_menu").css("display", "none");
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($mainPageElement);
            if (window.initBroadcast) { try { window.initBroadcast(); } catch (e) { console.error(e); } }
            if (window.initRdReveal) { window.initRdReveal('#main_section'); }
            if (window.initRdScrollSpy) { window.initRdScrollSpy('#rd_nav_links a[href^="#"]'); }
            if (window.iqLang) { window.iqLang.applySaved(); }
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': renderMainPageTemplate
        });
    }

    $.mainPage = new mainPage();

}(jQuery));