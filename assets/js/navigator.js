function navigator_on(){
    $('.nav_menu_arrow').attr('src', 'img/green_arrow.svg');
    $('.nav_menu_arrow').attr('onclick', 'navigator_off()');

    $('.navigator_menu').css('display','flex');
}
function navigator_off(){
    $('.nav_menu_arrow').attr('src', 'img/down.svg');
    $('.nav_menu_arrow').attr('onclick', 'navigator_on()');
    $('.navigator_menu').css('display','none');

}