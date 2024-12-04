(function($) {
    $.extend(true, window, {
        "effect": effect
    });

    function effect() {
        let $effectElement;
        let $wWidth = screen.width;
        const $effectTemplateUrl = "./html/sections/effect.html?ver20241204";
        function init() {
            loadEffectTemplate();
        }

        function loadEffectTemplate() {
            $.ajax({
                url: $effectTemplateUrl
                , dataType: 'html'
                , type: 'get'
                , global: false
                , success: function(templateData) {
                    $effectElement = $(templateData);
                    renderEffectTemplate()
                }
            });
        };

        function renderEffectTemplate() {

            $("#section").append($effectElement);
            var body = document.body,
                html = document.documentElement;

            var height = Math.max( body.scrollHeight, body.offsetHeight,
                html.clientHeight, html.scrollHeight, html.offsetHeight );
            $effectElement.height(height);

        }

        $.extend(this, {
            'init': init
            ,'renderEffectTemplate': renderEffectTemplate
        });
    }

    $.effect = new effect();

}(jQuery));