Template.panel.rendered = function () {

    var openSidebar = function() {
        $('.panel').addClass('is-active');
        // $('.menu').addClass('is-active');
        // $('#menu').addClass('toggle-close');
        open = true;
    }
    var closeSidebar = function() {
        $('.panel').removeClass('is-active');
        // $('.menu').removeClass('is-active');
        // $('#menu').removeClass('toggle-close');
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