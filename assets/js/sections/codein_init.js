$(function(){
    $("#go_codein").click(function(){
        if($(".code_title").is(':visible') == false)
        {
            $.codeInSection.init();
        }

    });
});

$(function(){
    $("#go_check").click(function(){
        if($(".check_title").is(':visible') == false)
        {
            $.checkSection.init();
        }

    });
});
$(document).ready(function() {
    $.codeInSection.init();
});