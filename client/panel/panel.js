Template.panel.rendered = function () {

    var openSidebar = function() {
        $('.panel').addClass('is-active');
        $('.mask').addClass('is-active');
        $('body').addClass('no-scroll');
        open = true;
    }
    var closeSidebar = function() {
        $('.panel').removeClass('is-active');
        $('.mask').removeClass('is-active');
        $('body').removeClass('no-scroll');
    }

    $('.menu').click(function(event) {
        event.stopPropagation();
        var toggle = open ? closeSidebar : openSidebar;
        openSidebar();
    });

    $('.close').click(function(event) {
        event.stopPropagation();
        closeSidebar();
    });

    $(document).click(function(event) {
        if (!$(event.target).closest('.panel').length) {
            closeSidebar();
        }
    });
};