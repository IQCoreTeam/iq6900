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

$(function(){
    $("#how_to_use").click(function(){
        window.open('https://iq6900.gitbook.io/iq6900', '_blank');
    });
});

$(document).ready(function() {
    const { txid } = getQueryParams();
    if (txid) {
        $.checkSection.init(txid);
    }else {
        $.codeInSection.init();
    }
});