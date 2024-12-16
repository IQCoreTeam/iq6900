
$(function(){
    $(".home_button").click(function(){
        if($("#main_page").length == 0)
        {
            $.mainPage.init();
        }

    });
});
