
(function($) {
    $.extend(true, window, {
        "tokenomics_page": tokenomicsPage
    });

    function tokenomicsPage() {
        let $tokenomicsPageElement;
        let typingTimer = null;
        const $tokenomicsPageTemplateUrl = "./html/sections/tokenomics_page.html?ver=20260426k";

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
            $("#main_section").show();
            $("#main_section").empty();
            $("#main_section").append($tokenomicsPageElement);
            $(window).scrollTop(0);
            startTerminalTyping();
            wireAllocationBar();
        }

        function startTerminalTyping() {
            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
            }
            const $screen = $("#tk_terminal_lines");
            if ($screen.length === 0) return;

            const lines = [
                { text: "> SDK_FEES.STREAM",                cls: "tk_term_cmd" },
                { text: "  0.001 SOL  ............  Basic      < 850 bytes",       cls: "tk_term_row" },
                { text: "  0.003 SOL  ............  Standard   850 - 8500 bytes",  cls: "tk_term_row tk_term_active" },
                { text: "  0.005 SOL  ............  Large      > 8500 bytes",      cls: "tk_term_row" },
                { text: "> ROUTING.SOL",                    cls: "tk_term_cmd" },
                { text: "  40% buyback  /  45% treasury  /  10% community  /  5% liquidity", cls: "tk_term_row" },
                { text: "> STATUS",                         cls: "tk_term_cmd" },
                { text: "  every fee event makes the supply smaller.", cls: "tk_term_row tk_term_dim" }
            ];

            $screen.empty();
            const charDelay = 14;
            const lineGap = 220;
            let lineIdx = 0;

            function typeLine() {
                if (lineIdx >= lines.length) {
                    $screen.append('<span class="tk_term_caret">_</span>');
                    return;
                }
                const line = lines[lineIdx];
                const $line = $('<div class="' + line.cls + '"></div>');
                $screen.append($line);
                let charIdx = 0;
                function typeChar() {
                    if (charIdx <= line.text.length) {
                        $line.text(line.text.substring(0, charIdx));
                        charIdx++;
                        typingTimer = setTimeout(typeChar, charDelay);
                    } else {
                        lineIdx++;
                        typingTimer = setTimeout(typeLine, lineGap);
                    }
                }
                typeChar();
            }
            typeLine();
        }

        function wireAllocationBar() {
            const $segments = $(".tk_alloc_seg");
            const $cards = $(".tk_alloc_card");
            $segments.on("mouseenter focus", function () {
                const key = $(this).data("alloc");
                $segments.removeClass("tk_alloc_active");
                $cards.removeClass("tk_alloc_card_active");
                $(this).addClass("tk_alloc_active");
                $('.tk_alloc_card[data-alloc="' + key + '"]').addClass("tk_alloc_card_active");
            });
        }

        $.extend(this, {
            'init': init
        });
    }

    $.tokenomicsPage = new tokenomicsPage();

}(jQuery));
