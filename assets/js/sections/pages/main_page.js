(function($) {
    $.extend(true, window, {
        "main_page": mainPage
    });

    function mainPage() {
        let $mainPageElement;
        let $wWidth = screen.width;
        const $mainPageTemplateUrl = "./html/sections/main_page.html?ver=20260731a";
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
            initRedesignReveal();
        }

        // Staggered rise for [data-reveal] blocks as they enter the viewport.
        // Progressive enhancement: elements stay visible if this never runs.
        function initRedesignReveal() {
            if (!('IntersectionObserver' in window)) return;
            var els = document.querySelectorAll('#main_section [data-reveal]');
            if (!els.length) return;
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    e.target.classList.add('rd-in');
                    io.unobserve(e.target);
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
            els.forEach(function (el) {
                el.style.transitionDelay = (parseInt(el.getAttribute('data-reveal'), 10) || 0) + 'ms';
                el.classList.add('rd-reveal');
                io.observe(el);
            });
        }

        $.extend(this, {
            'init': init
            ,'renderMainPageTemplate': renderMainPageTemplate
        });
    }

    $.mainPage = new mainPage();

}(jQuery));